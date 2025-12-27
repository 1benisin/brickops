import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export type RateLimitConfig = {
  capacity: number;
  windowDurationMs: number;
  alertThreshold: number;
};

export const providerValidator = v.union(
  v.literal("bricklink"),
  v.literal("brickowl"),
  v.literal("rebrickable"),
);
export type Provider = Infer<typeof providerValidator>;

/**
 * Circuit breaker configuration constants
 */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
export const CIRCUIT_BREAKER_OPEN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const ratelimitTables = {
  rateLimits: defineTable({
    // Key fields
    bucket: v.string(), // e.g. "bricklink:account:{id}" or "rebrickable:global"
    provider: providerValidator,

    // Quota tracking (token bucket)
    capacity: v.number(), // Max requests per window
    windowMs: v.number(), // Window size in ms
    remaining: v.number(), // Tokens remaining in current window
    resetAt: v.number(), // epoch ms when window resets

    // Observability (request counting)
    requestCount: v.number(), // Total requests made in current window
    windowStart: v.number(), // epoch ms when current window started

    // Alerting
    alertThreshold: v.number(), // Percentage (0-1) to trigger alert (default: 0.8)
    alertEmitted: v.boolean(), // Whether alert has been sent for current window

    // Circuit breaker
    consecutiveFailures: v.number(), // Track failures for circuit breaker
    circuitBreakerOpenUntil: v.optional(v.number()), // epoch ms when circuit can close

    // Metadata
    lastRequestAt: v.number(), // Last successful request timestamp
    lastResetAt: v.number(), // Last window reset timestamp
    updatedAt: v.number(),
  })
    .index("by_bucket", ["bucket"])
    .index("by_provider", ["provider"]),
};
