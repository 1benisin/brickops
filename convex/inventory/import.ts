/**
 * Inventory Import Pipeline
 *
 * This module implements the end-to-end flow for synchronizing inventory from
 * external marketplaces (BrickLink and BrickOwl) into BrickOps. The actions
 * defined here are intentionally verbose to make the data movement clear:
 *
 * - Validation actions scan the entire remote catalog and classify each lot.
 * - Import actions persist a user-selected subset of validated candidates.
 * - Helper utilities build the deterministic keys we use to detect duplicates,
 *   normalize third-party payloads, and ensure only business owners can execute
 *   the heavy import operations.
 */

// Authentication helper used to ensure only business owners can import.
import { getAuthUserId } from "@convex-dev/auth/server";
// Core Convex primitives for defining actions/internal mutations and types.
import { action, internalMutation, type ActionCtx } from "../_generated/server";
// Generated API references for calling other Convex functions.
import { api, internal } from "../_generated/api";
// Database model types leveraged throughout the import flow.
import type { Doc, Id } from "../_generated/dataModel";
// Convex validation utilities and error helpers.
import { ConvexError, v } from "convex/values";
// Response types from third-party marketplace clients.
import type { BLInventoryResponse } from "../marketplaces/bricklink/inventory/schema";
import { getBLInventories } from "../marketplaces/bricklink/inventory/actions";
import type { BOInventoryResponse, BOInventoryIdEntry } from "../marketplaces/brickowl/schema";
import { listInventories as listBrickOwlInventories } from "../marketplaces/brickowl/inventory/actions";
// Mappers that convert marketplace payloads into our internal inventory shape.
import { mapBlToConvexInventory } from "../marketplaces/bricklink/inventory/transformers";
import {
  mapBrickOwlConditionToConvex,
  mapBrickOwlToConvexInventory,
  resolveBrickOwlQuantity,
} from "../marketplaces/brickowl/storeMappers";
// Validators and TypeScript types used for request/response validation.
import {
  importSummaryValidator,
  inventoryImportValidationResultValidator,
  type AddInventoryItemArgs,
  type ImportSummary,
  type InventoryImportCandidate,
  type InventoryImportValidationResult,
} from "./validators";

interface OwnerContext {
  userId: Id<"users">;
  businessAccountId: Id<"businessAccounts">;
}

interface InventoryKeyData {
  key: string;
  location: string;
  lotKey?: string;
}

type MarketplaceLotInfo = {
  provider: "bricklink" | "brickowl";
  lotId: string;
};

function isBrickOwlLotForSale(record: BOInventoryResponse): boolean {
  const value = record.for_sale;
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value !== "0";
  }
  return value !== 0;
}

const BRICKOWL_ID_TYPE_PRIORITY: Record<string, number> = {
  item_no: 0,
  design_id: 1,
  part_num: 2,
  pattern_id: 3,
};

