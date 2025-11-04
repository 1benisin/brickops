import { defineTable } from "convex/server";
import { v } from "convex/values";

const marketplaceSync = v.optional(
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
        lastSyncAttempt: v.optional(v.number()),
        error: v.optional(v.string()),
        // Phase 2: Cursor tracking for retry logic
        lastSyncedSeq: v.optional(v.number()), // Last ledger sequence applied to marketplace
        lastSyncedAvailable: v.optional(v.number()), // Denormalized available quantity at last sync
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
        lastSyncAttempt: v.optional(v.number()),
        error: v.optional(v.string()),
        // Phase 2: Cursor tracking for retry logic
        lastSyncedSeq: v.optional(v.number()),
        lastSyncedAvailable: v.optional(v.number()),
      }),
    ),
  }),
);

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
    marketplaceSync: marketplaceSync,
  })
    // Existing indexes (keep these)
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_fileId", ["fileId"])

    // NEW: Composite indexes for common query patterns
    // Pattern: default listing (sort by createdAt desc)
    .index("by_businessAccount_createdAt", ["businessAccountId", "createdAt"])

    // Pattern: filter by condition + sort by date
    .index("by_businessAccount_condition_createdAt", [
      "businessAccountId",
      "condition",
      "createdAt",
    ])

    // Pattern: filter by location + sort by part number (for location view)
    .index("by_businessAccount_location_partNumber", [
      "businessAccountId",
      "location",
      "partNumber",
    ])

    // Pattern: filter by price range + sort by price (for price browsing)
    .index("by_businessAccount_price", ["businessAccountId", "price"])

    // Pattern: part number prefix search + sort by part number
    .index("by_businessAccount_partNumber", ["businessAccountId", "partNumber"])

    // Pattern: quantity filtering + sort by quantity
    .index("by_businessAccount_quantity", ["businessAccountId", "quantityAvailable"])

    // NEW: Indexes for additional sortable columns
    // Pattern: sort by name
    .index("by_businessAccount_name", ["businessAccountId", "name"])

    // Pattern: sort by colorId
    .index("by_businessAccount_colorId", ["businessAccountId", "colorId"])

    // Pattern: sort by location (dedicated index for direct sorting)
    .index("by_businessAccount_location", ["businessAccountId", "location"])

    // Pattern: sort by condition (dedicated index for direct sorting)
    .index("by_businessAccount_condition", ["businessAccountId", "condition"])

    // Pattern: sort by quantityReserved
    .index("by_businessAccount_quantityReserved", ["businessAccountId", "quantityReserved"])

    // Pattern: sort by updatedAt
    .index("by_businessAccount_updatedAt", ["businessAccountId", "updatedAt"]),

  // NEW: Specialized ledger for quantity changes
  inventoryQuantityLedger: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    timestamp: v.number(), // When the change took effect (timestamp of the order) or manual adjustment

    // Phase 1: Sequence tracking for event sourcing
    seq: v.number(), // Per-item monotonic sequence number
    preAvailable: v.number(), // Balance before this delta
    postAvailable: v.number(), // Balance after this delta (running balance)

    // Quantity deltas (can be negative)
    deltaAvailable: v.number(),

    // Context
    reason: v.union(
      v.literal("initial_stock"),
      v.literal("manual_adjustment"),
      v.literal("order_sale"),
      v.literal("item_deleted"),
    ),
    source: v.union(
      v.literal("user"),
      v.literal("bricklink"), // order from BrickLink marketplace
      v.literal("brickowl"), // order from BrickOwl marketplace
    ),
    userId: v.optional(v.id("users")),
    // For idempotency + join back to orders/returns
    orderId: v.optional(v.string()), // TODO make v.id("orders") once we have an orders table
    // For grouping related changes and debugging
    correlationId: v.optional(v.string()),
  })
    .index("by_item", ["itemId"])
    .index("by_item_timestamp", ["itemId", "timestamp"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_business_timestamp", ["businessAccountId", "timestamp"])
    .index("by_order", ["orderId"])
    .index("by_correlation", ["correlationId"])
    .index("by_item_seq", ["itemId", "seq"]), // NEW: Enables efficient window queries

  // NEW: Specialized ledger for location changes
  inventoryLocationLedger: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    timestamp: v.number(),

    // Location change
    fromLocation: v.optional(v.string()), // null for initial location
    toLocation: v.string(),

    // Context
    reason: v.string(),
    source: v.union(v.literal("user")),
    userId: v.optional(v.id("users")),
    // For grouping related changes and debugging
    correlationId: v.optional(v.string()),
  })
    .index("by_item", ["itemId"])
    .index("by_item_timestamp", ["itemId", "timestamp"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_business_timestamp", ["businessAccountId", "timestamp"])
    .index("by_location", ["businessAccountId", "toLocation"])
    .index("by_correlation", ["correlationId"]),

  // Phase 2: Transactional outbox for marketplace sync operations
  marketplaceOutbox: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    kind: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),

    // Delta window (what this sync covers)
    fromSeqExclusive: v.number(),
    toSeqInclusive: v.number(),

    // Idempotency
    idempotencyKey: v.string(),

    // Lifecycle
    status: v.union(
      v.literal("pending"),
      v.literal("inflight"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    attempt: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    correlationId: v.optional(v.string()),
  })
    .index("by_status_time", ["status", "nextAttemptAt"])
    .index("by_item_provider_time", ["itemId", "provider", "createdAt"]),
};
