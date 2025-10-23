import { ConvexError, v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { now, requireUser, assertBusinessMembership, requireOwnerRole } from "./helpers";
import {
  addInventoryItemArgs,
  addInventoryItemReturns,
  updateInventoryQuantityArgs,
  updateInventoryQuantityReturns,
  updateInventoryItemArgs,
  updateInventoryItemReturns,
  deleteInventoryItemArgs,
  deleteInventoryItemReturns,
  undoChangeArgs,
  undoChangeReturns,
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
      quantitySold: args.quantitySold ?? 0,
      status: args.status ?? "available",
      condition: args.condition,
      price: args.price,
      notes: args.notes,
      createdBy: user._id,
      createdAt: timestamp,
      isArchived: false,
      fileId: args.fileId, // AC: 3.5.3 - Associate item with file
    };

    const id = await ctx.db.insert("inventoryItems", document);

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId,
      itemId: id,
      changeType: "create",
      deltaAvailable: args.quantityAvailable,
      deltaReserved: document.quantityReserved,
      deltaSold: document.quantitySold,
      toStatus: document.status,
      actorUserId: user._id,
      createdAt: timestamp,
    });

    // Set initial sync status to "syncing" for enabled marketplaces
    const syncStatusUpdates: {
      bricklinkSyncStatus?: "syncing" | "synced" | "failed";
      brickowlSyncStatus?: "syncing" | "synced" | "failed";
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

    if (providers.includes("bricklink")) {
      syncStatusUpdates.bricklinkSyncStatus = "syncing";
    }
    if (providers.includes("brickowl")) {
      syncStatusUpdates.brickowlSyncStatus = "syncing";
    }

    // Update inventory item with syncing status
    if (Object.keys(syncStatusUpdates).length > 0) {
      await ctx.db.patch(id, syncStatusUpdates);
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

export const updateInventoryQuantity = mutation({
  args: updateInventoryQuantityArgs,
  returns: updateInventoryQuantityReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    await ctx.db.patch(args.itemId, {
      quantityAvailable: args.quantityAvailable,
      updatedAt: now(),
    });

    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "adjust",
      deltaAvailable: args.quantityAvailable - item.quantityAvailable,
      actorUserId: user._id,
      createdAt: now(),
    });

    return { itemId: args.itemId, quantityAvailable: args.quantityAvailable };
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
    const nextSold = args.quantitySold ?? item.quantitySold ?? 0;
    if (nextAvailable < 0 || nextReserved < 0 || nextSold < 0) {
      throw new ConvexError("Quantities cannot be negative");
    }

    const total = nextAvailable + nextReserved + nextSold;
    if (!Number.isFinite(total)) {
      throw new ConvexError("Invalid quantity values");
    }

    // Capture previous state for sync queue
    const previousData = { ...item };

    const timestamp = now();
    const updates: Partial<Doc<"inventoryItems">> & { updatedAt: number } = {
      updatedAt: timestamp,
    };
    (
      [
        "name",
        "partNumber",
        "colorId",
        "location",
        "condition",
        "status",
        "price",
        "notes",
      ] as const
    ).forEach((key) => {
      if (args[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updates as any)[key] = args[key] as unknown;
      }
    });
    if (args.quantityAvailable !== undefined) updates.quantityAvailable = nextAvailable;
    if (args.quantityReserved !== undefined) updates.quantityReserved = nextReserved;
    if (args.quantitySold !== undefined) updates.quantitySold = nextSold;

    await ctx.db.patch(args.itemId, updates);

    // Build new data (merged state)
    const newData = { ...item, ...updates };

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "update",
      deltaAvailable: nextAvailable - item.quantityAvailable,
      deltaReserved: nextReserved - (item.quantityReserved ?? 0),
      deltaSold: nextSold - (item.quantitySold ?? 0),
      fromStatus: item.status ?? "available",
      toStatus: updates.status ?? item.status ?? "available",
      actorUserId: user._id,
      reason: args.reason,
      createdAt: timestamp,
    });

    // Set sync status to "syncing" for enabled marketplaces
    const syncStatusUpdates: {
      bricklinkSyncStatus?: "syncing" | "synced" | "failed";
      brickowlSyncStatus?: "syncing" | "synced" | "failed";
    } = {};

    // Get configured providers
    const providers: Array<"bricklink" | "brickowl"> = [];

    // Check BrickLink credentials
    const bricklinkCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", item.businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    if (bricklinkCreds?.isActive && bricklinkCreds?.syncEnabled !== false) {
      providers.push("bricklink");
    }

    // Check BrickOwl credentials
    const brickowlCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", item.businessAccountId).eq("provider", "brickowl"),
      )
      .first();

    if (brickowlCreds?.isActive && brickowlCreds?.syncEnabled !== false) {
      providers.push("brickowl");
    }

    if (providers.includes("bricklink")) {
      syncStatusUpdates.bricklinkSyncStatus = "syncing";
    }
    if (providers.includes("brickowl")) {
      syncStatusUpdates.brickowlSyncStatus = "syncing";
    }

    // Update inventory item with syncing status
    if (Object.keys(syncStatusUpdates).length > 0) {
      await ctx.db.patch(args.itemId, syncStatusUpdates);
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
        newData,
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

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "delete",
      actorUserId: user._id,
      reason: args.reason,
      createdAt: timestamp,
    });

    // Set sync status to "syncing" for enabled marketplaces
    const syncStatusUpdates: {
      bricklinkSyncStatus?: "syncing" | "synced" | "failed";
      brickowlSyncStatus?: "syncing" | "synced" | "failed";
    } = {};

    // Get configured providers
    const providers: Array<"bricklink" | "brickowl"> = [];

    // Check BrickLink credentials
    const bricklinkCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", item.businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    if (bricklinkCreds?.isActive && bricklinkCreds?.syncEnabled !== false) {
      providers.push("bricklink");
    }

    // Check BrickOwl credentials
    const brickowlCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", item.businessAccountId).eq("provider", "brickowl"),
      )
      .first();

    if (brickowlCreds?.isActive && brickowlCreds?.syncEnabled !== false) {
      providers.push("brickowl");
    }

    if (providers.includes("bricklink")) {
      syncStatusUpdates.bricklinkSyncStatus = "syncing";
    }
    if (providers.includes("brickowl")) {
      syncStatusUpdates.brickowlSyncStatus = "syncing";
    }

    // Update inventory item with syncing status
    if (Object.keys(syncStatusUpdates).length > 0) {
      await ctx.db.patch(args.itemId, syncStatusUpdates);
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
 * Undo a change by executing compensating operation
 * AC: 3.4.7 - Rollback/undo capability with RBAC
 */
export const undoChange = mutation({
  args: undoChangeArgs,
  returns: undoChangeReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // 1. Get the original change
    const originalChange = await ctx.db.get(args.changeId);
    if (!originalChange) {
      throw new ConvexError("Change not found");
    }

    // 2. RBAC check - owner role required
    assertBusinessMembership(user, originalChange.businessAccountId);
    requireOwnerRole(user);

    // 3. Validate change can be undone
    if (originalChange.undoneByChangeId) {
      throw new ConvexError("Change has already been undone");
    }

    if (originalChange.isUndo) {
      // This is an undo being undone (redo) - this is allowed
      // The compensating operation will be the inverse of the undo
    }

    // 4. Get the inventory item (may not exist if original was delete or if we're undoing a create)
    const item = await ctx.db.get(originalChange.inventoryItemId);

    // 5. Determine compensating operation based on original change type
    let compensatingAction: "create" | "update" | "delete";
    let compensatingData: Partial<Doc<"inventoryItems">> | undefined;

    const timestamp = now();

    switch (originalChange.changeType) {
      case "create":
        // Undo CREATE → DELETE
        compensatingAction = "delete";
        if (!item) {
          throw new ConvexError("Cannot undo create: item no longer exists");
        }
        if (item.isArchived) {
          throw new ConvexError("Cannot undo create: item is already archived");
        }

        // Execute compensating delete (soft delete)
        await ctx.db.patch(originalChange.inventoryItemId, {
          isArchived: true,
          deletedAt: timestamp,
          updatedAt: timestamp,
        });

        compensatingData = { ...item }; // Capture state before delete
        break;

      case "update": {
        // Undo UPDATE → UPDATE with previous values
        compensatingAction = "update";
        if (!item) {
          throw new ConvexError("Cannot undo update: item no longer exists");
        }
        if (item.isArchived) {
          throw new ConvexError("Cannot undo update: item is archived");
        }
        if (!originalChange.previousData) {
          throw new ConvexError("Cannot undo update: no previous data stored");
        }

        // Execute compensating update (restore previous state)
        const previousState = originalChange.previousData as Partial<Doc<"inventoryItems">>;
        await ctx.db.patch(originalChange.inventoryItemId, {
          ...previousState,
          updatedAt: timestamp,
        });

        compensatingData = previousState;
        break;
      }

      case "delete":
        // Undo DELETE → CREATE (restore)
        compensatingAction = "create";
        if (!originalChange.previousData) {
          throw new ConvexError("Cannot undo delete: no previous data stored");
        }

        // Check if item still exists (soft delete)
        if (item && !item.isArchived) {
          throw new ConvexError("Cannot undo delete: item is not archived");
        }

        if (item) {
          // Item exists (soft deleted) - restore it
          await ctx.db.patch(originalChange.inventoryItemId, {
            isArchived: false,
            deletedAt: undefined,
            updatedAt: timestamp,
          });
        } else {
          // Item was hard deleted (shouldn't happen) - would need to recreate
          // For now, throw error as we only do soft deletes
          throw new ConvexError("Cannot undo delete: item was permanently deleted");
        }

        compensatingData = originalChange.previousData;
        break;

      default: {
        // Exhaustiveness check - TypeScript ensures all change types are handled
        const _exhaustive: never = originalChange.changeType;
        throw new ConvexError("Cannot undo change: unsupported change type");
      }
    }

    // 6. Create inventory history entry for the undo
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: originalChange.businessAccountId,
      itemId: originalChange.inventoryItemId,
      changeType: compensatingAction,
      actorUserId: user._id,
      reason: `Undo: ${args.reason}`,
      createdAt: timestamp,
    });

    // 7. Create new sync queue entry for the compensating operation
    const correlationId = crypto.randomUUID();
    const undoChangeId = await ctx.db.insert("inventorySyncQueue", {
      businessAccountId: originalChange.businessAccountId,
      inventoryItemId: originalChange.inventoryItemId,
      changeType: compensatingAction,
      newData: compensatingAction === "delete" ? undefined : compensatingData,
      previousData: compensatingAction === "delete" ? compensatingData : undefined,
      reason: `Undo of change ${args.changeId}: ${args.reason}`,
      syncStatus: "pending",
      correlationId,
      createdBy: user._id,
      createdAt: timestamp,
      // Mark as undo with bidirectional reference
      isUndo: true,
      undoesChangeId: args.changeId,
    });

    // 8. Mark original change as undone (bidirectional link)
    await ctx.db.patch(args.changeId, {
      undoneByChangeId: undoChangeId,
    });

    return {
      originalChangeId: args.changeId,
      undoChangeId,
      itemId: originalChange.inventoryItemId,
      compensatingAction,
    };
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
    const syncStatusUpdates: {
      bricklinkSyncStatus?: "syncing";
      brickowlSyncStatus?: "syncing";
    } = {};

    // Get configured providers to determine which statuses to update
    const providers: Array<"bricklink" | "brickowl"> = [];

    // Check BrickLink credentials
    const bricklinkCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", change.businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    if (bricklinkCreds?.isActive && bricklinkCreds?.syncEnabled !== false) {
      providers.push("bricklink");
    }

    // Check BrickOwl credentials
    const brickowlCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", change.businessAccountId).eq("provider", "brickowl"),
      )
      .first();

    if (brickowlCreds?.isActive && brickowlCreds?.syncEnabled !== false) {
      providers.push("brickowl");
    }

    if (providers.includes("bricklink")) {
      syncStatusUpdates.bricklinkSyncStatus = "syncing";
    }
    if (providers.includes("brickowl")) {
      syncStatusUpdates.brickowlSyncStatus = "syncing";
    }

    // Update inventory item with syncing status
    if (Object.keys(syncStatusUpdates).length > 0) {
      await ctx.db.patch(change.inventoryItemId, syncStatusUpdates);
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
          await ctx.db.patch(change.inventoryItemId, {
            bricklinkLotId: args.marketplaceId,
            bricklinkSyncStatus: "synced",
            bricklinkSyncError: undefined, // Clear any previous errors
          });
        }
      } else {
        updates.bricklinkSyncError = args.error;
        // Update inventory item with failed status and error
        await ctx.db.patch(change.inventoryItemId, {
          bricklinkSyncStatus: "failed",
          bricklinkSyncError: args.error,
        });
      }
    } else if (args.provider === "brickowl") {
      if (args.success) {
        updates.brickowlSyncedAt = timestamp;
        if (typeof args.marketplaceId === "string") {
          // Update the inventory item with brickowl ID and sync status
          await ctx.db.patch(change.inventoryItemId, {
            brickowlLotId: args.marketplaceId,
            brickowlSyncStatus: "synced",
            brickowlSyncError: undefined, // Clear any previous errors
          });
        }
      } else {
        updates.brickowlSyncError = args.error;
        // Update inventory item with failed status and error
        await ctx.db.patch(change.inventoryItemId, {
          brickowlSyncStatus: "failed",
          brickowlSyncError: args.error,
        });
      }
    }

    // Determine overall sync status
    const bricklinkSynced = change.bricklinkSyncedAt || updates.bricklinkSyncedAt;
    const brickowlSynced = change.brickowlSyncedAt || updates.brickowlSyncedAt;
    const bricklinkError = change.bricklinkSyncError || updates.bricklinkSyncError;
    const brickowlError = change.brickowlSyncError || updates.brickowlSyncError;

    const hasAnyError = bricklinkError || brickowlError;

    if (hasAnyError) {
      updates.syncStatus = "failed";
    } else if (bricklinkSynced || brickowlSynced) {
      updates.syncStatus = "synced";
    }

    await ctx.db.patch(args.changeId, updates);

    // Update inventory item's lastSyncedAt if successful
    if (args.success) {
      await ctx.db.patch(change.inventoryItemId, {
        lastSyncedAt: timestamp,
      });
    }
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

    if (args.provider === "bricklink") {
      updates.bricklinkSyncError = args.error;
    } else {
      updates.brickowlSyncError = args.error;
    }

    await ctx.db.patch(args.changeId, updates);

    // Also add to inventory item's syncErrors array
    const item = await ctx.db.get(change.inventoryItemId);
    if (item) {
      const syncErrors = item.syncErrors || [];
      syncErrors.push({
        provider: args.provider,
        error: args.error,
        occurredAt: Date.now(),
      });

      await ctx.db.patch(change.inventoryItemId, { syncErrors });
    }
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

    // Also record provider-specific error
    if (args.provider === "bricklink") {
      updates.bricklinkSyncError = args.error;
    } else {
      updates.brickowlSyncError = args.error;
    }

    await ctx.db.patch(args.changeId, updates);

    // Also add to inventory item's syncErrors array
    const item = await ctx.db.get(change.inventoryItemId);
    if (item) {
      const syncErrors = item.syncErrors || [];
      syncErrors.push({
        provider: args.provider,
        error: `CONFLICT: ${args.error}`,
        occurredAt: Date.now(),
      });

      await ctx.db.patch(change.inventoryItemId, { syncErrors });
    }
  },
});

