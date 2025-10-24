import { defineTable } from "convex/server";
import { v } from "convex/values";

export const usersTables = {
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

    // User preferences
    useSortLocations: v.optional(v.boolean()),

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

  // Generic rate limiting events to protect sensitive endpoints
  rateLimitEvents: defineTable({
    key: v.string(), // e.g., ba:{id}:invite_create, email:{addr}:invite_create, token:{token}:invite_redeem
    kind: v.string(), // logical bucket, e.g., invite_create, invite_redeem
    createdAt: v.number(),
  }).index("by_key_kind", ["key", "kind"]),
};
