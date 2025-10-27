import { ConvexError, v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { now, requireUser, assertBusinessMembership, requireOwnerRole } from "./helpers";
import {
  addInventoryItemArgs,
  addInventoryItemReturns,
  updateInventoryItemArgs,
  updateInventoryItemReturns,
  deleteInventoryItemArgs,
  deleteInventoryItemReturns,
  getPendingChangesArgs,
  getPendingChangesReturns,
  getChangeArgs,
  getChangeReturns,
  getInventoryItemArgs,
  getInventoryItemReturns,
  markSyncingArgs,
  markSyncingReturns,
  updateSyncStatusArgs,
  updateSyncStatusReturns,
  recordSyncErrorArgs,
  recordSyncErrorReturns,
} from "./validators";

/**
 * Helper function to build marketplaceSync updates for syncing status
 */
async function buildMarketplaceSyncUpdates(
  ctx: { db: DatabaseReader },
  businessAccountId: Id<"businessAccounts">,
  timestamp: number,
  status: "syncing" | "synced" | "failed" = "syncing",
): Promise<{
  marketplaceSync?: {
    bricklink?: {
      status: "syncing" | "synced" | "failed";
      lastSyncAttempt: number;
      lotId?: number;
      error?: string;
    };
    brickowl?: {
      status: "syncing" | "synced" | "failed";
      lastSyncAttempt: number;
      lotId?: string;
      error?: string;
    };
  };
}> {
  const marketplaceSyncUpdates: {
    marketplaceSync?: {
      bricklink?: {
        status: "syncing" | "synced" | "failed";
        lastSyncAttempt: number;
        lotId?: number;
        error?: string;
      };
      brickowl?: {
        status: "syncing" | "synced" | "failed";
        lastSyncAttempt: number;
        lotId?: string;
        error?: string;
      };
    };
  } = {};

  // Get configured providers
  const providers: Array<"bricklink" | "brickowl"> = [];

  // Check BrickLink credentials
  const bricklinkCreds = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", businessAccountId).eq("provider", "bricklink"),
    )
    .first();

  if (bricklinkCreds?.isActive && bricklinkCreds?.syncEnabled !== false) {
    providers.push("bricklink");
  }

  // Check BrickOwl credentials
  const brickowlCreds = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", businessAccountId).eq("provider", "brickowl"),
    )
    .first();

  if (brickowlCreds?.isActive && brickowlCreds?.syncEnabled !== false) {
    providers.push("brickowl");
  }

  // Build marketplaceSync updates
  if (providers.length > 0) {
    marketplaceSyncUpdates.marketplaceSync = {};

    if (providers.includes("bricklink")) {
      marketplaceSyncUpdates.marketplaceSync.bricklink = {
        status,
        lastSyncAttempt: timestamp,
      };
    }

    if (providers.includes("brickowl")) {
      marketplaceSyncUpdates.marketplaceSync.brickowl = {
        status,
        lastSyncAttempt: timestamp,
      };
    }
  }

  return marketplaceSyncUpdates;
}

export const addInventoryItem = mutation({
  args: addInventoryItemArgs,
  returns: addInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    // No uniqueness check needed - multiple lots of the same part+color+condition are valid

    const timestamp = now();
    const document = {
      businessAccountId,
      name: args.name,
      partNumber: args.partNumber,
      colorId: args.colorId,
      location: args.location,
      quantityAvailable: args.quantityAvailable,
      quantityReserved: args.quantityReserved ?? 0,
      condition: args.condition,
      price: args.price,
      notes: args.notes,
      createdBy: user._id,
      createdAt: timestamp,
      isArchived: false,
      fileId: args.fileId, // AC: 3.5.3 - Associate item with file
    };

    const id = await ctx.db.insert("inventoryItems", document);

    // Write to inventory history with full newData for create action
    await ctx.db.insert("inventoryHistory", {
      businessAccountId,
      itemId: id,
      timestamp,
      userId: user._id,
      action: "create",
      oldData: undefined,
      newData: document, // Full created state
      source: "user",
      reason: args.reason,
    });

    // Set initial sync status to "syncing" for enabled marketplaces
    const marketplaceSyncUpdates = await buildMarketplaceSyncUpdates(
      ctx,
      businessAccountId,
      timestamp,
    );

    // Update inventory item with syncing status
    if (Object.keys(marketplaceSyncUpdates).length > 0) {
      await ctx.db.patch(id, marketplaceSyncUpdates);
    }

    // Trigger immediate sync instead of adding to sync queue
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId,
        inventoryItemId: id,
        changeType: "create",
        newData: document,
        correlationId,
      },
    );

    return id;
  },
});

