import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type {
  QueryCtx,
  MutationCtx,
  ActionCtx,
  DatabaseReader,
  DatabaseWriter,
} from "../_generated/server";
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
 * Ensure a part has a BrickOwl ID by enqueueing a catalog refresh when missing.
 * If the part cannot be found in the catalog we throw immediately.
 */
export async function ensureBrickowlIdForPart(ctx: MutationCtx, partNumber: string): Promise<void> {
  const part = await ctx.db
    .query("parts")
    .withIndex("by_no", (q) => q.eq("no", partNumber))
    .first();

  if (!part) {
    throw new ConvexError(
      `Part ${partNumber} not found in catalog. Please refresh the catalog before adding inventory.`,
    );
  }

  // If we already have a BrickOwl ID (including explicit blanks), no further work is required.
  if (part.brickowlId !== undefined) {
    return;
  }

  // Check whether there's already an outstanding refresh request for this part.
  const existingMessage = await ctx.db
    .query("catalogRefreshOutbox")
    .withIndex("by_table_primary_secondary", (q) =>
      q.eq("tableName", "parts").eq("primaryKey", partNumber).eq("secondaryKey", undefined),
    )
    .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
    .first();

  let messageId = existingMessage?._id;

  if (!existingMessage) {
    messageId = await ctx.db.insert("catalogRefreshOutbox", {
      tableName: "parts",
      primaryKey: partNumber,
      secondaryKey: undefined,
      recordId: partNumber,
      priority: 1,
      lastFetched: part.lastFetched,
      status: "pending",
      attempt: 0,
      nextAttemptAt: Date.now(),
    });
  }

  if (messageId) {
    await ctx.scheduler.runAfter(0, internal.catalog.refreshWorker.processSingleOutboxMessage, {
      messageId,
    });
  }
}

/**
 * Ensure a part has a BrickOwl ID when running inside an action.
 * Returns:
 *  - the BrickOwl ID string if found,
 *  - an empty string if no mapping exists (and the catalog has been marked accordingly),
 *  - null if the part does not exist in the catalog.
 */
export async function ensureBrickowlIdForPartAction(
  ctx: ActionCtx,
  partNumber: string,
): Promise<string | null> {
  const part = await ctx.runQuery(internal.catalog.parts.getPartInternal, { partNumber });

  if (!part) {
    return null;
  }

  if (part.brickowlId !== undefined) {
    return part.brickowlId ?? "";
  }

  let messageId = await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
    tableName: "parts",
    primaryKey: partNumber,
    secondaryKey: undefined,
    lastFetched: part.lastFetched,
    priority: 1,
  });

  if (!messageId) {
    const existing = await ctx.runQuery(internal.catalog.outbox.getOutboxMessage, {
      tableName: "parts",
      primaryKey: partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      messageId = existing._id;
    }
  }

  if (messageId) {
    await ctx.runAction(internal.catalog.refreshWorker.processSingleOutboxMessage, {
      messageId,
    });
  }

  const refreshed = await ctx.runQuery(internal.catalog.parts.getPartInternal, { partNumber });
  if (refreshed?.brickowlId !== undefined) {
    return refreshed.brickowlId ?? "";
  }

  await ctx.runMutation(internal.catalog.parts.updatePartBrickowlId, {
    partNumber,
    brickowlId: "",
  });

  return "";
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

  // Check if credentials are active and sync enabled (default syncEnabled to true if not set)
  const syncEnabled = creds?.syncEnabled ?? true;

  if (!creds?.isActive || !syncEnabled) {
    console.log(
      `Skipping outbox for ${args.provider}: isActive=${creds?.isActive}, syncEnabled=${syncEnabled}`,
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
