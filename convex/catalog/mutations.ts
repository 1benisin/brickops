import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================================================
// INTERNAL MUTATIONS (for data upserts and locking)
// ============================================================================

/**
 * Acquire refresh lock for a part
 * Returns true if lock was acquired, false if already locked
 */
export const markPartRefreshing = internalMutation({
  args: { partNumber: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    if (existing) {
      // Only set lock if not already locked
      if (!existing.refreshUntil || existing.refreshUntil < Date.now()) {
        await ctx.db.patch(existing._id, {
          refreshUntil: Date.now() + 60_000, // 1 minute lock
        });
        return true; // Lock acquired
      }
      return false; // Already locked
    }
    return true; // No existing record, can proceed
  },
});

/**
 * Release refresh lock for a part
 */
export const clearPartRefreshing = internalMutation({
  args: { partNumber: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { refreshUntil: 0 });
    }
  },
});

/**
 * Acquire refresh lock for a category
 */
export const markCategoryRefreshing = internalMutation({
  args: { categoryId: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .first();

    if (existing) {
      if (!existing.refreshUntil || existing.refreshUntil < Date.now()) {
        await ctx.db.patch(existing._id, {
          refreshUntil: Date.now() + 60_000,
        });
        return true;
      }
      return false;
    }
    return true;
  },
});

/**
 * Release refresh lock for a category
 */
export const clearCategoryRefreshing = internalMutation({
  args: { categoryId: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { refreshUntil: 0 });
    }
  },
});

/**
 * Acquire refresh lock for partColors
 */
export const markPartColorsRefreshing = internalMutation({
  args: { partNumber: v.string() },
  handler: async (ctx, args) => {
    // Lock all partColor records for this part
    const records = await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", args.partNumber))
      .collect();

    if (records.length > 0) {
      // Check if any are already locked
      const anyLocked = records.some((r) => r.refreshUntil && r.refreshUntil > Date.now());
      if (anyLocked) return false;

      // Lock all
      const lockTime = Date.now() + 60_000;
      await Promise.all(records.map((r) => ctx.db.patch(r._id, { refreshUntil: lockTime })));
      return true;
    }
    return true; // No existing records, can proceed
  },
});

/**
 * Release refresh lock for partColors
 */
export const clearPartColorsRefreshing = internalMutation({
  args: { partNumber: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", args.partNumber))
      .collect();

    await Promise.all(records.map((r) => ctx.db.patch(r._id, { refreshUntil: 0 })));
  },
});

/**
 * Acquire refresh lock for price guide (all 4 price records for a part+color)
 * Returns true if lock was acquired, false if already locked
 */
export const markPriceGuideRefreshing = internalMutation({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    // Lock all partPrice records for this part+color combination
    const records = await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.partNumber).eq("colorId", args.colorId),
      )
      .collect();

    if (records.length > 0) {
      // Check if any are already locked
      const anyLocked = records.some((r) => r.refreshUntil && r.refreshUntil > Date.now());
      if (anyLocked) return false;

      // Lock all
      const lockTime = Date.now() + 60_000; // 1 minute lock
      await Promise.all(records.map((r) => ctx.db.patch(r._id, { refreshUntil: lockTime })));
      return true;
    }
    return true; // No existing records, can proceed
  },
});

/**
 * Release refresh lock for price guide
 */
export const clearPriceGuideRefreshing = internalMutation({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.partNumber).eq("colorId", args.colorId),
      )
      .collect();

    await Promise.all(records.map((r) => ctx.db.patch(r._id, { refreshUntil: 0 })));
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
