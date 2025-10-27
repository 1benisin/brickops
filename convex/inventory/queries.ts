import { v } from "convex/values";
import { query } from "../_generated/server";
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
  getPendingChangesCountArgs,
  getPendingChangesCountReturns,
  // New history-based validators (refactor requirement)
  listInventoryHistoryArgs,
  listInventoryHistoryReturns,
  getInventoryHistoryArgs,
  getInventoryHistoryReturns,
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
 * Returns last synced timestamps per provider, sync errors, and pending changes count
 * AC: 3.4.6 - Real-time reactive query for UI status display
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

    // Get most recent sync queue entries for this item
    const syncEntries = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_inventory_item", (q) => q.eq("inventoryItemId", args.itemId))
      .collect();

    // Sort by creation time (newest first)
    syncEntries.sort((a, b) => b.createdAt - a.createdAt);

    // Find most recent sync timestamps per provider
    let bricklinkSyncedAt: number | undefined;
    let brickowlSyncedAt: number | undefined;

    for (const entry of syncEntries) {
      if (!bricklinkSyncedAt && entry.bricklinkSyncedAt) {
        bricklinkSyncedAt = entry.bricklinkSyncedAt;
      }
      if (!brickowlSyncedAt && entry.brickowlSyncedAt) {
        brickowlSyncedAt = entry.brickowlSyncedAt;
      }
      if (bricklinkSyncedAt && brickowlSyncedAt) break;
    }

    // Count pending changes
    const pendingChangesCount = syncEntries.filter((e) => e.syncStatus === "pending").length;

    return {
      itemId: args.itemId,
      marketplaceSync: item.marketplaceSync,
      pendingChangesCount,
    };
  },
});

/**
 * Get count of pending changes for a business account
 * Returns count for UI sync queue indicator
 * AC: 3.4.6 - Real-time reactive query for queue status
 */
export const getPendingChangesCount = query({
  args: getPendingChangesCountArgs,
  returns: getPendingChangesCountReturns,
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    const pendingChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("syncStatus", "pending"),
      )
      .collect();

    return {
      count: pendingChanges.length,
    };
  },
});

/**
 * Get unresolved conflicts for UI display
 * AC: 3.4.5 - Query unresolved conflicts
 */
export const getConflicts = query({
  args: {},
  returns: v.array(
    v.object({
      changeId: v.id("inventorySyncQueue"),
      inventoryItemId: v.id("inventoryItems"),
      changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
      conflictDetails: v.any(),
      createdAt: v.number(),
      itemData: v.optional(
        v.object({
          name: v.string(),
          partNumber: v.string(),
          colorId: v.string(),
          quantityAvailable: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    // Query all changes with unresolved conflicts
    const allChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    const conflicts = allChanges.filter((c) => c.conflictStatus === "detected");

    // Enrich with inventory item data for UI display
    const enrichedConflicts = await Promise.all(
      conflicts.map(async (conflict) => {
        const item = await ctx.db.get(conflict.inventoryItemId);
        return {
          changeId: conflict._id,
          inventoryItemId: conflict.inventoryItemId,
          changeType: conflict.changeType,
          conflictDetails: conflict.conflictDetails,
          createdAt: conflict.createdAt,
          itemData: item
            ? {
                name: item.name,
                partNumber: item.partNumber,
                colorId: item.colorId,
                quantityAvailable: item.quantityAvailable,
              }
            : undefined,
        };
      }),
    );

    // Sort by creation time (newest first)
    return enrichedConflicts.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ============================================================================
// New History-Based Queries (Refactor Requirement)
// ============================================================================

/**
 * List inventory history entries with filtering and pagination
 * Replaces sync queue based history queries
 */
export const listInventoryHistory = query({
  args: listInventoryHistoryArgs,
  returns: listInventoryHistoryReturns,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);

    const PAGE_SIZE = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const cursorTs = args.cursor ? Number(args.cursor) : undefined;

    // Query inventory history with business account scope
    const q = ctx.db
      .query("inventoryHistory")
      .withIndex("by_timestamp", (q) => q.eq("businessAccountId", businessAccountId));

    const rows = await q.collect();

    // Sort newest first
    rows.sort((a, b) => b.timestamp - a.timestamp);

    // Apply filters
    let filteredRows = rows.filter((r) => (cursorTs ? r.timestamp < cursorTs : true));

    if (args.dateFrom) filteredRows = filteredRows.filter((r) => r.timestamp >= args.dateFrom!);
    if (args.dateTo) filteredRows = filteredRows.filter((r) => r.timestamp <= args.dateTo!);
    if (args.action) filteredRows = filteredRows.filter((r) => r.action === args.action);
    if (args.userId) filteredRows = filteredRows.filter((r) => r.userId === args.userId);
    if (args.itemId) filteredRows = filteredRows.filter((r) => r.itemId === args.itemId);
    if (args.source) filteredRows = filteredRows.filter((r) => r.source === args.source);

    // Text search
    if (args.query) {
      const qLower = args.query.toLowerCase();
      filteredRows = filteredRows.filter((r) => {
        const reasonMatch = (r.reason ?? "").toLowerCase().includes(qLower);
        const itemIdMatch = String(r.itemId).toLowerCase().includes(qLower);
        return reasonMatch || itemIdMatch;
      });
    }

    const page = filteredRows.slice(0, PAGE_SIZE);

    // Fetch actor details (names)
    const userIds = Array.from(new Set(page.map((r) => r.userId).filter(Boolean) as string[]));
    const actors = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const idToActor = new Map(userIds.map((id, i) => [id, actors[i] ?? null]));

    const entries = page.map((r) => ({
      ...r,
      actorFirstName: idToActor.get(r.userId!)?.firstName,
      actorLastName: idToActor.get(r.userId!)?.lastName,
    }));

    const nextCursor =
      page.length === PAGE_SIZE ? String(page[page.length - 1].timestamp) : undefined;

    return { entries, nextCursor };
  },
});

/**
 * Get a specific inventory history entry with full details
 */
export const getInventoryHistory = query({
  args: getInventoryHistoryArgs,
  returns: getInventoryHistoryReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const historyEntry = await ctx.db.get(args.historyId);
    if (!historyEntry) throw new Error("History entry not found");
    assertBusinessMembership(user, historyEntry.businessAccountId);

    // Include actor info
    const actor = historyEntry.userId ? await ctx.db.get(historyEntry.userId) : null;
    return {
      ...historyEntry,
      actorFirstName: actor?.firstName,
      actorLastName: actor?.lastName,
    };
  },
});