function getBrickOwlPartNumberCandidates(record: BOInventoryResponse): string[] {
  const entries: BOInventoryIdEntry[] = record.ids ?? [];
  if (entries.length === 0) {
    return [];
  }

  const priority = (type?: string) => {
    if (!type) {
      return Number.MAX_SAFE_INTEGER - 1;
    }
    const normalized = type.toLowerCase();
    return (
      BRICKOWL_ID_TYPE_PRIORITY[normalized] ??
      (normalized === "boid" ? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER - 2)
    );
  };

  const seen = new Set<string>();
  const candidates: string[] = [];
  const sorted = [...entries].sort((a, b) => priority(a.type) - priority(b.type));

  for (const entry of sorted) {
    const id = entry.id?.trim();
    if (!id) {
      continue;
    }
    const type = entry.type?.toLowerCase();
    if (type === "boid") {
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    candidates.push(id);
  }

  return candidates;
}

interface ExistingMaps {
  keyMap: Map<string, Id<"inventoryItems">>;
  bricklinkLotIds: Set<string>;
  brickowlLotIds: Set<string>;
}

type InventoryListItem = Doc<"inventoryItems">;

type ImportCandidateStatus = InventoryImportCandidate["status"];

interface InventoryImportIssue {
  code: string;
  message: string;
}

interface InventoryImportCandidateInternal extends InventoryImportCandidate {
  args?: AddInventoryItemArgs;
  key?: InventoryKeyData;
}

function createCandidateBase(
  provider: "bricklink" | "brickowl",
  candidateId: string,
  sourceId: string,
): InventoryImportCandidateInternal {
  return {
    candidateId,
    provider,
    sourceId,
    status: "ready",
    issues: [],
    preview: {},
  };
}

function addCandidateIssue(
  candidate: InventoryImportCandidateInternal,
  issue: InventoryImportIssue,
  status: ImportCandidateStatus,
) {
  candidate.issues.push(issue);
  if (candidate.status === "ready" || candidate.status === "skip-existing") {
    candidate.status = status;
  }
}

function markCandidateExisting(candidate: InventoryImportCandidateInternal) {
  if (candidate.status === "ready") {
    candidate.status = "skip-existing";
  }
  const hasExistingIssue = candidate.issues.some((issue) => issue.code === "inventory.existing");
  if (!hasExistingIssue) {
    candidate.issues.push({
      code: "inventory.existing",
      message: "Inventory item already exists in BrickOps.",
    });
  }
}

function toPublicCandidate(candidate: InventoryImportCandidateInternal): InventoryImportCandidate {
  const { args: _args, key: _key, ...publicCandidate } = candidate;
  return publicCandidate;
}

function summarizeValidationResult(
  provider: "bricklink" | "brickowl",
  totalRemote: number,
  candidates: InventoryImportCandidateInternal[],
): InventoryImportValidationResult {
  let readyCount = 0;
  let existingCount = 0;
  let invalidCount = 0;
  let unavailableCount = 0;

  for (const candidate of candidates) {
    switch (candidate.status) {
      case "ready":
        readyCount++;
        break;
      case "skip-existing":
        existingCount++;
        break;
      case "skip-invalid":
        invalidCount++;
        break;
      case "skip-unavailable":
        unavailableCount++;
        break;
      default:
        break;
    }
  }

  return {
    provider,
    totalRemote,
    readyCount,
    existingCount,
    invalidCount,
    unavailableCount,
    candidates: candidates.map(toPublicCandidate),
  };
}

/**
 * Ensures the caller is authenticated as a business owner and returns their context.
 * All import and preview flows rely on this guard to prevent unauthorized access.
 */
async function requireOwner(ctx: ActionCtx): Promise<OwnerContext> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const currentUser = await ctx.runQuery(api.users.queries.getCurrentUser, {});
  if (!currentUser?.user || !currentUser.businessAccount?._id) {
    throw new ConvexError("User is not associated with a business account");
  }
  if (currentUser.user.role !== "owner") {
    throw new ConvexError("Only business owners can import marketplace inventory");
  }

  return {
    userId,
    businessAccountId: currentUser.businessAccount._id,
  };
}

/**
 * Produces a deterministic key used to detect duplicate lots across imports.
 * Keys combine part number, color, condition, location, and optional marketplace lot info.
 */
function buildInventoryKey(
  partNumber: string,
  colorId: string,
  condition: "new" | "used",
  location: string,
  lotInfo?: MarketplaceLotInfo,
): string {
  const values = [
    partNumber.trim().toLowerCase(),
    colorId.trim(),
    condition,
    location.trim().toLowerCase(),
  ];

  if (lotInfo?.lotId) {
    values.push(lotInfo.provider, lotInfo.lotId.trim().toLowerCase());
  }

  return values.join("|");
}

/**
 * Builds lookup maps from existing inventory that allow quick duplicate detection.
 * Includes both base inventory keys and provider-specific lot identifiers.
 */
