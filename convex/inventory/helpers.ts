import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, DatabaseReader, DatabaseWriter, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { requireActiveUser, type RequireUserReturn } from "../users/authorization";

type Ctx = QueryCtx | MutationCtx;

/**
 * Helper to get current timestamp
 */
export const now = () => Date.now();

/**
 * Require authenticated and active user with business account
 * Helper function - not a Convex function
 * Returns user with guaranteed businessAccountId
 */
export async function requireUser(ctx: Ctx): Promise<RequireUserReturn> {
  return requireActiveUser(ctx);
}

/**
 * Assert that user belongs to the specified business account
 * Helper function - not a Convex function
 */
export function assertBusinessMembership(user: Doc<"users">, businessAccountId: string) {
  if (user.businessAccountId !== businessAccountId) {
    throw new ConvexError("User cannot modify another business account");
  }
}

/**
 * Phase 1: Sequence tracking helpers
 */

/**
 * Get the next sequence number for an item
 * Returns 1 for the first entry, then increments
 */
export async function getNextSeqForItem(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<number> {
  const lastEntry = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();

  return lastEntry ? lastEntry.seq + 1 : 1;
}

/**
 * Get the current available quantity from latest ledger entry
 * Falls back to 0 if no ledger entries exist
 */
export async function getCurrentAvailableFromLedger(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<number> {
  const lastEntry = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();

  return lastEntry?.postAvailable ?? 0;
}

/**
 * Phase 2: Outbox and delta computation helpers
 */

/**
 * Get the lastSyncedSeq for a provider (defaults to 0 if never synced)
 */
export async function getLastSyncedSeq(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: "bricklink" | "brickowl",
): Promise<number> {
  const item = await db.get(itemId);
  if (!item) throw new Error("Item not found");

  const cursor = item.marketplaceSync?.[provider]?.lastSyncedSeq;
  return cursor ?? 0;
}

/**
 * Compute delta for a ledger sequence window
 * Returns sum of deltaAvailable for entries in range (fromSeqExclusive, toSeqInclusive]
 */
export async function computeDeltaFromWindow(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  fromSeqExclusive: number,
  toSeqInclusive: number,
): Promise<number> {
  const entries = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) =>
      q.eq("itemId", itemId).gt("seq", fromSeqExclusive).lte("seq", toSeqInclusive),
    )
    .collect();

  return entries.reduce((acc, entry) => acc + entry.deltaAvailable, 0);
}

/**
 * Check if inventory should be synced to a marketplace provider
 * Returns true if credentials exist, are active, and inventory sync is enabled
 */
export async function shouldSyncInventoryToMarketplace(
  db: DatabaseReader,
  businessAccountId: Id<"businessAccounts">,
  provider: "bricklink" | "brickowl",
): Promise<boolean> {
  const creds = await db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", businessAccountId).eq("provider", provider),
    )
    .first();

  if (!creds?.isActive) {
    return false;
  }

  // Check inventorySyncEnabled first (more specific), fallback to syncEnabled, then default to true
  const inventorySyncEnabled = creds.inventorySyncEnabled ?? creds.syncEnabled ?? true;
  return inventorySyncEnabled;
}

/**
 * Enqueue a marketplace sync operation in the outbox
 * Call this after writing to the ledger to ensure transactional consistency
 */
/**
 * Enqueue a marketplace sync operation in the outbox
 * Returns whether an outbox message was created (useful for determining sync status)
 */
