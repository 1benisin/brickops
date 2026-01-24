/**
 * Freshness Utilities and Database Update Mutations for Bricklink Data
 *
 * This module provides:
 * - Freshness detection and staleness checking
 * - Database upsert mutations for catalog data
 *
 * Note: Catalog data refreshing is now handled by the self-scheduling
 * ensureCatalogPart pattern in convex/catalog/ensure.ts
 *
 * ⚠️ MODULE ISOLATION VIOLATION:
 * The mutations in this file (`upsertColor`, `upsertPriceGuide`) write directly
 * to tables owned by the `catalog/` module (`colors`, `partPrices`). Per the
 * modular architecture, marketplace modules should only handle API communication
 * and response transformation. Persistence to core module tables should go
 * through the `sync/` orchestration layer.
 *
 * TODO: Migrate these mutations to `sync/catalog/` when that orchestration
 * layer is created. The BrickLink module should only fetch and transform
 * catalog data; the sync layer should handle persistence.
 * See: _notes/modular-architecture-refactor-plan.md
 */

import { internalMutation } from "../../../_generated/server";
import { v } from "convex/values";

export { isStale } from "../freshness";

// ============================================================================
// CONSTANTS
// ============================================================================

// Refresh priorities (lower number = higher priority)
export const REFRESH_PRIORITY = {
  HIGH: 1, // Parts (user is viewing)
  MEDIUM: 2, // Colors, categories
  LOW: 3, // Prices, bulk updates
} as const;

// ============================================================================
// DATABASE UPDATE MUTATIONS
// ============================================================================

/**
 * Upsert color data into database
 *
 * ⚠️ ISOLATION VIOLATION: Writes to `colors` table owned by catalog/ module.
 * Should migrate to sync/catalog/ orchestration layer.
 */
export const upsertColor = internalMutation({
  args: {
    data: v.object({
      colorId: v.number(),
      colorName: v.string(),
      colorCode: v.optional(v.string()),
      colorType: v.optional(v.string()),
      lastFetched: v.number(),
      // createdAt removed - using _creationTime
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("colors")
      .withIndex("by_colorId", (q) => q.eq("colorId", args.data.colorId))
      .first();

    if (existing) {
      const { ...updateData } = args.data;
      // Cast colorType to any to bypass strict union check if needed, or ensure input matches schema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.patch(existing._id, updateData as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.insert("colors", args.data as any);
    }
  },
});

/**
 * Upsert price guide data into database
 *
 * ⚠️ ISOLATION VIOLATION: Writes to `partPrices` table owned by catalog/ module.
 * Should migrate to sync/catalog/ orchestration layer.
 */
export const upsertPriceGuide = internalMutation({
  args: {
    data: v.object({
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
      // createdAt removed - using _creationTime
    }),
  },
  handler: async (ctx, args) => {
    // Find existing price record matching part, color, newOrUsed, and guideType
    const existing = await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.data.partNo).eq("colorId", args.data.colorId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("newOrUsed"), args.data.newOrUsed),
          q.eq(q.field("guideType"), args.data.guideType),
        ),
      )
      .first();

    if (existing) {
      const { ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("partPrices", args.data);
    }
  },
});