function buildExistingMaps(items: InventoryListItem[]): ExistingMaps {
  const keyMap = new Map<string, Id<"inventoryItems">>();
  const bricklinkLotIds = new Set<string>();
  const brickowlLotIds = new Set<string>();

  for (const item of items) {
    const location = item.location?.trim() ?? "";
    const baseKey = buildInventoryKey(item.partNumber, item.colorId, item.condition, location);
    keyMap.set(baseKey, item._id);

    const bricklinkLotId = item.marketplaceSync?.bricklink?.lotId;
    const normalizedBricklinkLotId =
      bricklinkLotId === undefined || bricklinkLotId === null ? "" : String(bricklinkLotId).trim();
    if (normalizedBricklinkLotId) {
      const lotId = normalizedBricklinkLotId;
      bricklinkLotIds.add(lotId);
      const lotKey = buildInventoryKey(item.partNumber, item.colorId, item.condition, location, {
        provider: "bricklink",
        lotId,
      });
      keyMap.set(lotKey, item._id);
    }

    const brickowlLotId = item.marketplaceSync?.brickowl?.lotId;
    const normalizedBrickowlLotId =
      brickowlLotId === undefined || brickowlLotId === null ? "" : String(brickowlLotId).trim();
    if (normalizedBrickowlLotId) {
      const lotId = normalizedBrickowlLotId;
      brickowlLotIds.add(lotId);
      const lotKey = buildInventoryKey(item.partNumber, item.colorId, item.condition, location, {
        provider: "brickowl",
        lotId,
      });
      keyMap.set(lotKey, item._id);
    }
  }

  return { keyMap, bricklinkLotIds, brickowlLotIds };
}

/**
 * Normalizes a BrickLink inventory record into an internal candidate.
 * The candidate captures preview metadata, duplicate status, and import arguments.
 */
function buildBricklinkCandidate(
  record: BLInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
  existingMaps: ExistingMaps,
): InventoryImportCandidateInternal {
  const inventoryId =
    record.inventory_id !== undefined && record.inventory_id !== null
      ? String(record.inventory_id)
      : undefined;
  const candidateId = `bricklink:${inventoryId ?? `${record.item.no}:${record.color_id ?? ""}`}`;
  const candidate = createCandidateBase("bricklink", candidateId, inventoryId ?? candidateId);

  const transformed = transformBricklinkRecord(record, businessAccountId);
  const location = transformed.key.location;
  const quantity = Number(record.quantity ?? transformed.args.quantityAvailable ?? 0);
  const lotKey = transformed.key.lotKey;

  candidate.preview = {
    partNumber: transformed.args.partNumber,
    colorId: transformed.args.colorId,
    name: transformed.args.name,
    condition: transformed.args.condition,
    quantity,
    location,
    lotId: inventoryId,
  };

  const unavailable = quantity <= 0;
  if (unavailable) {
    addCandidateIssue(
      candidate,
      {
        code: "quantity.unavailable",
        message: "Inventory quantity is zero or negative.",
      },
      "skip-unavailable",
    );
  }

  const keyExists = lotKey
    ? existingMaps.keyMap.has(lotKey)
    : existingMaps.keyMap.has(transformed.key.key);
  const lotExists = inventoryId ? existingMaps.bricklinkLotIds.has(inventoryId) : false;

  if (keyExists || lotExists) {
    markCandidateExisting(candidate);
  }

  if (candidate.status === "ready") {
    candidate.args = transformed.args;
    candidate.key = transformed.key;
  }

  return candidate;
}

/**
 * Normalizes a BrickOwl inventory record into an internal candidate.
 * Performs asynchronous lookups to resolve catalog data and persist mappings when requested.
 */