export const updateInventoryItem = mutation({
  args: updateInventoryItemArgs,
  returns: updateInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user); // AC: 3.4.1 - owner role required

    const nextAvailable = args.quantityAvailable ?? item.quantityAvailable;
    const nextReserved = args.quantityReserved ?? item.quantityReserved ?? 0;
    if (nextAvailable < 0 || nextReserved < 0) {
      throw new ConvexError("Quantities cannot be negative");
    }

    const total = nextAvailable + nextReserved;
    if (!Number.isFinite(total)) {
      throw new ConvexError("Invalid quantity values");
    }

    // Capture previous state for sync queue
    const previousData = { ...item };

    const timestamp = now();
    const updates: Partial<Doc<"inventoryItems">> & { updatedAt: number } = {
      updatedAt: timestamp,
    };
    (["name", "partNumber", "colorId", "location", "condition", "price", "notes"] as const).forEach(
      (key) => {
        if (args[key] !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updates as any)[key] = args[key] as unknown;
        }
      },
    );
    if (args.quantityAvailable !== undefined) updates.quantityAvailable = nextAvailable;
    if (args.quantityReserved !== undefined) updates.quantityReserved = nextReserved;

    await ctx.db.patch(args.itemId, updates);

    // Capture only changed fields for history
    const changedFields: Record<string, unknown> = {};
    for (const [key, newValue] of Object.entries(updates)) {
      if (key === "updatedAt") continue; // Skip timestamp
      const oldValue = item[key as keyof typeof item];
      if (oldValue !== newValue) {
        changedFields[key] = true; // Mark as changed
      }
    }

    // Build oldData and newData with only changed fields
    const oldData: Record<string, unknown> = {};
    const newDataForHistory: Record<string, unknown> = {};

    for (const key of Object.keys(changedFields)) {
      oldData[key] = item[key as keyof typeof item];
      newDataForHistory[key] = updates[key as keyof typeof updates];
    }

    // Write to inventory history with only changed fields
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      userId: user._id,
      action: "update",
      oldData: Object.keys(oldData).length > 0 ? oldData : undefined,
      newData: Object.keys(newDataForHistory).length > 0 ? newDataForHistory : undefined,
      source: "user",
      reason: args.reason,
    });

    // Set sync status to "syncing" for enabled marketplaces
    // CRITICAL: Preserve existing lotId from previous syncs
    const currentItem = await ctx.db.get(args.itemId);
    const marketplaceSyncUpdates = await buildMarketplaceSyncUpdates(
      ctx,
      item.businessAccountId,
      timestamp,
    );

    // Merge with existing marketplace sync to preserve lotIds
    if (Object.keys(marketplaceSyncUpdates).length > 0 && currentItem?.marketplaceSync) {
      if (
        marketplaceSyncUpdates.marketplaceSync?.bricklink &&
        currentItem.marketplaceSync.bricklink?.lotId
      ) {
        marketplaceSyncUpdates.marketplaceSync.bricklink.lotId =
          currentItem.marketplaceSync.bricklink.lotId;
      }
      if (
        marketplaceSyncUpdates.marketplaceSync?.brickowl &&
        currentItem.marketplaceSync.brickowl?.lotId
      ) {
        marketplaceSyncUpdates.marketplaceSync.brickowl.lotId =
          currentItem.marketplaceSync.brickowl.lotId;
      }
    }

    // Update inventory item with syncing status
    if (Object.keys(marketplaceSyncUpdates).length > 0) {
      await ctx.db.patch(args.itemId, marketplaceSyncUpdates);
    }

    // Trigger immediate sync instead of adding to sync queue
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId: item.businessAccountId,
        inventoryItemId: args.itemId,
        changeType: "update",
        newData: { ...item, ...updates },
        previousData,
        correlationId,
      },
    );

    return { itemId: args.itemId };
  },
});