export async function enqueueMarketplaceSync(
  ctx: { db: DatabaseWriter },
  args: {
    businessAccountId: Id<"businessAccounts">;
    itemId: Id<"inventoryItems">;
    provider: "bricklink" | "brickowl";
    kind: "create" | "update" | "delete";
    lastSyncedSeq: number;
    currentSeq: number;
    correlationId: string;
  },
): Promise<boolean> {
  // Check if credentials exist for this provider
  const creds = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
    )
    .first();

  // Check if credentials are active and inventory sync enabled
  // Check inventorySyncEnabled first (more specific), fallback to syncEnabled, then default to true
  const inventorySyncEnabled = creds?.inventorySyncEnabled ?? creds?.syncEnabled ?? true;

  if (!creds?.isActive || !inventorySyncEnabled) {
    console.log(
      `Skipping outbox for ${args.provider}: isActive=${creds?.isActive}, inventorySyncEnabled=${inventorySyncEnabled}`,
    );
    return false; // No sync needed if credentials not available or disabled
  }

  const idempotencyKey = `${args.itemId}:${args.provider}:${args.lastSyncedSeq}-${args.currentSeq}`;

  await ctx.db.insert("marketplaceOutbox", {
    businessAccountId: args.businessAccountId,
    itemId: args.itemId,
    provider: args.provider,
    kind: args.kind,
    fromSeqExclusive: args.lastSyncedSeq,
    toSeqInclusive: args.currentSeq,
    idempotencyKey,
    status: "pending",
    attempt: 0,
    nextAttemptAt: Date.now(),
    correlationId: args.correlationId,
  });

  return true; // Outbox message created successfully
}

/**
 * Format errors from external API calls (ApiError or generic error) into readable strings.
 */
export function formatApiError(error: unknown): string {
  if (!error) {
    return "";
  }

  const safeStringify = (value: unknown): string | undefined => {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  };

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const maybeApiError = error as {
      error?: { message?: unknown; code?: unknown; details?: unknown };
      message?: unknown;
      code?: unknown;
    };
    const message = maybeApiError.error?.message;
    const code = maybeApiError.error?.code;

    if (typeof message === "string") {
      return typeof code === "string" && code.length > 0 ? `${message} (${code})` : message;
    }

    if (typeof maybeApiError.message === "string") {
      const topLevelCode =
        typeof maybeApiError.code === "string" && maybeApiError.code.length > 0
          ? ` (${maybeApiError.code})`
          : "";
      const detailsSummary =
        "details" in maybeApiError && maybeApiError.details !== undefined
          ? safeStringify(maybeApiError.details)
          : undefined;
      return detailsSummary
        ? `${maybeApiError.message}${topLevelCode} | details: ${detailsSummary}`
        : `${maybeApiError.message}${topLevelCode}`;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "[object]";
    }
  }

  return String(error);
}

/**
 * Ensure BrickOwl ID exists for a part in the catalog.
 * Helper function - not a Convex function, can be called from action handlers.
 * 
 * Returns:
 * - string: The BrickOwl ID if found/available
 * - null: Part not found in catalog
 * - "": Part found but BrickOwl ID not available or couldn't be fetched
 */
export async function ensureBrickowlIdForPartAction(
  ctx: ActionCtx,
  partNumber: string,
): Promise<string | null> {
  // Get the part from catalog
  const part = await ctx.runQuery(internal.catalog.parts.getPartInternal, {
    partNumber,
  });

  if (!part) {
    // Part not found in catalog
    return null;
  }

  // If part already has a BrickOwl ID, return it
  if (part.brickowlId && part.brickowlId !== "") {
    return part.brickowlId;
  }

  // Part exists but doesn't have BrickOwl ID - try to look it up
  try {
    const brickowlId = await ctx.runAction(internal.marketplaces.brickowl.catalog.lookupBrickowlId, {
      bricklinkPartNo: partNumber,
    });

    // If we found a BrickOwl ID, update the part
    if (brickowlId && brickowlId !== "") {
      await ctx.runMutation(internal.catalog.mutations.updatePartBrickowlId, {
        partNumber,
        brickowlId,
      });
      return brickowlId;
    }

    // Couldn't find BrickOwl ID
    return "";
  } catch (error) {
    // Log error but return empty string to allow graceful degradation
    console.warn(
      `Failed to lookup BrickOwl ID for part ${partNumber}:`,
      error instanceof Error ? error.message : String(error),
    );
    return "";
  }
}
