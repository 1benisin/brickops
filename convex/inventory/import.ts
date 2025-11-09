import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import {
  createBricklinkStoreClient,
  createBrickOwlStoreClient,
} from "../marketplaces/shared/helpers";
import type { BricklinkInventoryResponse } from "../marketplaces/bricklink/storeClient";
import type {
  BrickOwlInventoryResponse,
  BrickOwlInventoryIdEntry,
} from "../marketplaces/brickowl/storeClient";
import { mapBricklinkToConvexInventory } from "../marketplaces/bricklink/storeMappers";
import {
  mapBrickOwlConditionToConvex,
  mapBrickOwlToConvexInventory,
  resolveBrickOwlQuantity,
} from "../marketplaces/brickowl/storeMappers";
import {
  importSummaryValidator,
  bricklinkPreviewResultValidator,
  brickowlPreviewResultValidator,
  type AddInventoryItemArgs,
  type ImportSummary,
  type BricklinkPreviewResult,
  type BrickowlPreviewResult,
} from "./validators";

const DEFAULT_PREVIEW_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

interface OwnerContext {
  userId: Id<"users">;
  businessAccountId: Id<"businessAccounts">;
}

interface InventoryKeyData {
  key: string;
  location: string;
}

function isBrickOwlLotForSale(record: BrickOwlInventoryResponse): boolean {
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

function getBrickOwlPartNumberCandidates(record: BrickOwlInventoryResponse): string[] {
  const entries: BrickOwlInventoryIdEntry[] = record.ids ?? [];
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

function normalizeLocation(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "UNASSIGNED";
  }
  return trimmed;
}

function buildInventoryKey(
  partNumber: string,
  colorId: string,
  condition: "new" | "used",
  location: string,
): string {
  return [
    partNumber.trim().toLowerCase(),
    colorId.trim(),
    condition,
    location.trim().toLowerCase(),
  ].join("|");
}

function buildExistingMaps(items: InventoryListItem[]): ExistingMaps {
  const keyMap = new Map<string, Id<"inventoryItems">>();
  const bricklinkLotIds = new Set<string>();
  const brickowlLotIds = new Set<string>();

  for (const item of items) {
    const location = normalizeLocation(item.location);
    const key = buildInventoryKey(item.partNumber, item.colorId, item.condition, location);
    keyMap.set(key, item._id);

    const bricklinkLotId = item.marketplaceSync?.bricklink?.lotId;
    if (typeof bricklinkLotId === "number") {
      bricklinkLotIds.add(String(bricklinkLotId));
    }

    const brickowlLotId = item.marketplaceSync?.brickowl?.lotId;
    if (brickowlLotId) {
      brickowlLotIds.add(String(brickowlLotId));
    }
  }

  return { keyMap, bricklinkLotIds, brickowlLotIds };
}

function transformBricklinkRecord(
  record: BricklinkInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
): { args: AddInventoryItemArgs; key: InventoryKeyData } {
  const base = mapBricklinkToConvexInventory(record, businessAccountId);
  const location = normalizeLocation(base.location);

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
      location,
    },
  };
}

interface TransformBrickOwlOptions {
  persistMapping?: boolean;
}

async function transformBrickOwlRecord(
  ctx: ActionCtx,
  record: BrickOwlInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
  options: TransformBrickOwlOptions = {},
): Promise<{
  args: AddInventoryItemArgs;
  key: InventoryKeyData;
  partNumber: string;
  warning?: string;
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
  const location = normalizeLocation(base.location);
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
      location,
    },
    partNumber: part.no,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function appendError(summary: ImportSummary, identifier: string, message: string) {
  summary.errors.push({ identifier, message });
}

export const previewBricklinkInventory = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: bricklinkPreviewResultValidator,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_PREVIEW_LIMIT, MAX_PAGE_SIZE));

    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const client = await createBricklinkStoreClient(ctx, businessAccountId);
    const { items } = await client.getInventoriesPage({ page: 1, pageSize: limit });

    const preview: BricklinkPreviewResult["items"] = items.slice(0, limit).map((record) => {
      const transformed = transformBricklinkRecord(record, businessAccountId);
      const exists =
        existingMaps.keyMap.has(transformed.key.key) ||
        existingMaps.bricklinkLotIds.has(String(record.inventory_id));

      return {
        inventoryId: record.inventory_id,
        partNumber: record.item.no,
        name: record.item.name,
        colorId: String(record.color_id),
        condition: record.new_or_used === "N" ? "new" : "used",
        quantity: Number(record.quantity ?? 0),
        location: transformed.key.location,
        exists,
      };
    });

    return {
      provider: "bricklink" as const,
      previewCount: preview.length,
      totalRemote: items.length,
      items: preview,
    };
  },
});

export const previewBrickowlInventory = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: brickowlPreviewResultValidator,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_PREVIEW_LIMIT, MAX_PAGE_SIZE));

    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const client = await createBrickOwlStoreClient(ctx, businessAccountId);
    const inventories = await client.getInventories({ active_only: true });
    const sample = inventories.slice(0, limit);

    const preview: BrickowlPreviewResult["items"] = await Promise.all(
      sample.map(async (record) => {
        const transformed = await transformBrickOwlRecord(ctx, record, businessAccountId);
        const key = transformed?.key.key;
        const exists =
          (key ? existingMaps.keyMap.has(key) : false) ||
          (record.lot_id ? existingMaps.brickowlLotIds.has(String(record.lot_id)) : false);

        const condition =
          transformed?.args.condition ??
          (typeof record.condition === "string"
            ? mapBrickOwlConditionToConvex(record.condition)
            : "unknown");

        return {
          lotId: record.lot_id ? String(record.lot_id) : undefined,
          boid: record.boid,
          partNumber: transformed?.partNumber,
          colorId: transformed?.args.colorId,
          condition,
          quantity: resolveBrickOwlQuantity(record),
          location: transformed?.key.location ?? normalizeLocation(record.personal_note),
          exists,
        };
      }),
    );

    return {
      provider: "brickowl" as const,
      previewCount: preview.length,
      totalRemote: inventories.length,
      items: preview,
    };
  },
});