export const deleteInventoryItem = mutation({
  args: deleteInventoryItemArgs,
  returns: deleteInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user); // AC: 3.4.1 - owner role required

    // Capture previous state for rollback capability
    const previousData = { ...item };

    const timestamp = now();
    await ctx.db.patch(args.itemId, {
      isArchived: true,
      deletedAt: timestamp,
      updatedAt: timestamp,
    });

    // Write to inventory history with full oldData for delete action
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      userId: user._id,
      action: "delete",
      oldData: previousData, // Full previous state before deletion
      newData: undefined,
      source: "user",
      reason: args.reason,
    });

    // Set sync status to "syncing" for enabled marketplaces
    // CRITICAL: Preserve existing lotId from previous syncs
    const currentItemDelete = await ctx.db.get(args.itemId);
    const marketplaceSyncUpdates = await buildMarketplaceSyncUpdates(
      ctx,
      item.businessAccountId,
      timestamp,
    );

    // Merge with existing marketplace sync to preserve lotIds
    if (Object.keys(marketplaceSyncUpdates).length > 0 && currentItemDelete?.marketplaceSync) {
      if (
        marketplaceSyncUpdates.marketplaceSync?.bricklink &&
        currentItemDelete.marketplaceSync.bricklink?.lotId
      ) {
        marketplaceSyncUpdates.marketplaceSync.bricklink.lotId =
          currentItemDelete.marketplaceSync.bricklink.lotId;
      }
      if (
        marketplaceSyncUpdates.marketplaceSync?.brickowl &&
        currentItemDelete.marketplaceSync.brickowl?.lotId
      ) {
        marketplaceSyncUpdates.marketplaceSync.brickowl.lotId =
          currentItemDelete.marketplaceSync.brickowl.lotId;
      }
    }

    // Update inventory item with syncing status
    if (Object.keys(marketplaceSyncUpdates).length > 0) {
      await ctx.db.patch(args.itemId, marketplaceSyncUpdates);
    }

    // Trigger immediate sync instead of adding to sync queue
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId: item.businessAccountId,
        inventoryItemId: args.itemId,
        changeType: "delete",
        previousData,
        correlationId,
      },
    );

    return { itemId: args.itemId, archived: true };
  },
});

/**
 * Add an existing inventory item to a file
 * AC: 3.5.5 - Associate existing items with files
 */
export const addItemToFile = mutation({
  args: { itemId: v.id("inventoryItems"), fileId: v.id("inventoryFiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError("Inventory item not found");
    }

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }

    // Verify user has access to both item and file
    assertBusinessMembership(user, item.businessAccountId);
    assertBusinessMembership(user, file.businessAccountId);
    requireOwnerRole(user); // AC: 3.5.12 - owner role required

    // Verify item and file belong to same business account
    if (item.businessAccountId !== file.businessAccountId) {
      throw new ConvexError("Item and file must belong to the same business account");
    }

    if (file.deletedAt) {
      throw new ConvexError("Cannot add items to deleted file");
    }

    await ctx.db.patch(args.itemId, {
      fileId: args.fileId,
      updatedAt: now(),
    });

    return null;
  },
});

/**
 * Remove an item from a file (move to main inventory)
 * AC: 3.5.5 - Remove items from files
 */
export const removeItemFromFile = mutation({
  args: { itemId: v.id("inventoryItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user); // AC: 3.5.12 - owner role required

    if (!item.fileId) {
      throw new ConvexError("Item is not associated with a file");
    }

    await ctx.db.patch(args.itemId, {
      fileId: undefined,
      updatedAt: now(),
    });

    return null;
  },
});

// ============================================================================
// INTERNAL FUNCTIONS (from internal.ts)
// Used by inventorySync action (Story 3.4)
// ============================================================================

/**
 * Get pending sync queue entries for a business account
 * Ordered by creation time (FIFO processing)
 */
export const getPendingChanges = internalQuery({
  args: getPendingChangesArgs,
  returns: getPendingChangesReturns,
  handler: async (ctx, { businessAccountId, limit }) => {
    const changes = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("syncStatus", "pending"),
      )
      .collect();

    // Sort by creation time (FIFO)
    changes.sort((a, b) => a.createdAt - b.createdAt);

    return limit ? changes.slice(0, limit) : changes;
  },
});