async function buildBrickOwlCandidate(
  ctx: ActionCtx,
  record: BOInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
  existingMaps: ExistingMaps,
  options: { persistMapping: boolean },
): Promise<InventoryImportCandidateInternal> {
  const lotId =
    record.lot_id !== undefined && record.lot_id !== null
      ? String(record.lot_id).trim()
      : undefined;
  const sourceId = lotId ?? record.boid ?? "unknown";
  const candidateId = `brickowl:${sourceId}`;
  const candidate = createCandidateBase("brickowl", candidateId, sourceId);

  const quantity = resolveBrickOwlQuantity(record);
  const location = record.personal_note?.trim() ?? "";
  const condition =
    typeof record.condition === "string"
      ? mapBrickOwlConditionToConvex(record.condition)
      : "unknown";

  candidate.preview = {
    partNumber: undefined,
    colorId: undefined,
    condition,
    quantity,
    location,
    lotId,
    additionalInfo: record.boid
      ? [
          {
            label: "BOID",
            value: record.boid,
          },
        ]
      : undefined,
  };

  if (!record.boid) {
    addCandidateIssue(
      candidate,
      {
        code: "catalog.boid_missing",
        message: "BrickOwl record lacks a BOID identifier.",
      },
      "skip-invalid",
    );
    return candidate;
  }

  if (quantity <= 0) {
    addCandidateIssue(
      candidate,
      {
        code: "quantity.unavailable",
        message: "Inventory quantity is zero or negative.",
      },
      "skip-unavailable",
    );
  }

  if (!isBrickOwlLotForSale(record)) {
    addCandidateIssue(
      candidate,
      {
        code: "listing.inactive",
        message: "BrickOwl lot is not currently for sale.",
      },
      "skip-unavailable",
    );
  }

  const transformed = await transformBrickOwlRecord(ctx, record, businessAccountId, {
    persistMapping: options.persistMapping,
  });

  if (!transformed) {
    addCandidateIssue(
      candidate,
      {
        code: "catalog.part_missing",
        message: "Unable to map BrickOwl record to a catalog part.",
      },
      "skip-invalid",
    );
    return candidate;
  }

  candidate.preview.partNumber = transformed.partNumber;
  candidate.preview.colorId = transformed.args.colorId;
  candidate.preview.name = transformed.args.name ?? candidate.preview.name;

  const lotKey = transformed.key.lotKey;
  const keyExists = lotKey
    ? existingMaps.keyMap.has(lotKey)
    : existingMaps.keyMap.has(transformed.key.key);
  const lotExists = lotId ? existingMaps.brickowlLotIds.has(lotId) : false;

  if (keyExists || lotExists) {
    markCandidateExisting(candidate);
  }

  if (transformed.warnings.length > 0) {
    for (const warning of transformed.warnings) {
      addCandidateIssue(
        candidate,
        {
          code: warning.includes("color") ? "catalog.color_missing" : "catalog.warning",
          message: warning,
        },
        "skip-invalid",
      );
    }
  }

  if (candidate.status === "ready") {
    candidate.args = transformed.args;
    candidate.key = transformed.key;
  }

  return candidate;
}

/**
 * Converts a BrickLink inventory payload into the arguments required to create an inventory item.
 * Returns both the candidate arguments and the keys used for deduplication.
 */
function transformBricklinkRecord(
  record: BLInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
): { args: AddInventoryItemArgs; key: InventoryKeyData } {
  const base = mapBlToConvexInventory(record, businessAccountId);
  const location = base.location?.trim() ?? "";

  const quantityAvailable = Math.max(
    typeof record.quantity === "number" ? record.quantity : base.quantityAvailable ?? 0,
    0,
  );

  return {
    args: {
      name: base.name ?? record.item.name ?? base.partNumber,
      partNumber: base.partNumber,
      colorId: base.colorId,
      location,
      quantityAvailable,
      quantityReserved: base.quantityReserved ?? 0,
      condition: base.condition,
      price: base.price,
      notes: base.notes,
    },
    key: {
      key: buildInventoryKey(base.partNumber, base.colorId, base.condition, location),
      lotKey:
        record.inventory_id !== undefined && record.inventory_id !== null
          ? buildInventoryKey(base.partNumber, base.colorId, base.condition, location, {
              provider: "bricklink",
              lotId: String(record.inventory_id),
            })
          : undefined,
      location,
    },
  };
}

