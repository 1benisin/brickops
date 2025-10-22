import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireUser, assertBusinessMembership } from "./helpers";
import {
  listInventoryItemsArgs,
  listInventoryItemsReturns,
  listInventoryItemsByFileArgs,
  listInventoryItemsByFileReturns,
  getInventoryTotalsArgs,
  getInventoryTotalsReturns,
  listInventoryHistoryArgs,
  listInventoryHistoryReturns,
  getItemSyncStatusArgs,
  getItemSyncStatusReturns,
  getChangeSyncStatusArgs,
  getChangeSyncStatusReturns,
  getChangeHistoryArgs,
  getChangeHistoryReturns,
  getPendingChangesCountArgs,
  getPendingChangesCountReturns,
  getSyncMetricsArgs,
  getSyncMetricsReturns,
} from "./validators";

export const listInventoryItems = query({
  args: listInventoryItemsArgs,
  returns: listInventoryItemsReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    // Exclude archived items from standard listings
    const activeItems = items.filter((item) => !item.isArchived);

    return activeItems.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listInventoryItemsByFile = query({
  args: listInventoryItemsByFileArgs,
  returns: listInventoryItemsByFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

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
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    const activeItems = items.filter((item) => !item.isArchived);

    let available = 0;
    let reserved = 0;
    let sold = 0;

    for (const it of activeItems) {
      available += it.quantityAvailable ?? 0;
      reserved += it.quantityReserved ?? 0;
      sold += it.quantitySold ?? 0;
    }

    return {
      counts: {
        items: activeItems.length,
      },
      totals: {
        available,
        reserved,
        sold,
      },
    };
  },
});

export const listInventoryHistory = query({
  args: listInventoryHistoryArgs,
  returns: listInventoryHistoryReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    let logs: Doc<"inventoryHistory">[] = [];
    if (args.itemId) {
      logs = await ctx.db
        .query("inventoryHistory")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId!))
        .collect();
    } else {
      logs = await ctx.db
        .query("inventoryHistory")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
    }

    // Sort newest first
    logs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return logs.slice(0, limit);
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
      lastSyncedAt: item.lastSyncedAt,
      bricklinkSyncedAt,
      brickowlSyncedAt,
      syncErrors: item.syncErrors,
      pendingChangesCount,
    };
  },
});

/**
 * Get sync status for a specific change
 * Returns sync status per provider, marketplace IDs, and error details
 * AC: 3.4.6 - Real-time reactive query for change tracking
 */
export const getChangeSyncStatus = query({
  args: getChangeSyncStatusArgs,
  returns: getChangeSyncStatusReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const change = await ctx.db.get(args.changeId);
    if (!change) {
      throw new Error("Change not found");
    }

    // Verify user has access to the business account
    assertBusinessMembership(user, change.businessAccountId);

    // Get inventory item to get marketplace IDs
    const item = await ctx.db.get(change.inventoryItemId);

    return {
      changeId: args.changeId,
      syncStatus: change.syncStatus,
      bricklinkSyncedAt: change.bricklinkSyncedAt,
      bricklinkSyncError: change.bricklinkSyncError,
      bricklinkInventoryId: item?.bricklinkInventoryId,
      brickowlSyncedAt: change.brickowlSyncedAt,
      brickowlSyncError: change.brickowlSyncError,
      brickowlLotId: item?.brickowlLotId,
      correlationId: change.correlationId,
      createdAt: change.createdAt,
    };
  },
});

/**
 * Get paginated change history for an inventory item
 * Returns change log entries from inventorySyncQueue
 * AC: 3.4.6 - Real-time reactive query for item history
 */
export const getChangeHistory = query({
  args: getChangeHistoryArgs,
  returns: getChangeHistoryReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    const changes = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_inventory_item", (q) => q.eq("inventoryItemId", args.itemId))
      .collect();

    // Sort newest first
    changes.sort((a, b) => b.createdAt - a.createdAt);

    // Return paginated results
    return changes.slice(0, limit).map((change) => ({
      _id: change._id,
      _creationTime: change._creationTime,
      changeType: change.changeType,
      syncStatus: change.syncStatus,
      bricklinkSyncedAt: change.bricklinkSyncedAt,
      bricklinkSyncError: change.bricklinkSyncError,
      brickowlSyncedAt: change.brickowlSyncedAt,
      brickowlSyncError: change.brickowlSyncError,
      correlationId: change.correlationId,
      reason: change.reason,
      createdBy: change.createdBy,
      createdAt: change.createdAt,
    }));
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
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const pendingChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("syncStatus", "pending"),
      )
      .collect();

    return {
      count: pendingChanges.length,
    };
  },
});

/**
 * Get comprehensive sync metrics for admin dashboard
 * AC: 3.4.8 - Dashboard query for sync monitoring
 */
export const getSyncMetrics = query({
  args: getSyncMetricsArgs,
  returns: getSyncMetricsReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    // Get all sync queue entries for this business account
    const allChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    const now = Date.now();

    // Calculate status counts
    const pending = allChanges.filter((c) => c.syncStatus === "pending").length;
    const syncing = allChanges.filter((c) => c.syncStatus === "syncing").length;
    const synced = allChanges.filter((c) => c.syncStatus === "synced").length;
    const failed = allChanges.filter((c) => c.syncStatus === "failed").length;

    // Calculate provider-specific sync counts
    const bricklinkSynced = allChanges.filter((c) => c.bricklinkSyncedAt !== undefined).length;
    const brickowlSynced = allChanges.filter((c) => c.brickowlSyncedAt !== undefined).length;

    // Find oldest pending change age (in milliseconds)
    const pendingChanges = allChanges.filter((c) => c.syncStatus === "pending");
    const oldestPendingAge =
      pendingChanges.length > 0
        ? Math.max(...pendingChanges.map((c) => now - c.createdAt))
        : undefined;

    // Get recent failures (last 10)
    const failedChanges = allChanges
      .filter((c) => c.syncStatus === "failed")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((c) => ({
        changeId: c._id,
        changeType: c.changeType,
        bricklinkSyncError: c.bricklinkSyncError,
        brickowlSyncError: c.brickowlSyncError,
        createdAt: c.createdAt,
      }));

    return {
      pending,
      syncing,
      synced,
      failed,
      totalChanges: allChanges.length,
      bricklinkSynced,
      brickowlSynced,
      oldestPendingAge,
      recentFailures: failedChanges,
    };
  },
});

/**
 * Get unresolved conflicts for UI display
 * AC: 3.4.5 - Query unresolved conflicts
 */
export const getConflicts = query({
  args: { businessAccountId: v.id("businessAccounts") },
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
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    // Query all changes with unresolved conflicts
    const allChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) => q.eq("businessAccountId", args.businessAccountId))
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
