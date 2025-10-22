import { defineTable } from "convex/server";
import { v } from "convex/values";

export const identifyTables = {
  bricklinkElementReference: defineTable({
    elementId: v.string(),
    partNumber: v.string(),
    colorId: v.number(),
    bricklinkPartId: v.optional(v.string()),
    designId: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_element", ["elementId"])
    .index("by_part", ["partNumber"])
    .index("by_color", ["colorId"]),
};
