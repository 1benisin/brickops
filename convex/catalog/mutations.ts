import { internalMutation } from "../_generated/server";
import type { DatabaseWriter } from "../_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import {
  categoryTableFields,
  colorTableFields,
  partColorTableFields,
  partPriceTableFields,
  partTableFields,
} from "./validators";

// ============================================================================
// SHARED MUTATION HELPERS
// ============================================================================

/**
 * Logic to ensure a part exists, creating a placeholder if it doesn't.
 * Can be called from any mutation.
 *
 * Note: This only creates the placeholder. Callers are responsible for
 * triggering ensureCatalogPart to fetch the actual part data.
 */
export async function ensurePartPlaceholder(ctx: { db: DatabaseWriter }, partNumber: string) {
  const existing = await ctx.db
    .query("parts")
    .withIndex("by_no", (q) => q.eq("no", partNumber))
    .first();

  if (existing) {
    return existing;
  }

  // Create placeholder part
  const partId = await ctx.db.insert("parts", {
    no: partNumber,
    name: `Placeholder for ${partNumber}`,
    type: "PART", // Default to PART, ensureCatalogPart will correct it
    lastFetched: 0,
    status: "pending",
    updatedAt: Date.now(),
  });

  const part = await ctx.db.get(partId);
  if (!part) throw new Error("Failed to retrieve created part");
  return part;
}

// ============================================================================
// UPSERT MUTATIONS
// ============================================================================

export const upsertPartDataValidator = v.object(partTableFields);
export type UpsertPartData = Infer<typeof upsertPartDataValidator>;

export const upsertPart = internalMutation({
  args: {
    data: upsertPartDataValidator,
  },
  handler: async (ctx, args) => {
    // Check if part already exists
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.data.no))
      .first();

    if (existing) {
      // Update existing part (system field: _creationTime is preserved automatically)
      await ctx.db.patch(existing._id, { ...args.data, status: "complete" });
    } else {
      // Insert new part
      await ctx.db.insert("parts", { ...args.data, status: "complete" });
    }
  },
});

export const updatePartBrickowlId = internalMutation({
  args: {
    partNumber: v.string(),
    brickowlId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    if (!existing) {
      return;
    }

    await ctx.db.patch(existing._id, {
      brickowlId: args.brickowlId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Upsert part colors into database
 * Internal mutation used by refresh actions and background queue processor
 */
export const partColorRecordValidator = v.object(partColorTableFields);
export type PartColorRecord = Infer<typeof partColorRecordValidator>;

export const upsertPartColors = internalMutation({
  args: {
    data: v.array(partColorRecordValidator),
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
        // Update existing (system field: _creationTime is preserved automatically)
        await ctx.db.patch(existing._id, partColor);
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
export const categoryRecordValidator = v.object(categoryTableFields);
export type CategoryRecord = Infer<typeof categoryRecordValidator>;

export const colorRecordValidator = v.object(colorTableFields);
export type ColorRecord = Infer<typeof colorRecordValidator>;

export const upsertCategory = internalMutation({
  args: {
    data: categoryRecordValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.data.categoryId))
      .first();

    if (existing) {
      // Update existing (system field: _creationTime is preserved automatically)
      await ctx.db.patch(existing._id, args.data);
    } else {
      await ctx.db.insert("categories", args.data);
    }
  },
});

/**
 * Upsert price guide data into database
 * Internal mutation used by refresh actions to insert/update all 4 price records
 */
export const priceGuideRecordValidator = v.object(partPriceTableFields);
export type PriceGuideRecord = Infer<typeof priceGuideRecordValidator>;

export const upsertPriceGuide = internalMutation({
  args: {
    prices: v.array(priceGuideRecordValidator),
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
        // Update existing (system field: _creationTime is preserved automatically)
        await ctx.db.patch(existing._id, price);
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