interface TransformBrickOwlOptions {
  persistMapping?: boolean;
}

/**
 * Converts a BrickOwl inventory payload into import arguments, resolving catalog references.
 * Also optionally persists BOID mappings to speed up subsequent imports.
 */
async function transformBrickOwlRecord(
  ctx: ActionCtx,
  record: BOInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
  options: TransformBrickOwlOptions = {},
): Promise<{
  args: AddInventoryItemArgs;
  key: InventoryKeyData;
  partNumber: string;
  warnings: string[];
} | null> {
  const brickowlBoid = record.boid;
  if (!brickowlBoid) {
    return null;
  }

  const boidSegments = brickowlBoid.split("-");
  const canonicalBrickowlId = boidSegments[0] ?? brickowlBoid;
  const boidColorSuffix = boidSegments.length > 1 ? boidSegments[boidSegments.length - 1] : null;

  let part = await ctx.runQuery(internal.catalog.queries.getPartByBrickowlId, {
    brickowlId: canonicalBrickowlId,
  });

  if (!part?.no && canonicalBrickowlId !== brickowlBoid) {
    part = await ctx.runQuery(internal.catalog.queries.getPartByBrickowlId, {
      brickowlId: brickowlBoid,
    });
  }

  const warnings: string[] = [];
  let shouldClearPartMapping = false;

  if (!part?.no) {
    const bricklinkCandidates =
      (await ctx.runAction(internal.catalog.actions.getBricklinkPartIdsFromBrickowl, {
        brickowlId: canonicalBrickowlId,
      })) ?? [];

    for (const candidate of bricklinkCandidates) {
      const lookup = await ctx.runQuery(internal.catalog.queries.getPartInternal, {
        partNumber: candidate,
      });
      if (lookup?.no) {
        part = lookup;
        break;
      }
    }

    if (!part?.no) {
      warnings.push(`Unable to map BrickOwl lot ${canonicalBrickowlId} via Rebrickable`);
      shouldClearPartMapping = true;
    }
  }

  if (!part?.no) {
    const fallbackCandidates = getBrickOwlPartNumberCandidates(record);
    for (const candidate of fallbackCandidates) {
      const lookup = await ctx.runQuery(internal.catalog.queries.getPartInternal, {
        partNumber: candidate,
      });
      if (lookup?.no) {
        part = lookup;
        break;
      }
    }
  }

  if (!part?.no) {
    return null;
  }

  const persistentBrickowlId = shouldClearPartMapping ? "" : canonicalBrickowlId;

  let bricklinkColorId = "0";
  let brickowlColorIdRaw: number | string | null | undefined = record.color_id as
    | number
    | string
    | null
    | undefined;

  if (brickowlColorIdRaw === undefined || brickowlColorIdRaw === null) {
    if (boidColorSuffix && /^\d+$/.test(boidColorSuffix)) {
      brickowlColorIdRaw = Number.parseInt(boidColorSuffix, 10);
    }
  }

  if (brickowlColorIdRaw !== undefined && brickowlColorIdRaw !== null) {
    const numericColorId =
      typeof brickowlColorIdRaw === "string"
        ? Number.parseInt(brickowlColorIdRaw, 10)
        : brickowlColorIdRaw;

    if (!Number.isNaN(numericColorId)) {
      const color = await ctx.runQuery(internal.catalog.queries.getColorByBrickowlColorId, {
        brickowlColorId: numericColorId,
      });
      if (color?.colorId !== undefined) {
        bricklinkColorId = String(color.colorId);
      } else {
        warnings.push(`Unable to map BrickOwl color ${numericColorId}`);
      }
    } else {
      warnings.push("BrickOwl color identifier was not numeric");
    }
  }

  const base = mapBrickOwlToConvexInventory(record, businessAccountId);
  const location = base.location?.trim() ?? "";
  const resolvedQuantity = resolveBrickOwlQuantity(record);
  const quantityAvailable = Math.max(resolvedQuantity ?? base.quantityAvailable ?? 0, 0);

  if (shouldClearPartMapping && options.persistMapping) {
    await ctx.runMutation(internal.catalog.mutations.updatePartBrickowlId, {
      partNumber: part.no,
      brickowlId: "",
    });
  }

  if (
    options.persistMapping &&
    part &&
    (part.brickowlId === undefined ||
      part.brickowlId === "" ||
      part.brickowlId === canonicalBrickowlId ||
      part.brickowlId === brickowlBoid)
  ) {
    if (part.brickowlId !== persistentBrickowlId) {
      // Persist the successful BOID match onto the catalog so future imports
      // can skip the fallback heuristic and rely on the indexed lookup.
      await ctx.runMutation(internal.catalog.mutations.updatePartBrickowlId, {
        partNumber: part.no,
        brickowlId: persistentBrickowlId,
      });
      part = {
        ...part,
        brickowlId: persistentBrickowlId,
      };
    }
  }

  return {
    args: {
      name: part.name ?? base.name ?? `Part ${part.no}`,
      partNumber: part.no,
      colorId: bricklinkColorId,
      location,
      quantityAvailable,
      quantityReserved: base.quantityReserved ?? 0,
      condition: base.condition,
      price: base.price,
      notes: base.notes,
    },
    key: {
      key: buildInventoryKey(part.no, bricklinkColorId, base.condition, location),
      lotKey:
        record.lot_id !== undefined && record.lot_id !== null && String(record.lot_id).trim()
          ? buildInventoryKey(part.no, bricklinkColorId, base.condition, location, {
              provider: "brickowl",
              lotId: String(record.lot_id),
            })
          : undefined,
      location,
    },
    partNumber: part.no,
    warnings,
  };
}