/**
 * Resolve a detected conflict
 * AC: 3.4.5 - Conflict resolution with re-enqueue
 */
export const resolveConflict = mutation({
  args: {
    changeId: v.id("inventorySyncQueue"),
    resolution: v.union(
      v.literal("accept_local"),
      v.literal("accept_remote"),
      v.literal("manual_merge"),
    ),
    mergedData: v.optional(v.any()), // Required for manual_merge
  },
  returns: v.object({
    changeId: v.id("inventorySyncQueue"),
    newChangeId: v.optional(v.id("inventorySyncQueue")),
    resolution: v.string(),
  }),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const change = await ctx.db.get(args.changeId);
    if (!change) {
      throw new ConvexError("Change not found");
    }

    assertBusinessMembership(user, change.businessAccountId);
    requireOwnerRole(user);

    if (change.conflictStatus !== "detected") {
      throw new ConvexError("No unresolved conflict on this change");
    }

    // Mark conflict as resolved
    await ctx.db.patch(args.changeId, {
      conflictStatus: "resolved",
      conflictDetails: {
        ...change.conflictDetails,
        resolvedAt: Date.now(),
        resolvedBy: user._id,
        resolution: args.resolution,
      },
    });

    // Handle different resolution strategies
    if (args.resolution === "accept_local") {
      // Re-enqueue the original local change for sync
      const newChangeId = await ctx.db.insert("inventorySyncQueue", {
        businessAccountId: change.businessAccountId,
        inventoryItemId: change.inventoryItemId,
        changeType: change.changeType,
        newData: change.newData,
        previousData: change.previousData,
        reason: `Conflict resolved: accept local (original change ${args.changeId})`,
        syncStatus: "pending",
        correlationId: crypto.randomUUID(),
        createdBy: user._id,
        createdAt: Date.now(),
      });

      return { changeId: args.changeId, newChangeId, resolution: args.resolution };
    } else if (args.resolution === "accept_remote") {
      // Don't re-enqueue - remote wins, local change is discarded
      return { changeId: args.changeId, resolution: args.resolution };
    } else {
      // manual_merge - re-enqueue with merged data
      if (!args.mergedData) {
        throw new ConvexError("mergedData required for manual_merge resolution");
      }

      const newChangeId = await ctx.db.insert("inventorySyncQueue", {
        businessAccountId: change.businessAccountId,
        inventoryItemId: change.inventoryItemId,
        changeType: change.changeType,
        newData: args.mergedData,
        previousData: change.previousData,
        reason: `Conflict resolved: manual merge (original change ${args.changeId})`,
        syncStatus: "pending",
        correlationId: crypto.randomUUID(),
        createdBy: user._id,
        createdAt: Date.now(),
      });

      return { changeId: args.changeId, newChangeId, resolution: args.resolution };
    }
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
      bricklinkSyncStatus?: "synced" | "failed";
      brickowlSyncStatus?: "synced" | "failed";
      bricklinkLotId?: number;
      brickowlLotId?: string;
    } = {};

    for (const result of args.results) {
      if (result.provider === "bricklink") {
        updates.bricklinkSyncStatus = result.success ? "synced" : "failed";
        if (result.success && result.marketplaceId) {
          updates.bricklinkLotId = result.marketplaceId as number;
        }
      } else if (result.provider === "brickowl") {
        updates.brickowlSyncStatus = result.success ? "synced" : "failed";
        if (result.success && result.marketplaceId) {
          updates.brickowlLotId = result.marketplaceId as string;
        }
      }
    }

    await ctx.db.patch(args.inventoryItemId, updates);
  },
});
