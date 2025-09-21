import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  businessAccounts: defineTable({
    name: v.string(),
    ownerUserId: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerUserId"]),

  users: defineTable({
    businessAccountId: v.id("businessAccounts"),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("picker")),
    firstName: v.string(),
    lastName: v.string(),
    tokenIdentifier: v.string(),
    createdAt: v.number(),
  })
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_token", ["tokenIdentifier"]),

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
});