/**
 * Get a specific change by ID
 */
export const getChange = internalQuery({
  args: getChangeArgs,
  returns: getChangeReturns,
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) {
      throw new Error(`Change not found: ${changeId}`);
    }
    return change;
  },
});

/**
 * Get an inventory item by ID
 */
export const getInventoryItem = internalQuery({
  args: getInventoryItemArgs,
  returns: getInventoryItemReturns,
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error(`Inventory item not found: ${itemId}`);
    }
    return item;
  },
});

/**
 * Update sync status to "syncing" when processing begins
 */
export const markSyncing = internalMutation({
  args: markSyncingArgs,
  returns: markSyncingReturns,
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) {
      throw new Error(`Change not found: ${changeId}`);
    }

    await ctx.db.patch(changeId, {
      syncStatus: "syncing",
    });

    // Update inventory item sync status to syncing for enabled marketplaces
    const marketplaceSyncUpdates = await buildMarketplaceSyncUpdates(
      ctx,
      change.businessAccountId,
      Date.now(),
    );

    if (Object.keys(marketplaceSyncUpdates).length > 0) {
      await ctx.db.patch(change.inventoryItemId, marketplaceSyncUpdates);
    }
  },
});

/**
 * Update sync status with results from marketplace sync
 * Handles multi-provider scenario with independent status per provider
 */
export const updateSyncStatus = internalMutation({
  args: updateSyncStatusArgs,
  returns: updateSyncStatusReturns,
  handler: async (ctx, args) => {
    const change = await ctx.db.get(args.changeId);
    if (!change) {
      throw new Error(`Change not found: ${args.changeId}`);
    }

    const timestamp = Date.now();
    const updates: Partial<Doc<"inventorySyncQueue">> = {};

    // Update provider-specific fields
    if (args.provider === "bricklink") {
      if (args.success) {
        updates.bricklinkSyncedAt = timestamp;
        if (typeof args.marketplaceId === "number") {
          // Update the inventory item with bricklink ID and sync status
          const item = await ctx.db.get(change.inventoryItemId);
          if (item) {
            await ctx.db.patch(change.inventoryItemId, {
              marketplaceSync: {
                ...item.marketplaceSync,
                bricklink: {
                  lotId: args.marketplaceId,
                  status: "synced",
                  lastSyncAttempt: timestamp,
                  error: undefined,
                },
              },
            });
          }
        }
      } else {
        // Update inventory item with failed status and error
        const item = await ctx.db.get(change.inventoryItemId);
        if (item) {
          await ctx.db.patch(change.inventoryItemId, {
            marketplaceSync: {
              ...item.marketplaceSync,
              bricklink: {
                ...item.marketplaceSync?.bricklink,
                status: "failed",
                lastSyncAttempt: timestamp,
                error: args.error,
              },
            },
          });
        }
      }
    } else if (args.provider === "brickowl") {
      if (args.success) {
        updates.brickowlSyncedAt = timestamp;
        if (typeof args.marketplaceId === "string") {
          // Update the inventory item with brickowl ID and sync status
          const item = await ctx.db.get(change.inventoryItemId);
          if (item) {
            await ctx.db.patch(change.inventoryItemId, {
              marketplaceSync: {
                ...item.marketplaceSync,
                brickowl: {
                  lotId: args.marketplaceId,
                  status: "synced",
                  lastSyncAttempt: timestamp,
                  error: undefined,
                },
              },
            });
          }
        }
      } else {
        // Update inventory item with failed status and error
        const item = await ctx.db.get(change.inventoryItemId);
        if (item) {
          await ctx.db.patch(change.inventoryItemId, {
            marketplaceSync: {
              ...item.marketplaceSync,
              brickowl: {
                ...item.marketplaceSync?.brickowl,
                status: "failed",
                lastSyncAttempt: timestamp,
                error: args.error,
              },
            },
          });
        }
      }
    }

    // Determine overall sync status
    const bricklinkSynced = change.bricklinkSyncedAt || updates.bricklinkSyncedAt;
    const brickowlSynced = change.brickowlSyncedAt || updates.brickowlSyncedAt;

    // Check for errors in the new marketplaceSync structure
    const item = await ctx.db.get(change.inventoryItemId);
    const hasAnyError =
      item?.marketplaceSync?.bricklink?.status === "failed" ||
      item?.marketplaceSync?.brickowl?.status === "failed";

    if (hasAnyError) {
      updates.syncStatus = "failed";
    } else if (bricklinkSynced || brickowlSynced) {
      updates.syncStatus = "synced";
    }

    await ctx.db.patch(args.changeId, updates);

    // Sync status is updated in updateSyncStatus mutation
  },
});