/**
 * Adds a user-visible error entry to the import summary.
 * Errors roll up per source identifier so the UI can surface actionable feedback.
 */
function appendError(summary: ImportSummary, identifier: string, message: string) {
  summary.errors.push({ identifier, message });
}

/**
 * Scan the entire BrickLink inventory and classify each entry.
 * Results inform which candidates the UI should offer for importing.
 */
export const validateBricklinkImport = action({
  args: {},
  returns: inventoryImportValidationResultValidator,
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    // get all bricklink inventories for the business account
    const records = await getBLInventories(ctx);

    const candidates: InventoryImportCandidateInternal[] = [];

    for (const record of records) {
      const candidate = buildBricklinkCandidate(record, businessAccountId, existingMaps);
      candidates.push(candidate);
    }

    return summarizeValidationResult("bricklink", records.length, candidates);
  },
});

/**
 * Scan the entire BrickOwl inventory and classify each entry.
 * Unlike BrickLink, this fetches a single bulk list from the BrickOwl client.
 */
export const validateBrickowlImport = action({
  args: {},
  returns: inventoryImportValidationResultValidator,
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const inventories = (await listBrickOwlInventories(ctx, {
      businessAccountId,
      filters: { active_only: true },
    })) as unknown as BOInventoryResponse[];

    const candidates: InventoryImportCandidateInternal[] = [];

    for (const record of inventories) {
      const candidate = await buildBrickOwlCandidate(ctx, record, businessAccountId, existingMaps, {
        persistMapping: false,
      });
      candidates.push(candidate);
    }

    return summarizeValidationResult("brickowl", inventories.length, candidates);
  },
});

/**
 * Persist a user-selected subset of BrickLink candidates.
 * Applies duplicate detection, records errors, and surfaces summary metrics.
 */
