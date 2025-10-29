import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { requireUser, assertBusinessMembership } from "./helpers";
import {
  listInventoryItemsArgs,
  listInventoryItemsReturns,
  listInventoryItemsByFileArgs,
  listInventoryItemsByFileReturns,
  getInventoryTotalsArgs,
  getInventoryTotalsReturns,
  getItemSyncStatusArgs,
  getItemSyncStatusReturns,
} from "./validators";

export const listInventoryItems = query({
  args: listInventoryItemsArgs,
  returns: listInventoryItemsReturns,
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Exclude archived items from standard listings
    const activeItems = items.filter((item) => !item.isArchived);

    // Sort by createdAt descending (newest first)
    return activeItems.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listInventoryItemsByFile = query({
  args: listInventoryItemsByFileArgs,
  returns: listInventoryItemsByFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Verify the file belongs to the user's business account
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }
    assertBusinessMembership(user, file.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .collect();

    // Exclude archived items from file listings
    const activeItems = items.filter((item) => !item.isArchived);

    return activeItems.sort((a, b) => b.createdAt - a.createdAt); // Newest first
  },
});

export const getInventoryTotals = query({
  args: getInventoryTotalsArgs,
  returns: getInventoryTotalsReturns,
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    const activeItems = items.filter((item) => !item.isArchived);

    let available = 0;
    let reserved = 0;

    for (const it of activeItems) {
      available += it.quantityAvailable ?? 0;
      reserved += it.quantityReserved ?? 0;
    }

    return {
      counts: {
        items: activeItems.length,
      },
      totals: {
        available,
        reserved,
      },
    };
  },
});

/**
 * Get sync status for a specific inventory item
 * Returns sync status from marketplaceSync field and outbox status
 */
export const getItemSyncStatus = query({
  args: getItemSyncStatusArgs,
  returns: getItemSyncStatusReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);

    // Phase 3: Count pending/inflight outbox messages
    const pendingMessages = await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_item_provider_time", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .collect();

    const nextRetryAt = pendingMessages.reduce((min, msg) => {
      if (msg.nextAttemptAt > Date.now()) {
        return Math.min(min, msg.nextAttemptAt);
      }
      return min;
    }, Infinity);

    return {
      itemId: args.itemId,
      marketplaceSync: item.marketplaceSync,
      pendingChangesCount: pendingMessages.length,
      nextRetryAt: nextRetryAt === Infinity ? undefined : nextRetryAt,
    };
  },
});

// ============================================================================
// Ledger Queries (New)
// ============================================================================

/**
 * Get quantity ledger entries for a specific item
 */
export const getItemQuantityLedger = query({
  args: {
    itemId: v.id("inventoryItems"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    const limit = args.limit ?? 100;
    return entries.slice(0, limit);
  },
});

/**
 * Get location ledger entries for a specific item
 */
export const getItemLocationLedger = query({
  args: {
    itemId: v.id("inventoryItems"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryLocationLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    const limit = args.limit ?? 100;
    return entries.slice(0, limit);
  },
});

/**
 * Calculate current on-hand quantity from ledger (for reconciliation)
 */
export const calculateOnHandQuantity = query({
  args: {
    itemId: v.id("inventoryItems"),
  },
  returns: v.object({
    calculatedAvailable: v.number(),
    ledgerEntries: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    let calculatedAvailable = 0;

    for (const entry of entries) {
      calculatedAvailable += entry.deltaAvailable;
    }

    return {
      calculatedAvailable,
      ledgerEntries: entries.length,
    };
  },
});

// ============================================================================
// Phase 3: Worker support queries (internal)
// ============================================================================

/**
 * Compute delta from ledger window (internal query for worker)
 * Phase 3: Used by outbox worker to compute deltas for sync operations
 */
export const computeDeltaFromWindow = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
    fromSeqExclusive: v.number(),
    toSeqInclusive: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) =>
        q
          .eq("itemId", args.itemId)
          .gt("seq", args.fromSeqExclusive)
          .lte("seq", args.toSeqInclusive),
      )
      .collect();

    return entries.reduce((acc, entry) => acc + entry.deltaAvailable, 0);
  },
});

/**
 * Get current max sequence from ledger (internal query for worker)
 */
export const getCurrentLedgerSeq = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
  },
  returns: v.union(
    v.object({
      seq: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const lastEntry = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .first();

    return lastEntry ? { seq: lastEntry.seq } : null;
  },
});

/**
 * Get ledger entry at specific sequence (internal query for worker)
 */
export const getLedgerEntryAtSeq = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
    seq: v.number(),
  },
  returns: v.union(
    v.object({
      seq: v.number(),
      postAvailable: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .collect();

    const entry = entries.find((e) => e.seq === args.seq);
    return entry ? { seq: entry.seq, postAvailable: entry.postAvailable } : null;
  },
});
