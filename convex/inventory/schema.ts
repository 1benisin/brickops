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
    condition: v.union(v.literal("new"), v.literal("used")),
    price: v.optional(v.number()), // Unit price for marketplace sync
    notes: v.optional(v.string()), // Description/remarks from marketplace
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    // Soft delete support
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    // Inventory file association (Story 3.5)
    fileId: v.optional(v.id("inventoryFiles")),
    // Consolidated marketplace sync tracking (refactored from individual fields)
    marketplaceSync: v.optional(
      v.object({
        bricklink: v.optional(
          v.object({
            lotId: v.optional(v.number()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
        brickowl: v.optional(
          v.object({
            lotId: v.optional(v.string()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
      }),
    ),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_fileId", ["fileId"]),

  // Historical audit trail for all inventory changes (local tracking)
  inventoryHistory: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    timestamp: v.number(), // Renamed from createdAt
    userId: v.optional(v.id("users")), // Renamed from actorUserId, optional for automation
    action: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    // Change snapshots - ONLY store changed fields
    oldData: v.optional(v.any()), // Partial<InventoryItem> - before state
    newData: v.optional(v.any()), // Partial<InventoryItem> - after state
    // Context / metadata
    source: v.union(v.literal("user"), v.literal("bricklink"), v.literal("order")),
    reason: v.optional(v.string()), // User-provided explanation
    relatedOrderId: v.optional(v.string()), // For order-triggered changes
  })
    .index("by_item", ["itemId"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_timestamp", ["businessAccountId", "timestamp"]),

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

    // Conflict tracking
    conflictStatus: v.optional(v.union(v.literal("detected"), v.literal("resolved"))),
    conflictDetails: v.optional(v.any()),

    // Metadata
    correlationId: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    // File context for tracking
    fileId: v.optional(v.id("inventoryFiles")), // Track if change originated from file
  })
    .index("by_business_pending", ["businessAccountId", "syncStatus"])
    .index("by_business_createdAt", ["businessAccountId", "createdAt"]) // Story 3.6 - paginate history by createdAt DESC
    .index("by_inventory_item", ["inventoryItemId", "createdAt"])
    .index("by_correlation", ["correlationId"]),
};
