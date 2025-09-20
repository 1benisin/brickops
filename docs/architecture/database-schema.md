# Database Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User Management
  businessAccounts: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    bricklinkCredentials: v.optional(
      v.object({
        consumerKey: v.string(),
        consumerSecret: v.string(),
        tokenValue: v.string(),
        tokenSecret: v.string(),
        encrypted: v.boolean(),
      })
    ),
    brickowlCredentials: v.optional(
      v.object({
        apiKey: v.string(),
        encrypted: v.boolean(),
      })
    ),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("trial")
    ),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  users: defineTable({
    email: v.string(),
    businessAccountId: v.id("businessAccounts"),
    role: v.union(
      v.literal("owner"),
      v.literal("manager"),
      v.literal("picker"),
      v.literal("view-only")
    ),
    firstName: v.string(),
    lastName: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_email", ["email"]),

  // Catalog Management
  legoPartCatalog: defineTable({
    partNumber: v.string(), // Primary identifier
    partName: v.string(),
    categoryId: v.string(),
    imageUrl: v.optional(v.string()),
    colors: v.array(
      v.object({
        colorId: v.string(),
        colorName: v.string(),
        available: v.boolean(),
      })
    ),
    approximatePrice: v.optional(v.number()),
    lastUpdated: v.number(),
    source: v.union(v.literal("brickops"), v.literal("bricklink")),
  })
    .index("by_part_number", ["partNumber"])
    .index("by_category", ["categoryId"])
    .index("by_last_updated", ["lastUpdated"])
    .searchIndex("search_parts", {
      searchField: "partName",
      filterFields: ["categoryId", "source"],
    }),

  // Inventory Management
  inventoryItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNumber: v.string(),
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    quantityReserved: v.number(),
    quantitySold: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_part_and_business", ["businessAccountId", "partNumber"])
    .index("by_location", ["businessAccountId", "location"])
    .index("by_updated", ["updatedAt"]),

  inventoryAuditLog: defineTable({
    businessAccountId: v.id("businessAccounts"),
    inventoryItemId: v.id("inventoryItems"),
    userId: v.id("users"),
    changeType: v.union(
      v.literal("created"),
      v.literal("quantity_updated"),
      v.literal("location_changed"),
      v.literal("status_changed"),
      v.literal("deleted")
    ),
    previousValues: v.optional(v.any()),
    newValues: v.any(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_inventory_item", ["inventoryItemId"])
    .index("by_date", ["createdAt"]),

  // Order Management
  marketplaceOrders: defineTable({
    businessAccountId: v.id("businessAccounts"),
    marketplaceOrderId: v.string(),
    marketplace: v.union(v.literal("bricklink"), v.literal("brickowl")),
    customerName: v.string(),
    customerAddress: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zipCode: v.string(),
      country: v.string(),
    }),
    orderStatus: v.union(
      v.literal("pending"),
      v.literal("picked"),
      v.literal("shipped"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    totalValue: v.number(),
    orderItems: v.array(
      v.object({
        partNumber: v.string(),
        colorId: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        condition: v.union(v.literal("new"), v.literal("used")),
      })
    ),
    syncedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_marketplace", ["businessAccountId", "marketplace"])
    .index("by_status", ["businessAccountId", "orderStatus"])
    .index("by_marketplace_order_id", ["marketplace", "marketplaceOrderId"])
    .index("by_sync_date", ["syncedAt"]),

  // Pick Session Management
  pickSessions: defineTable({
    businessAccountId: v.id("businessAccounts"),
    pickerUserId: v.id("users"),
    orderIds: v.array(v.id("marketplaceOrders")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed")
    ),
    pickPath: v.array(
      v.object({
        partNumber: v.string(),
        colorId: v.string(),
        location: v.string(),
        quantityNeeded: v.number(),
        orderIds: v.array(v.id("marketplaceOrders")),
      })
    ),
    currentPosition: v.number(),
    issuesEncountered: v.array(
      v.object({
        partNumber: v.string(),
        colorId: v.string(),
        issueType: v.string(),
        notes: v.optional(v.string()),
        timestamp: v.number(),
      })
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_picker", ["pickerUserId"])
    .index("by_status", ["businessAccountId", "status"]),

  // TODO Management
  todoItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNumber: v.string(),
    colorId: v.string(),
    quantityNeeded: v.number(),
    orderId: v.id("marketplaceOrders"),
    pickSessionId: v.optional(v.id("pickSessions")),
    reason: v.union(
      v.literal("not_found"),
      v.literal("damaged"),
      v.literal("insufficient_quantity"),
      v.literal("wrong_color")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("resolved"),
      v.literal("refunded")
    ),
    notes: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_order", ["orderId"])
    .index("by_status", ["businessAccountId", "status"])
    .index("by_created_date", ["createdAt"]),

  // Part Identification History
  partIdentifications: defineTable({
    businessAccountId: v.id("businessAccounts"),
    userId: v.id("users"),
    imageFileId: v.id("_storage"),
    identificationResults: v.array(
      v.object({
        partNumber: v.string(),
        colorId: v.optional(v.string()),
        confidence: v.number(),
        source: v.literal("brickognize"),
      })
    ),
    userConfirmedResult: v.optional(
      v.object({
        partNumber: v.string(),
        colorId: v.string(),
        wasCorrect: v.boolean(),
      })
    ),
    createdAt: v.number(),
  })
    .index("by_business_account", ["businessAccountId"])
    .index("by_user", ["userId"])
    .index("by_date", ["createdAt"]),
});
```
