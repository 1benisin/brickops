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

  legoPartCatalog: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNumber: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    bricklinkPartId: v.optional(v.string()),
    bricklinkCategoryId: v.optional(v.number()),

    // Data freshness and source tracking
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
    lastUpdated: v.number(),
    lastFetchedFromBricklink: v.optional(v.number()),
    dataFreshness: v.union(v.literal("fresh"), v.literal("stale"), v.literal("expired")),

    // Metadata
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_partNumber", ["businessAccountId", "partNumber"])
    .index("by_category", ["businessAccountId", "category"])
    .index("by_dataFreshness", ["businessAccountId", "dataFreshness"])
    .index("by_lastUpdated", ["businessAccountId", "lastUpdated"])
    .searchIndex("search_parts", {
      searchField: "name",
      filterFields: ["businessAccountId", "category"],
    }),
});
