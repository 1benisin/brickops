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
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("picker")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("invited")),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  inventoryItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    sku: v.string(),
    name: v.string(),
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_sku", ["businessAccountId", "sku"]),

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