export const importBricklinkInventory = action({
  args: {
    candidateIds: v.array(v.string()),
  },
  returns: importSummaryValidator,
  handler: async (ctx, args) => {
    if (args.candidateIds.length === 0) {
      throw new ConvexError("No BrickLink candidates selected for import");
    }

    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const inventories = await getBLInventories(ctx);

    const selectedCandidateIds = new Set(args.candidateIds);

    const summary: ImportSummary = {
      provider: "bricklink",
      imported: 0,
      skippedExisting: 0,
      skippedUnavailable: 0,
      skippedInvalid: 0,
      totalRemote: inventories.length,
      errors: [],
    };

    for (const record of inventories) {
      const candidate = buildBricklinkCandidate(record, businessAccountId, existingMaps);

      if (!selectedCandidateIds.has(candidate.candidateId)) {
        continue;
      }

      selectedCandidateIds.delete(candidate.candidateId);

      if (candidate.status === "skip-existing") {
        summary.skippedExisting++;
        continue;
      }

      if (candidate.status === "skip-unavailable") {
        summary.skippedUnavailable++;
        continue;
      }

      if (candidate.status === "skip-invalid") {
        summary.skippedInvalid++;
        if (candidate.issues.length > 0) {
          appendError(
            summary,
            candidate.sourceId,
            candidate.issues[0]?.message ?? "Invalid candidate",
          );
        }
        continue;
      }

      if (!candidate.args || !candidate.key) {
        summary.skippedInvalid++;
        appendError(summary, candidate.sourceId, "Candidate is missing import data");
        continue;
      }

      try {
        const itemId = await ctx.runMutation(
          api.inventory.mutations.addInventoryItem,
          candidate.args,
        );
        existingMaps.keyMap.set(candidate.key.key, itemId);
        if (candidate.key.lotKey) {
          existingMaps.keyMap.set(candidate.key.lotKey, itemId);
        }

        summary.imported++;
      } catch (error) {
        summary.skippedInvalid++;
        appendError(
          summary,
          candidate.sourceId,
          error instanceof Error ? error.message : "Unknown error during import",
        );
      }
    }

    if (selectedCandidateIds.size > 0) {
      const missingIds = Array.from(selectedCandidateIds).slice(0, 5).join(", ");
      throw new ConvexError(
        `Some selected BrickLink candidates were not found in the latest import: ${missingIds}${
          selectedCandidateIds.size > 5 ? ", ..." : ""
        }`,
      );
    }

    return summary;
  },
});

/**
 * Persist a user-selected subset of BrickOwl candidates.
 * Handles BrickOwl-specific bookkeeping (e.g., BOID persistence, marketplace sync state).
 */
