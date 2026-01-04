import { query, internalQuery, internalMutation, action } from "../_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { partPriceTableFields } from "./validators";
import { requireActiveUser } from "./helpers";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get price guide with status information for reactive hooks
 * Returns all 4 price types (new/used × stock/sold) for a specific part-color combination
 */
export const getPriceGuide = query({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch all 4 price records for this part-color combination
    const priceRecords = await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.partNumber).eq("colorId", args.colorId),
      )
      .collect();

    if (priceRecords.length === 0) {
      return {
        data: null,
        status: "missing" as const,
      };
    }

    // Helper to find specific price record
    const findPrice = (newOrUsed: "N" | "U", guideType: "stock" | "sold") => {
      const record = priceRecords.find(
        (r) => r.newOrUsed === newOrUsed && r.guideType === guideType,
      );
      if (!record) return null;

      return {
        minPrice: record.minPrice,
        maxPrice: record.maxPrice,
        avgPrice: record.avgPrice,
        qtyAvgPrice: record.qtyAvgPrice,
        unitQuantity: record.unitQuantity,
        totalQuantity: record.totalQuantity,
        currencyCode: record.currencyCode,
        lastFetched: record.lastFetched,
      };
    };

    // Determine status: stale vs fresh based on lastFetched
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const status: "stale" | "fresh" = priceRecords.some((pr) => pr.lastFetched < thirtyDaysAgo)
      ? "stale"
      : "fresh";

    return {
      data: {
        newStock: findPrice("N", "stock"),
        newSold: findPrice("N", "sold"),
        usedStock: findPrice("U", "stock"),
        usedSold: findPrice("U", "sold"),
      },
      status,
    };
  },
});

/**
 * Get price guide data for internal use
 */
export const getPriceGuideInternal = internalQuery({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.partNumber).eq("colorId", args.colorId),
      )
      .collect();
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Upsert price guide data into database
 * Internal mutation used by refresh actions to insert/update all 4 price records
 */
const priceGuideRecordValidator = v.object(partPriceTableFields);

export type PriceGuideRecord = Infer<typeof priceGuideRecordValidator>;

const upsertPriceGuideArgsValidator = v.object({
  prices: v.array(priceGuideRecordValidator),
});

export type UpsertPriceGuideArgs = Infer<typeof upsertPriceGuideArgsValidator>;

export const upsertPriceGuide = internalMutation({
  args: upsertPriceGuideArgsValidator,
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
        // Update existing
        await ctx.db.patch(existing._id, price);
      } else {
        // Insert new
        await ctx.db.insert("partPrices", price);
      }
    }
  },
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Enqueue price guide refresh - triggers the self-scheduling ensureCatalogPart orchestrator.
 * Used by reactive hooks to trigger data updates.
 *
 * This delegates to the new ensureCatalogPart pattern which handles
 * rate limiting and retries internally via self-scheduling.
 *
 * Note: The colorId parameter is accepted for API compatibility, but the
 * ensureCatalogPart orchestrator refreshes prices for ALL colors of the part.
 * This is intentional - it's more efficient to refresh all prices at once,
 * and ensures consistent freshness across all color variants.
 */
export const enqueueRefreshPriceGuide = action({
  args: {
    partNumber: v.string(),
    colorId: v.number(), // Kept for API compatibility; all colors are refreshed
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Delegate to new self-scheduling orchestrator
    // forceRefresh: true ensures we fetch fresh data even if existing data isn't stale
    // Note: ensureCatalogPart refreshes prices for ALL colors, not just args.colorId
    await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
      partNumber: args.partNumber,
      forceRefresh: true,
    });
  },
});
