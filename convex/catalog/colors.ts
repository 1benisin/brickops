import { query, internalQuery, internalMutation, action } from "../_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import {
  colorsReturnValidator,
  colorTableFields,
  partColorTableFields,
} from "./validators";
import { requireActiveUser } from "./helpers";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all colors
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getColors = query({
  args: {},
  returns: colorsReturnValidator,
  handler: async (ctx) => {
    const colors = await ctx.db.query("colors").collect();

    return colors.map((color) => ({
      colorId: color.colorId,
      colorName: color.colorName,
      colorCode: color.colorCode,
      colorType: color.colorType,
      lastFetched: color.lastFetched,
    }));
  },
});

/**
 * Get part colors with status information for reactive hooks
 */
export const getPartColors = query({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const partColors = await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", args.partNumber))
      .collect();

    if (partColors.length === 0) {
      return {
        data: [],
        status: "missing" as const,
      };
    }

    // Get color details for each
    const colorDetails = await Promise.all(
      partColors.map(async (pc) => {
        const color = await ctx.db
          .query("colors")
          .withIndex("by_colorId", (q) => q.eq("colorId", pc.colorId))
          .first();

        return {
          colorId: pc.colorId,
          name: pc.colorId === 0 ? "(Not Applicable)" : color?.colorName ?? "",
          hexCode: pc.colorId === 0 ? "#ffffff" : color?.colorCode ?? "",
          type: pc.colorId === 0 ? "Not Applicable" : color?.colorType ?? "",
        };
      }),
    );

    // Determine status: stale vs fresh based on lastFetched
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const status: "stale" | "fresh" = partColors.some((pc) => pc.lastFetched < thirtyDaysAgo)
      ? "stale"
      : "fresh";

    return {
      data: colorDetails,
      status,
    };
  },
});

/**
 * Get color data for internal use (returns raw schema)
 */
export const getColorInternal = internalQuery({
  args: {
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("colors")
      .withIndex("by_colorId", (q) => q.eq("colorId", args.colorId))
      .first();
  },
});

export const getColorByBrickowlColorId = internalQuery({
  args: {
    brickowlColorId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("colors")
      .withIndex("by_brickowlColorId", (q) => q.eq("brickowlColorId", args.brickowlColorId))
      .first();
  },
});

/**
 * Get part colors data for internal use
 */
export const getPartColorsInternal = internalQuery({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", args.partNumber))
      .collect();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const partColorRecordValidator = v.object(partColorTableFields);

export type PartColorRecord = Infer<typeof partColorRecordValidator>;

/**
 * Upsert part colors into database
 * Internal mutation used by refresh actions and background queue processor
 */
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
        // Update existing
        await ctx.db.patch(existing._id, partColor);
      } else {
        // Insert new
        await ctx.db.insert("partColors", partColor);
      }
    }
  },
});

/**
 * Upsert color data into database
 * Internal mutation used by refresh actions and background queue processor
 */
export const colorRecordValidator = v.object(colorTableFields);

export type ColorRecord = Infer<typeof colorRecordValidator>;

export const upsertColor = internalMutation({
  args: {
    data: colorRecordValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("colors")
      .withIndex("by_colorId", (q) => q.eq("colorId", args.data.colorId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args.data);
    } else {
      await ctx.db.insert("colors", args.data);
    }
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Enqueue part colors refresh - triggers the self-scheduling ensureCatalogPart orchestrator.
 * Used by reactive hooks to trigger data updates.
 *
 * This delegates to the new ensureCatalogPart pattern which handles
 * rate limiting and retries internally via self-scheduling.
 */
export const enqueueRefreshPartColors = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Delegate to new self-scheduling orchestrator
    // forceRefresh: true ensures we fetch fresh data even if existing data isn't stale
    await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
      partNumber: args.partNumber,
      forceRefresh: true,
    });
  },
});