export const importBricklinkInventory = action({
  args: {
    pageSize: v.optional(v.number()),
  },
  returns: importSummaryValidator,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const client = await createBricklinkStoreClient(ctx, businessAccountId);
    const pageSize = Math.max(1, Math.min(args.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

    const summary: ImportSummary = {
      provider: "bricklink",
      imported: 0,
      skippedExisting: 0,
      skippedUnavailable: 0,
      totalRemote: 0,
      errors: [],
    };

    for (let page = 1; ; page++) {
      const { items } = await client.getInventoriesPage({ page, pageSize });
      if (items.length === 0) {
        break;
      }
      summary.totalRemote += items.length;

      for (const record of items) {
        if ((record.quantity ?? 0) <= 0) {
          summary.skippedUnavailable++;
          continue;
        }

        const transformed = transformBricklinkRecord(record, businessAccountId);
        if (
          existingMaps.keyMap.has(transformed.key.key) ||
          existingMaps.bricklinkLotIds.has(String(record.inventory_id))
        ) {
          summary.skippedExisting++;
          continue;
        }

        try {
          const itemId = await ctx.runMutation(
            api.inventory.mutations.addInventoryItem,
            transformed.args,
          );
          existingMaps.keyMap.set(transformed.key.key, itemId);
          existingMaps.bricklinkLotIds.add(String(record.inventory_id));
          summary.imported++;

          await ctx.runMutation(internal.inventory.import.markMarketplaceImported, {
            itemId,
            provider: "bricklink",
            marketplaceId: String(record.inventory_id),
            quantityAvailable: transformed.args.quantityAvailable,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendError(summary, String(record.inventory_id), message);
        }
      }

      if (items.length < pageSize) {
        break;
      }
    }

    return summary;
  },
});

export const importBrickowlInventory = action({
  args: {},
  returns: importSummaryValidator,
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);
    const existingItems = await ctx.runQuery(api.inventory.queries.listInventoryItems, {});
    const existingMaps = buildExistingMaps(existingItems);

    const client = await createBrickOwlStoreClient(ctx, businessAccountId);
    const inventories = await client.getInventories({ active_only: true });

    const summary: ImportSummary = {
      provider: "brickowl",
      imported: 0,
      skippedExisting: 0,
      skippedUnavailable: 0,
      totalRemote: inventories.length,
      errors: [],
    };

    for (const record of inventories) {
      const quantity = resolveBrickOwlQuantity(record);
      if (quantity <= 0 || !isBrickOwlLotForSale(record)) {
        summary.skippedUnavailable++;
        continue;
      }

      const transformed = await transformBrickOwlRecord(ctx, record, businessAccountId, {
        persistMapping: true,
      });
      if (!transformed) {
        appendError(
          summary,
          record.lot_id ? String(record.lot_id) : record.boid,
          "Unable to map BrickOwl record to BrickLink catalog",
        );
        continue;
      }

      if (transformed.warning) {
        appendError(
          summary,
          record.lot_id ? String(record.lot_id) : record.boid,
          transformed.warning,
        );
      }

      if (
        existingMaps.keyMap.has(transformed.key.key) ||
        (record.lot_id && existingMaps.brickowlLotIds.has(String(record.lot_id)))
      ) {
        summary.skippedExisting++;
        continue;
      }

      try {
        const itemId = await ctx.runMutation(
          api.inventory.mutations.addInventoryItem,
          transformed.args,
        );
        existingMaps.keyMap.set(transformed.key.key, itemId);
        if (record.lot_id) {
          existingMaps.brickowlLotIds.add(String(record.lot_id));
        }
        summary.imported++;

        await ctx.runMutation(internal.inventory.import.markMarketplaceImported, {
          itemId,
          provider: "brickowl",
          marketplaceId: record.lot_id ?? transformed.partNumber,
          quantityAvailable: transformed.args.quantityAvailable,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendError(summary, record.lot_id ? String(record.lot_id) : record.boid, message);
      }
    }

    return summary;
  },
});

export const markMarketplaceImported = internalMutation({
  args: {
    itemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    marketplaceId: v.string(),
    quantityAvailable: v.number(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      return;
    }

    const now = Date.now();
    const currentSync = item.marketplaceSync ?? {};
    const providerSync = (currentSync[args.provider] ?? {}) as Record<string, unknown>;

    const lastLedger = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .first();

    const previousSyncedSeq =
      typeof providerSync.lastSyncedSeq === "number" ? providerSync.lastSyncedSeq : undefined;

    const updatedProviderSync = {
      ...providerSync,
      status: "synced" as const,
      lastSyncAttempt: now,
      error: undefined,
      lotId:
        args.provider === "bricklink"
          ? Number.parseInt(args.marketplaceId, 10)
          : args.marketplaceId,
      lastSyncedSeq: lastLedger?.seq ?? previousSyncedSeq,
      lastSyncedAvailable: args.quantityAvailable,
    };

    // Clear any pending outbox messages for this item/provider to avoid double-syncing.
    const pendingOutbox = await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_item_provider_time", (q) =>
        q.eq("itemId", args.itemId).eq("provider", args.provider),
      )
      .collect();

    for (const message of pendingOutbox) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.patch(args.itemId, {
      marketplaceSync: {
        ...currentSync,
        [args.provider]: updatedProviderSync,
      },
    });
  },
});
