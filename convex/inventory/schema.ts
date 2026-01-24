import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Inventory Module Schema
 *
 * Tables for inventory management:
 * - inventoryItems: Core inventory records
 * - inventoryQuantityLedger: Event-sourced quantity changes
 * - inventoryLocationLedger: Event-sourced location changes
 *
 * Note: Marketplace sync state is now in the sync/ module:
 * - inventorySyncState: Per-item, per-provider sync status (sync/schema.ts)
 * - marketplaceOutbox: Transactional outbox for sync operations (sync/schema.ts)
 */

export const inventoryTables = {
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
    // createdAt removed - using _creationTime
    updatedAt: v.optional(v.number()),
    // Soft delete support
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    // Unified lifecycle status for the item
    lifecycleStatus: v.union(
      v.literal("awaiting_catalog"),
      v.literal("ready_to_sync"),
      v.literal("synced"),
      v.literal("error"),
    ),
    // Note: marketplaceSync field removed - sync state is now in inventorySyncState table
  })
    // Existing indexes (keep these)
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_partNumber_lifecycleStatus", ["partNumber", "lifecycleStatus"])

    // NEW: Composite indexes for common query patterns
    // Pattern: default listing (sort by createdAt desc)

    // Pattern: filter by condition + sort by date
    .index("by_businessAccount_condition", ["businessAccountId", "condition"])

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

  // Note: marketplaceOutbox moved to sync/schema.ts
};
