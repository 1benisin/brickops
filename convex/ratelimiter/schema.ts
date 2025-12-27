import { defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export type RateLimitConfig = {
  capacity: number;
  windowDurationMs: number;
};

export const providerValidator = v.union(
  v.literal("bricklink"),
  v.literal("brickowl"),
  v.literal("rebrickable"),
);
export type Provider = Infer<typeof providerValidator>;

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

    // Metadata
    updatedAt: v.number(),
  })
    .index("by_bucket", ["bucket"])
    .index("by_provider", ["provider"]),
};
