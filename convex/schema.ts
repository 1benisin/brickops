import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  businessAccounts: defineTable({
    name: v.string(),
    ownerUserId: v.optional(v.id("users")),
    inviteCode: v.string(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_inviteCode", ["inviteCode"]),

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    businessAccountId: v.optional(v.id("businessAccounts")),
    role: v.union(
      v.literal("owner"),
      v.literal("manager"),
      v.literal("picker"),
      v.literal("viewer"),
    ),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("invited")),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // Per-user invitations for onboarding with explicit roles
  userInvites: defineTable({
    businessAccountId: v.id("businessAccounts"),
    email: v.string(),
    token: v.string(),
    role: v.union(v.literal("manager"), v.literal("picker"), v.literal("viewer")),
    // epoch ms
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_token", ["token"]) // resolve invite token quickly
    .index("by_email", ["email"]) // enforce uniqueness/window if desired
    .index("by_businessAccount", ["businessAccountId"]),

  // Audit log for user management events
  userAuditLogs: defineTable({
    businessAccountId: v.id("businessAccounts"),
    targetUserId: v.optional(v.id("users")),
    action: v.union(
      v.literal("invite_created"),
      v.literal("invite_redeemed"),
      v.literal("role_updated"),
      v.literal("user_removed"),
    ),
    fromRole: v.optional(
      v.union(v.literal("owner"), v.literal("manager"), v.literal("picker"), v.literal("viewer")),
    ),
    toRole: v.optional(
      v.union(v.literal("owner"), v.literal("manager"), v.literal("picker"), v.literal("viewer")),
    ),
    actorUserId: v.id("users"),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_targetUser", ["targetUserId"]) // fetch logs per user
    .index("by_businessAccount", ["businessAccountId"]) // fetch logs per tenant
    .index("by_createdAt", ["businessAccountId", "createdAt"]),

  inventoryItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    sku: v.string(),
    name: v.string(),
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    // Quantity splits to support status tracking
    quantityReserved: v.number(),
    quantitySold: v.number(),
    status: v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")),
    condition: v.union(v.literal("new"), v.literal("used")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    // Soft delete support
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_sku", ["businessAccountId", "sku"]),

  // Audit log for inventory changes
  inventoryAuditLogs: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    changeType: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("adjust"),
      v.literal("delete"),
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
  })
    .index("by_item", ["itemId"]) // fetch logs per item
    .index("by_businessAccount", ["businessAccountId"]) // fetch logs per tenant
    .index("by_createdAt", ["businessAccountId", "createdAt"]),

  // Generic rate limiting events to protect sensitive endpoints
  rateLimitEvents: defineTable({
    key: v.string(), // e.g., ba:{id}:invite_create, email:{addr}:invite_create, token:{token}:invite_redeem
    kind: v.string(), // logical bucket, e.g., invite_create, invite_redeem
    createdAt: v.number(),
  }).index("by_key_kind", ["key", "kind"]),

  // Global LEGO parts catalog (shared across all tenants) - Bricklink-aligned
  parts: defineTable({
    no: v.string(), // Bricklink's no (part number)
    name: v.string(), // Bricklink's name
    type: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")), // Bricklink's type
    categoryId: v.optional(v.number()), // Bricklink's category_id
    alternateNo: v.optional(v.string()), // Bricklink's alternate_no
    imageUrl: v.optional(v.string()), // Bricklink's image_url
    thumbnailUrl: v.optional(v.string()), // Bricklink's thumbnail_url
    weight: v.optional(v.number()), // Bricklink's weight (grams, 2 decimal places)
    dimX: v.optional(v.string()), // Bricklink's dim_x (string with 2 decimal places)
    dimY: v.optional(v.string()), // Bricklink's dim_y (string with 2 decimal places)
    dimZ: v.optional(v.string()), // Bricklink's dim_z (string with 2 decimal places)
    yearReleased: v.optional(v.number()), // Bricklink's year_released
    description: v.optional(v.string()), // Bricklink's description
    isObsolete: v.optional(v.boolean()), // Bricklink's is_obsolete
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_no", ["no"])
    .index("by_categoryId", ["categoryId"])
    .index("by_type", ["type"])
    .index("by_name", ["name"])
    .index("by_lastFetched", ["lastFetched"])
    .searchIndex("search_parts_by_name", {
      searchField: "name",
      filterFields: ["type", "categoryId", "isObsolete"],
    })
    .searchIndex("search_parts_by_no", {
      searchField: "no",
      filterFields: ["type", "categoryId", "isObsolete"],
    }),

  // Tenant-specific catalog overlays (tags, notes, sort locations per business)
  catalogPartOverlay: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNo: v.string(), // Updated to match new schema
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortLocation: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_business_part", ["businessAccountId", "partNo"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_business_sortLocation", ["businessAccountId", "sortLocation"])
    .searchIndex("search_overlay", {
      searchField: "notes",
      filterFields: ["businessAccountId", "sortLocation"],
    }),

  // Refresh queue for background data updates from Bricklink
  refreshQueue: defineTable({
    tableName: v.union(
      v.literal("parts"),
      v.literal("partColors"),
      v.literal("partPrices"),
      v.literal("colors"),
      v.literal("categories"),
    ),
    primaryKey: v.string(), // Always present: partNo, colorId, categoryId
    secondaryKey: v.optional(v.string()), // For composite keys: colorId (for partColors, partPrices)
    recordId: v.string(), // Display string for logging (e.g., "3001:1" or "3001")
    priority: v.number(), // 1 (high) to 3 (low)
    lastFetched: v.optional(v.number()), // When data was last refreshed (if known)
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status_priority", ["status", "priority"])
    .index("by_table_primary", ["tableName", "primaryKey"])
    .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"])
    .index("by_status", ["status"]),

  // Global LEGO part pricing data from Bricklink (cached with refresh capability)
  // Each part+color can have 4 price records: new/used × sold/stock
  partPrices: defineTable({
    partNo: v.string(), // Bricklink's item.no
    partType: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")), // Bricklink's item.type
    colorId: v.number(), // Bricklink's color_id (required - every price is for a specific color)
    newOrUsed: v.union(v.literal("N"), v.literal("U")), // Bricklink's new_or_used (N=new, U=used)
    currencyCode: v.string(), // Bricklink's currency_code
    minPrice: v.optional(v.number()), // Bricklink's min_price
    maxPrice: v.optional(v.number()), // Bricklink's max_price
    avgPrice: v.optional(v.number()), // Bricklink's avg_price
    qtyAvgPrice: v.optional(v.number()), // Bricklink's qty_avg_price
    unitQuantity: v.optional(v.number()), // Bricklink's unit_quantity
    totalQuantity: v.optional(v.number()), // Bricklink's total_quantity
    guideType: v.union(v.literal("sold"), v.literal("stock")), // Bricklink's guide_type (sold/stock)
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_partNo_colorId", ["partNo", "colorId"])
    .index("by_partNo_colorId_newOrUsed", ["partNo", "colorId", "newOrUsed"])
    .index("by_lastFetched", ["lastFetched"]),

  // Bricklink-aligned color reference table
  colors: defineTable({
    colorId: v.number(), // Bricklink's color_id
    colorName: v.string(), // Bricklink's color_name
    colorCode: v.optional(v.string()), // Bricklink's color_code (hex)
    colorType: v.optional(v.string()), // Bricklink's color_type
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_colorId", ["colorId"])
    .searchIndex("search_color_name", {
      searchField: "colorName",
      filterFields: ["colorType"],
    }),

  // Bricklink-aligned category reference table
  categories: defineTable({
    categoryId: v.number(), // Bricklink's category_id
    categoryName: v.string(), // Bricklink's category_name
    parentId: v.optional(v.number()), // Bricklink's parent_id (0 if root)
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_categoryId", ["categoryId"])
    .index("by_parentId", ["parentId"])
    .searchIndex("search_category_name", {
      searchField: "categoryName",
      filterFields: ["parentId"],
    }),

  // Part-color relationships from Bricklink
  partColors: defineTable({
    partNo: v.string(), // Bricklink's part no
    colorId: v.number(), // Bricklink's color_id
    quantity: v.number(), // Bricklink's quantity
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_colorId", ["colorId"])
    .index("by_partNo_colorId", ["partNo", "colorId"]),

  bricklinkElementReference: defineTable({
    elementId: v.string(),
    partNumber: v.string(),
    colorId: v.number(),
    bricklinkPartId: v.optional(v.string()),
    designId: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_part", ["partNumber"])
    .index("by_color", ["colorId"]),
});
