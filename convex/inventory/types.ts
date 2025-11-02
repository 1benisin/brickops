import { v } from "convex/values";
import type { Infer } from "convex/values";

// QuerySpec - unified query contract between UI and server
export const querySpecValidator = v.object({
  filters: v.optional(
    v.object({
      // Text prefix searches
      partNumber: v.optional(
        v.object({
          kind: v.literal("prefix"),
          value: v.string(),
        }),
      ),
      name: v.optional(
        v.object({
          kind: v.literal("prefix"),
          value: v.string(),
        }),
      ),
      colorId: v.optional(
        v.object({
          kind: v.literal("prefix"),
          value: v.string(),
        }),
      ),

      // Number range filters
      price: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      quantityAvailable: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      quantityReserved: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),

      // Date range filters
      createdAt: v.optional(
        v.object({
          kind: v.literal("dateRange"),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
        }),
      ),
      updatedAt: v.optional(
        v.object({
          kind: v.literal("dateRange"),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
        }),
      ),

      // Enum filters
      condition: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),
      location: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),
    }),
  ),

  sort: v.array(
    v.object({
      id: v.string(), // column id: "partNumber", "createdAt", "price", etc.
      desc: v.boolean(),
    }),
  ),

  pagination: v.object({
    cursor: v.optional(v.string()), // Document _id for cursor-based pagination
    pageSize: v.number(), // Capped at 25/50/100
  }),
});

export type QuerySpec = Infer<typeof querySpecValidator>;
