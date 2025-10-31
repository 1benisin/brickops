import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// INTERNAL MUTATIONS (for data upserts and outbox management)
// ============================================================================

/**
 * Enqueue a catalog refresh request to the outbox
 * Idempotent - won't create duplicate if already pending/inflight
 * Returns the message ID if created, or undefined if duplicate found
 */
export const enqueueCatalogRefresh = internalMutation({
  args: {
    tableName: v.union(v.literal("parts"), v.literal("partColors"), v.literal("partPrices")),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
    lastFetched: v.optional(v.number()),
    priority: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"catalogRefreshOutbox"> | undefined> => {
    // Check if already queued (pending or inflight)
    const existing = await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q
          .eq("tableName", args.tableName)
          .eq("primaryKey", args.primaryKey)
          .eq("secondaryKey", args.secondaryKey),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();

    if (existing) {
      // Already queued, skip
      return undefined;
    }

    // Generate display recordId
    const recordId = args.secondaryKey
      ? `${args.primaryKey}:${args.secondaryKey}`
      : args.primaryKey;

    // Insert to outbox and return ID
    const messageId = await ctx.db.insert("catalogRefreshOutbox", {
      tableName: args.tableName,
      primaryKey: args.primaryKey,
      secondaryKey: args.secondaryKey,
      recordId,
      priority: args.priority,
      lastFetched: args.lastFetched,
      status: "pending",
      attempt: 0,
      nextAttemptAt: Date.now(), // Immediate processing
      createdAt: Date.now(),
    });

    return messageId;
  },
});

// ============================================================================
// UPSERT MUTATIONS
// ============================================================================

export const upsertPart = internalMutation({
  args: {
    data: v.object({
      no: v.string(),
      name: v.string(),
      type: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")),
      categoryId: v.optional(v.number()),
      alternateNo: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      weight: v.optional(v.number()),
      dimX: v.optional(v.string()),
      dimY: v.optional(v.string()),
      dimZ: v.optional(v.string()),
      yearReleased: v.optional(v.number()),
      description: v.optional(v.string()),
      isObsolete: v.optional(v.boolean()),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Check if part already exists
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.data.no))
      .first();

    if (existing) {
      // Update existing part (preserve original createdAt)
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      // Insert new part
      await ctx.db.insert("parts", args.data);
    }
  },
});

/**
 * Upsert part colors into database
 * Internal mutation used by refresh actions and background queue processor
 */
export const upsertPartColors = internalMutation({
  args: {
    data: v.array(
      v.object({
        partNo: v.string(),
        colorId: v.number(),
        quantity: v.number(),
        lastFetched: v.number(),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const partColor of args.data) {
      // Check if this part-color combination exists
      const existing = await ctx.db
        .query("partColors")
        .withIndex("by_partNo_colorId", (q) =>
          q.eq("partNo", partColor.partNo).eq("colorId", partColor.colorId),
        )
        .first();

      if (existing) {
        // Update existing (preserve original createdAt)
        const { createdAt: _unused, ...updateData } = partColor;
        await ctx.db.patch(existing._id, updateData);
      } else {
        // Insert new
        await ctx.db.insert("partColors", partColor);
      }
    }
  },
});

/**
 * Upsert category data into database
 * Internal mutation used by refresh actions and background queue processor
 */
export const upsertCategory = internalMutation({
  args: {
    data: v.object({
      categoryId: v.number(),
      categoryName: v.string(),
      parentId: v.optional(v.number()),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.data.categoryId))
      .first();

    if (existing) {
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("categories", args.data);
    }
  },
});

/**
 * Upsert price guide data into database
 * Internal mutation used by refresh actions to insert/update all 4 price records
 */
export const upsertPriceGuide = internalMutation({
  args: {
    prices: v.array(
      v.object({
        partNo: v.string(),
        partType: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")),
        colorId: v.number(),
        newOrUsed: v.union(v.literal("N"), v.literal("U")),
        currencyCode: v.string(),
        minPrice: v.optional(v.number()),
        maxPrice: v.optional(v.number()),
        avgPrice: v.optional(v.number()),
        qtyAvgPrice: v.optional(v.number()),
        unitQuantity: v.optional(v.number()),
        totalQuantity: v.optional(v.number()),
        guideType: v.union(v.literal("sold"), v.literal("stock")),
        lastFetched: v.number(),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const price of args.prices) {
      // Find existing record by part + color + condition + guide type
      const existing = await ctx.db
        .query("partPrices")
        .withIndex("by_partNo_colorId_newOrUsed", (q) =>
          q
            .eq("partNo", price.partNo)
            .eq("colorId", price.colorId)
            .eq("newOrUsed", price.newOrUsed),
        )
        .filter((q) => q.eq(q.field("guideType"), price.guideType))
        .first();

      if (existing) {
        // Update existing (preserve original createdAt)
        const { createdAt: _unused, ...updateData } = price;
        await ctx.db.patch(existing._id, updateData);
      } else {
        // Insert new
        await ctx.db.insert("partPrices", price);
      }
    }
  },
});

/**
 * Upsert part color image into database
 * Internal mutation used by on-demand fetch action
 */
// (upsertPartColorImage removed)
