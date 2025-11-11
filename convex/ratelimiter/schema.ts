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

export const ratelimitTables = {
  rateLimits: defineTable({
    bucket: v.string(), // e.g. "brickopsSuperAdmin" or businessAccountId
    provider: providerValidator,
    capacity: v.number(),
    windowMs: v.number(),
    remaining: v.number(),
    resetAt: v.number(), // epoch ms
    updatedAt: v.number(),
  }).index("by_bucket", ["bucket"]),
};
