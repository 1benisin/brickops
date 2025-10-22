import { defineTable } from "convex/server";
import { v } from "convex/values";

export const inventoryTables = {
  // Inventory files for batch collections (Story 3.5)
  inventoryFiles: defineTable({
    businessAccountId: v.id("businessAccounts"),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_businessAccount_createdAt", ["businessAccountId", "createdAt"]),

  inventoryItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    name: v.string(),
    partNumber: v.string(), // BrickLink part number (item.no)
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    // Quantity splits to support status tracking
    quantityReserved: v.number(),
    quantitySold: v.number(),
    status: v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")),
    condition: v.union(v.literal("new"), v.literal("used")),
    price: v.optional(v.number()), // Unit price for marketplace sync
    notes: v.optional(v.string()), // Description/remarks from marketplace
    bricklinkInventoryId: v.optional(v.number()), // BrickLink inventory_id for sync tracking
    brickowlLotId: v.optional(v.string()), // BrickOwl lot_id for sync tracking (Story 3.3)
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    // Soft delete support
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    // Sync status tracking (Story 3.4)
    lastSyncedAt: v.optional(v.number()),
    syncErrors: v.optional(
      v.array(
        v.object({
          provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
          error: v.string(),
          occurredAt: v.number(),
        }),
      ),
    ),
    // Inventory file association (Story 3.5)
    fileId: v.optional(v.id("inventoryFiles")),
    // Per-marketplace sync status tracking (Story 3.5)
    bricklinkSyncStatus: v.optional(
      v.union(v.literal("pending"), v.literal("syncing"), v.literal("synced"), v.literal("failed")),
    ),
    brickowlSyncStatus: v.optional(
      v.union(v.literal("pending"), v.literal("syncing"), v.literal("synced"), v.literal("failed")),
    ),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_bricklinkInventoryId", ["businessAccountId", "bricklinkInventoryId"])
    .index("by_brickowlLotId", ["businessAccountId", "brickowlLotId"])
    .index("by_fileId", ["fileId"]),

  // Historical audit trail for all inventory changes (local tracking)
  inventoryHistory: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    changeType: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("adjust"),
      v.literal("delete"),
      v.literal("batch_sync"), // Story 3.5 - batch sync success
      v.literal("batch_sync_failed"), // Story 3.5 - batch sync failure
    ),
    // Deltas for quantities (optional per event)
    deltaAvailable: v.optional(v.number()),
    deltaReserved: v.optional(v.number()),
    deltaSold: v.optional(v.number()),
    fromStatus: v.optional(
      v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")),
    ),
    toStatus: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("sold"))),
    actorUserId: v.id("users"),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    // Batch sync specific fields (Story 3.5)
    marketplace: v.optional(v.union(v.literal("bricklink"), v.literal("brickowl"))),
    marketplaceLotId: v.optional(v.union(v.number(), v.string())),
    syncError: v.optional(v.string()),
  })
    .index("by_item", ["itemId"]) // fetch logs per item
    .index("by_businessAccount", ["businessAccountId"]) // fetch logs per tenant
    .index("by_createdAt", ["businessAccountId", "createdAt"]),

  // Sync queue for marketplace orchestration (Story 3.4)
  inventorySyncQueue: defineTable({
    businessAccountId: v.id("businessAccounts"),
    inventoryItemId: v.id("inventoryItems"),
    changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),

    // Change data
    previousData: v.optional(v.any()), // Full previous state (for update/delete)
    newData: v.optional(v.any()), // Full new state (for create/update)
    reason: v.optional(v.string()), // User-provided reason for change

    // Sync tracking (per provider)
    syncStatus: v.union(
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("failed"),
    ),
    bricklinkSyncedAt: v.optional(v.number()),
    brickowlSyncedAt: v.optional(v.number()),
    bricklinkSyncError: v.optional(v.string()),
    brickowlSyncError: v.optional(v.string()),

    // Conflict tracking
    conflictStatus: v.optional(v.union(v.literal("detected"), v.literal("resolved"))),
    conflictDetails: v.optional(v.any()),

    // Undo tracking (for Story 3.5)
    isUndo: v.optional(v.boolean()),
    undoesChangeId: v.optional(v.id("inventorySyncQueue")),
    undoneByChangeId: v.optional(v.id("inventorySyncQueue")),

    // Metadata
    correlationId: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_business_pending", ["businessAccountId", "syncStatus"])
    .index("by_inventory_item", ["inventoryItemId", "createdAt"])
    .index("by_correlation", ["correlationId"]),
};
