import { defineTable } from "convex/server";
import { v } from "convex/values";
import { providerValidator } from "./rateLimitConfig";

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
