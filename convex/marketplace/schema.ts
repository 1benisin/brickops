import { defineTable } from "convex/server";
import { v } from "convex/values";

export const marketplaceTables = {
  // User marketplace credentials (BYOK model) - encrypted at rest
  marketplaceCredentials: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    // Encrypted OAuth 1.0a credentials for BrickLink
    bricklinkConsumerKey: v.optional(v.string()), // encrypted
    bricklinkConsumerSecret: v.optional(v.string()), // encrypted
    bricklinkTokenValue: v.optional(v.string()), // encrypted
    bricklinkTokenSecret: v.optional(v.string()), // encrypted
    // Encrypted API key for BrickOwl
    brickowlApiKey: v.optional(v.string()), // encrypted
    // Metadata
    isActive: v.boolean(),
    syncEnabled: v.optional(v.boolean()), // Default: true for backward compatibility
    lastValidatedAt: v.optional(v.number()),
    validationStatus: v.optional(
      v.union(v.literal("success"), v.literal("pending"), v.literal("failed")),
    ),
    validationMessage: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_provider", ["businessAccountId", "provider"])
    .index("by_businessAccount", ["businessAccountId"]),

  // Per-business-account rate limiting for marketplace APIs
  marketplaceRateLimits: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    // Quota tracking
    windowStart: v.number(), // Unix timestamp when current window started
    requestCount: v.number(), // Requests made in current window
    capacity: v.number(), // Max requests per window (see marketplace/rateLimitConfig.ts)
    windowDurationMs: v.number(), // Window size in ms (see marketplace/rateLimitConfig.ts)
    // Alerting
    alertThreshold: v.number(), // Percentage (0-1) to trigger alert (default: 0.8)
    alertEmitted: v.boolean(), // Whether alert has been sent for current window
    // Circuit breaker
    consecutiveFailures: v.number(), // Track failures for circuit breaker
    circuitBreakerOpenUntil: v.optional(v.number()), // If set, circuit is open
    // Metadata
    lastRequestAt: v.number(),
    lastResetAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business_provider", ["businessAccountId", "provider"]),
};
