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
    // Webhook configuration for BrickLink push notifications
    webhookToken: v.optional(v.string()), // Unique token for webhook URL routing
    lastCentralPolledAt: v.optional(v.number()), // Last time GET /notifications was called
  })
    .index("by_business_provider", ["businessAccountId", "provider"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_webhookToken", ["webhookToken"])
    .index("by_provider_active", ["provider", "isActive"]),

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

  // BrickLink push notifications (from webhooks or polling)
  bricklinkNotifications: defineTable({
    businessAccountId: v.id("businessAccounts"),
    eventType: v.union(v.literal("Order"), v.literal("Message"), v.literal("Feedback")),
    resourceId: v.number(), // Order ID, Message ID, or Feedback ID
    timestamp: v.string(), // ISO 8601 timestamp from BrickLink
    occurredAt: v.number(), // Parsed timestamp in ms (epoch)
    dedupeKey: v.string(), // storeId:event_type:resource_id:timestamp for idempotency
    status: v.union(
      v.literal("pending"), // Not yet processed
      v.literal("processing"), // Currently being processed
      v.literal("completed"), // Successfully processed
      v.literal("failed"), // Processing failed (will retry)
      v.literal("dead_letter"), // Failed after max attempts
    ),
    attempts: v.number(), // Number of processing attempts
    lastError: v.optional(v.string()), // Last error message if failed
    processedAt: v.optional(v.number()), // When processing completed
    createdAt: v.number(), // When notification was received/created
    updatedAt: v.number(),
  })
    .index("by_business_status", ["businessAccountId", "status"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_business_created", ["businessAccountId", "createdAt"]),
};