export const importBrickowlInventory = action({
  args: {
    candidateIds: v.array(v.string()),
  },
  returns: importSummaryValidator,
  handler: async (ctx, args) => {
    if (args.candidateIds.length === 0) {
      throw new ConvexError("No BrickOwl candidates selected for import");
    }

    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const inventories = (await listBrickOwlInventories(ctx, {
      businessAccountId,
      filters: { active_only: true },
    })) as unknown as BOInventoryResponse[];

    const summary: ImportSummary = {
      provider: "brickowl",
      imported: 0,
      skippedExisting: 0,
      skippedUnavailable: 0,
      skippedInvalid: 0,
      totalRemote: inventories.length,
      errors: [],
    };

    const selectedCandidateIds = new Set(args.candidateIds);

    for (const record of inventories) {
      const candidate = await buildBrickOwlCandidate(ctx, record, businessAccountId, existingMaps, {
        persistMapping: true,
      });

      if (!selectedCandidateIds.has(candidate.candidateId)) {
        continue;
      }

      selectedCandidateIds.delete(candidate.candidateId);

      if (candidate.status === "skip-existing") {
        summary.skippedExisting++;
        continue;
      }

      if (candidate.status === "skip-unavailable") {
        summary.skippedUnavailable++;
        continue;
      }

      if (candidate.status === "skip-invalid") {
        summary.skippedInvalid++;
        if (candidate.issues.length > 0) {
          appendError(
            summary,
            candidate.sourceId,
            candidate.issues[0]?.message ?? "Invalid candidate",
          );
        }
        continue;
      }

      if (!candidate.args || !candidate.key) {
        summary.skippedInvalid++;
        appendError(summary, candidate.sourceId, "Candidate is missing import data");
        continue;
      }

      try {
        const itemId = await ctx.runMutation(
          api.inventory.mutations.addInventoryItem,
          candidate.args,
        );
        existingMaps.keyMap.set(candidate.key.key, itemId);
        if (candidate.key.lotKey) {
          existingMaps.keyMap.set(candidate.key.lotKey, itemId);
        }
        if (candidate.preview.lotId) {
          existingMaps.brickowlLotIds.add(candidate.preview.lotId);
        }
        summary.imported++;

        const marketplaceLotId =
          record.lot_id !== undefined && record.lot_id !== null ? String(record.lot_id).trim() : "";

        await ctx.runMutation(internal.inventory.import.markMarketplaceImported, {
          itemId,
          provider: "brickowl",
          marketplaceId: marketplaceLotId,
          quantityAvailable: candidate.args.quantityAvailable,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendError(summary, candidate.sourceId, message);
      }
    }

    if (selectedCandidateIds.size > 0) {
      const missingIds = Array.from(selectedCandidateIds).slice(0, 5).join(", ");
      throw new ConvexError(
        `Some selected BrickOwl candidates were not found in the latest import: ${missingIds}${
          selectedCandidateIds.size > 5 ? ", ..." : ""
        }`,
      );
    }

    return summary;
  },
});

/**
 * Internal helper invoked after importing an item to sync marketplace metadata.
 * Updates per-provider lot IDs, clears outbox entries, and records the latest ledger sequence.
 */
export const markMarketplaceImported = internalMutation({
  args: {
    itemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    marketplaceId: v.string(),
    quantityAvailable: v.number(),
  },
  handler: async (ctx, args) => {
    // Stop if the inventory item was deleted before we could mark it as synced.
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      return;
    }

    // Start from the stored sync metadata so we only update the fields we manage here.
    const now = Date.now();
    const currentSync = item.marketplaceSync ?? {};
    const providerSync = (currentSync[args.provider] ?? {}) as Record<string, unknown>;

    // Capture the latest inventory ledger entry so we can track which sequence was synced.
    const lastLedger = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .first();

    const previousSyncedSeq =
      typeof providerSync.lastSyncedSeq === "number" ? providerSync.lastSyncedSeq : undefined;

    const trimmedMarketplaceId = args.marketplaceId.trim();
    const { lotId: _previousLotId, ...providerSyncWithoutLot } = providerSync;

    // BrickLink lot IDs are numeric; BrickOwl lot IDs are opaque strings.
    let nextLotId: string | number | undefined;
    if (args.provider === "bricklink") {
      const parsed = Number.parseInt(trimmedMarketplaceId, 10);
      nextLotId = Number.isFinite(parsed) ? parsed : undefined;
    } else if (trimmedMarketplaceId) {
      nextLotId = trimmedMarketplaceId;
    }

    const updatedProviderSync = {
      ...providerSyncWithoutLot,
      status: "synced" as const,
      lastSyncAttempt: now,
      error: undefined,
      ...(nextLotId !== undefined ? { lotId: nextLotId } : {}),
      lastSyncedSeq: lastLedger?.seq ?? previousSyncedSeq,
      lastSyncedAvailable: args.quantityAvailable,
    };

    // Remove any queued marketplace sync messages that are now outdated.
    const pendingOutbox = await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_item_provider_time", (q) =>
        q.eq("itemId", args.itemId).eq("provider", args.provider),
      )
      .collect();

    for (const message of pendingOutbox) {
      await ctx.db.delete(message._id);
    }

    // Persist the updated sync state back onto the inventory item.
    await ctx.db.patch(args.itemId, {
      marketplaceSync: {
        ...currentSync,
        [args.provider]: updatedProviderSync,
      },
    });
  },
});
