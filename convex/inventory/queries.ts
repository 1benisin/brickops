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
