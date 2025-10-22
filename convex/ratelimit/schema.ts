import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ratelimitTables = {
  rateLimits: defineTable({
    bucket: v.string(), // e.g. "bricklink:global"
    capacity: v.number(),
    windowMs: v.number(),
    remaining: v.number(),
    resetAt: v.number(), // epoch ms
    updatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_bucket", ["bucket"]),
};