/**
 * Record sync error for a change
 */
export const recordSyncError = internalMutation({
  args: recordSyncErrorArgs,
  returns: recordSyncErrorReturns,
  handler: async (ctx, args) => {
    const change = await ctx.db.get(args.changeId);
    if (!change) {
      throw new Error(`Change not found: ${args.changeId}`);
    }

    const updates: Partial<Doc<"inventorySyncQueue">> = {
      syncStatus: "failed",
    };

    await ctx.db.patch(args.changeId, updates);
  },
});

/**
 * Record a conflict detected during sync
 * AC: 3.4.5 - Conflict detection and storage
 */
export const recordConflict = internalMutation({
  args: {
    changeId: v.id("inventorySyncQueue"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    error: v.string(),
    conflictDetails: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const change = await ctx.db.get(args.changeId);
    if (!change) {
      throw new Error(`Change not found: ${args.changeId}`);
    }

    const updates: Partial<Doc<"inventorySyncQueue">> = {
      syncStatus: "failed",
      conflictStatus: "detected",
      conflictDetails: {
        provider: args.provider,
        error: args.error,
        details: args.conflictDetails,
        detectedAt: Date.now(),
      },
    };

    await ctx.db.patch(args.changeId, updates);
  },
});

/**
 * Update sync status after immediate sync attempt
 */
export const updateImmediateSyncStatus = internalMutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    results: v.array(
      v.object({
        provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
        success: v.boolean(),
        error: v.optional(v.any()),
        marketplaceId: v.optional(v.union(v.string(), v.number())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const updates: {
      marketplaceSync?: {
        bricklink?: {
          status: "synced" | "failed";
          lastSyncAttempt: number;
          lotId?: number;
        };
        brickowl?: {
          status: "synced" | "failed";
          lastSyncAttempt: number;
          lotId?: string;
        };
      };
    } = {};

    for (const result of args.results) {
      if (result.provider === "bricklink") {
        const bricklinkUpdate: {
          status: "synced" | "failed";
          lastSyncAttempt: number;
          lotId?: number;
        } = {
          status: result.success ? "synced" : "failed",
          lastSyncAttempt: Date.now(),
        };

        // CRITICAL: Only set lotId if we have both success AND a marketplaceId
        if (result.success && result.marketplaceId) {
          bricklinkUpdate.lotId = result.marketplaceId as number;
        }

        updates.marketplaceSync = {
          ...updates.marketplaceSync,
          bricklink: bricklinkUpdate,
        };
      } else if (result.provider === "brickowl") {
        const brickowlUpdate: {
          status: "synced" | "failed";
          lastSyncAttempt: number;
          lotId?: string;
        } = {
          status: result.success ? "synced" : "failed",
          lastSyncAttempt: Date.now(),
        };

        // CRITICAL: Only set lotId if we have both success AND a marketplaceId
        if (result.success && result.marketplaceId) {
          brickowlUpdate.lotId = result.marketplaceId as string;
        }

        updates.marketplaceSync = {
          ...updates.marketplaceSync,
          brickowl: brickowlUpdate,
        };
      }
    }

    await ctx.db.patch(args.inventoryItemId, updates);
  },
});
