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

  // Global LEGO parts catalog (shared across all tenants)
  parts: defineTable({
    partNumber: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    categoryPath: v.optional(v.array(v.number())),
    categoryPathKey: v.optional(v.string()),

    // Imagery
    imageUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),

    // Bricklink integration
    bricklinkPartId: v.optional(v.string()),
    bricklinkCategoryId: v.optional(v.number()),

    // Physical attributes
    isPrinted: v.optional(v.boolean()),
    isObsolete: v.optional(v.boolean()),
    weight: v.optional(
      v.object({
        grams: v.optional(v.number()),
      }),
    ),
    dimensions: v.optional(
      v.object({
        lengthMm: v.optional(v.number()),
        widthMm: v.optional(v.number()),
        heightMm: v.optional(v.number()),
      }),
    ),

    // Catalog enrichment (required: used for full text search)
    searchKeywords: v.string(),
    primaryColorId: v.optional(v.number()),
    availableColorIds: v.optional(v.array(v.number())),

    // Data freshness and source tracking
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
    lastUpdated: v.number(),
    lastFetchedFromBricklink: v.optional(v.number()),
    dataFreshness: v.union(
      v.literal("fresh"),
      v.literal("background"),
      v.literal("stale"),
      v.literal("expired"),
    ),
    freshnessUpdatedAt: v.optional(v.number()),

    // Metadata
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNumber", ["partNumber"])
    .index("by_category", ["category"])
    .index("by_categoryPathKey", ["categoryPathKey"])
    .index("by_primaryColor", ["primaryColorId"])
    .index("by_isPrinted", ["isPrinted"])
    .index("by_dataFreshness", ["dataFreshness"])
    .index("by_lastUpdated", ["lastUpdated"])
    .index("by_lastFetchedFromBricklink", ["lastFetchedFromBricklink"])
    // Sorting/browsing indexes
    .index("by_name", ["name"])
    .index("by_category_and_name", ["bricklinkCategoryId", "name"])
    .searchIndex("search_parts_by_name", {
      searchField: "name",
      filterFields: [
        "category",
        "primaryColorId",
        "categoryPathKey",
        "isPrinted",
        "bricklinkCategoryId",
        "availableColorIds",
        "dataFreshness",
      ],
    }),

  // Tenant-specific catalog overlays (tags, notes, sort locations per business)
  catalogPartOverlay: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNumber: v.string(),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortGrid: v.optional(v.string()),
    sortBin: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_business_part", ["businessAccountId", "partNumber"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_business_sortLocation", ["businessAccountId", "sortGrid", "sortBin"])
    .searchIndex("search_overlay", {
      searchField: "notes",
      filterFields: ["businessAccountId", "sortGrid", "sortBin"],
    }),

  // Global LEGO part pricing data from Bricklink (cached with refresh capability)
  // Each part+color can have 4 price records: new/used × sold/stock
  partPrices: defineTable({
    partNumber: v.string(),
    colorId: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
    priceType: v.union(
      v.literal("sold"), // Average sold prices (last 6 months)
      v.literal("stock"), // Current for-sale/stock prices
    ),

    // Price statistics from Bricklink price guide API
    currency: v.string(), // Usually "USD"
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    avgPrice: v.optional(v.number()),
    qtyAvgPrice: v.optional(v.number()), // Quantity-weighted average
    unitQuantity: v.optional(v.number()), // Number of individual units
    totalQuantity: v.optional(v.number()), // Total quantity across all lots

    // Data freshness tracking for passthrough refresh
    lastSyncedAt: v.number(),
    dataFreshness: v.union(v.literal("fresh"), v.literal("stale"), v.literal("expired")),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_part_color", ["partNumber", "colorId"])
    .index("by_part_color_condition_type", ["partNumber", "colorId", "condition", "priceType"])
    .index("by_freshness", ["dataFreshness"])
    .index("by_lastSynced", ["lastSyncedAt"]),

  bricklinkColorReference: defineTable({
    bricklinkColorId: v.number(),
    name: v.string(),
    rgb: v.optional(v.string()),
    colorType: v.optional(v.string()),
    isTransparent: v.optional(v.boolean()),
    syncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_colorId", ["bricklinkColorId"])
    .searchIndex("search_color_name", {
      searchField: "name",
      filterFields: ["colorType"],
    }),

  bricklinkCategoryReference: defineTable({
    bricklinkCategoryId: v.number(),
    name: v.string(),
    parentCategoryId: v.optional(v.number()),
    path: v.optional(v.array(v.number())),
    pathKey: v.optional(v.string()),
    syncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_categoryId", ["bricklinkCategoryId"])
    .index("by_parent", ["parentCategoryId"])
    .index("by_pathKey", ["pathKey"])
    .searchIndex("search_category_name", {
      searchField: "name",
      filterFields: ["parentCategoryId"],
    }),

  bricklinkPartColorAvailability: defineTable({
    partNumber: v.string(),
    bricklinkPartId: v.optional(v.string()),
    colorId: v.number(),
    elementIds: v.optional(v.array(v.string())),
    isLegacy: v.optional(v.boolean()),
    syncedAt: v.number(),
  })
    .index("by_part", ["partNumber"])
    .index("by_color", ["colorId"]),

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
