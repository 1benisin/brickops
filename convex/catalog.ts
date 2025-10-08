// Simplified Catalog Functions - Bricklink-aligned
//
// This module provides simplified catalog management functionality using the new
// Bricklink-aligned schema with direct field mapping and universal refresh patterns.

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { REFRESH_PRIORITY } from "./bricklink/dataRefresher";
import { internal } from "./_generated/api";
import {
  searchPartsReturnValidator,
  partDetailsReturnValidator,
  partOverlayReturnValidator,
  colorsReturnValidator,
  categoriesReturnValidator,
  forcePartDetailsRefreshReturnValidator,
  priceGuideReturnValidator,
} from "./validators/catalog";

// Convert protocol-relative URLs (starting with //) to absolute HTTPS URLs
// This is required for Next.js Image component compatibility
function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== "string") {
    return undefined;
  }

  // Convert protocol-relative URLs to HTTPS
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  return url;
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Get part and schedule refresh if stale
 * Throws error if part doesn't exist (and schedules HIGH priority fetch)
 */
async function getPart(ctx: MutationCtx, partNumber: string): Promise<Doc<"parts">> {
  const part = await ctx.db
    .query("parts")
    .withIndex("by_no", (q) => q.eq("no", partNumber))
    .first();

  if (!part) {
    // Part not found - schedule HIGH priority fetch
    await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
      tableName: "parts",
      primaryKey: partNumber,
      lastFetched: undefined,
      priority: REFRESH_PRIORITY.HIGH, // User is waiting - high priority
    });

    throw new ConvexError(
      `Part ${partNumber} not found in catalog. Fetching from Bricklink - please try again in a few moments.`,
    );
  }

  // Schedule refresh if stale (await for proper transaction handling)
  await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
    tableName: "parts",
    primaryKey: partNumber,
    lastFetched: part.lastFetched,
    freshnessThresholdDays: 30,
  });

  return part;
}

/**
 * Get category and schedule refresh if stale
 * Returns null if category doesn't exist
 */
async function getCategory(
  ctx: MutationCtx,
  categoryId: number,
): Promise<Doc<"categories"> | null> {
  const category = await ctx.db
    .query("categories")
    .withIndex("by_categoryId", (q) => q.eq("categoryId", categoryId))
    .first();

  if (!category) {
    return null;
  }

  // Schedule refresh if stale (await for proper transaction handling)
  await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
    tableName: "categories",
    primaryKey: categoryId,
    lastFetched: category.lastFetched,
    freshnessThresholdDays: 30,
  });

  return category;
}

/**
 * Get part colors with freshness check and auto-refresh scheduling
 * Returns array of colors with enriched color information
 */
async function getPartColors(
  ctx: MutationCtx,
  partNumber: string,
): Promise<
  Array<{
    colorId: number;
    color: { name: string; rgb: string } | null;
  }>
> {
  const partColors = await ctx.db
    .query("partColors")
    .withIndex("by_partNo", (q) => q.eq("partNo", partNumber))
    .collect();

  // Schedule refresh for all partColors if stale (await for proper transaction handling)
  for (const pc of partColors) {
    await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
      tableName: "partColors",
      primaryKey: partNumber,
      secondaryKey: pc.colorId,
      lastFetched: pc.lastFetched,
      freshnessThresholdDays: 30,
    });
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
        color: color
          ? {
              name: color.colorName,
              rgb: color.colorCode ?? "",
            }
          : null,
      };
    }),
  );

  return colorDetails;
}

/**
 * Get all 4 price records for a part+color combination
 * Schedules refresh for stale prices
 */
async function getPartPrices(
  ctx: MutationCtx,
  partNumber: string,
  colorId: number,
): Promise<{
  newStock: Doc<"partPrices"> | null;
  newSold: Doc<"partPrices"> | null;
  usedStock: Doc<"partPrices"> | null;
  usedSold: Doc<"partPrices"> | null;
}> {
  // Get all price records for this part+color
  const allPrices = await ctx.db
    .query("partPrices")
    .withIndex("by_partNo_colorId", (q) => q.eq("partNo", partNumber).eq("colorId", colorId))
    .collect();

  // Sort into the 4 categories
  const newStock = allPrices.find((p) => p.newOrUsed === "N" && p.guideType === "stock") ?? null;
  const newSold = allPrices.find((p) => p.newOrUsed === "N" && p.guideType === "sold") ?? null;
  const usedStock = allPrices.find((p) => p.newOrUsed === "U" && p.guideType === "stock") ?? null;
  const usedSold = allPrices.find((p) => p.newOrUsed === "U" && p.guideType === "sold") ?? null;

  // Schedule refresh if stale (refreshes all 4 price variants, await for proper transaction handling)
  await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
    tableName: "partPrices",
    primaryKey: partNumber,
    secondaryKey: colorId,
    lastFetched: newStock?.lastFetched,
    freshnessThresholdDays: 7,
  });

  return {
    newStock,
    newSold,
    usedStock,
    usedSold,
  };
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

// Authentication helper types and functions
type RequireUserReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

// Ensures user is authenticated, active, and linked to a business account
async function requireActiveUser(ctx: QueryCtx | MutationCtx): Promise<RequireUserReturn> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("Authenticated user not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  return {
    userId,
    user,
    businessAccountId: user.businessAccountId as Id<"businessAccounts">,
  };
}

// Search parts using the new Bricklink-aligned schema
// Supports three mutually exclusive search modes:
// 1. Search by part title (full-text search on name field)
// 2. Search by part ID (full-text search on no field)
// 3. Search by sort location (lookup via overlay sortLocation)
//
// IMPORTANT: Return type is validated - frontend can use FunctionReturnType to derive types.
// See convex/validators/catalog.ts for validator definitions.
// See src/types/catalog.ts for how frontend derives types from these validators.
export const searchParts = query({
  args: {
    partTitle: v.optional(v.string()),
    partId: v.optional(v.string()),
    sortLocation: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: searchPartsReturnValidator,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);

    let results;

    // Determine search mode (mutually exclusive)
    if (args.sortLocation) {
      // Mode 1: Search by sort location via overlay
      const overlays = await ctx.db
        .query("catalogPartOverlay")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
        .filter((q) => q.eq(q.field("sortLocation"), args.sortLocation))
        .paginate(args.paginationOpts);

      // Get the parts for these overlays (but don't return overlay data)
      const parts = await Promise.all(
        overlays.page.map(async (overlay) => {
          const part = await ctx.db
            .query("parts")
            .withIndex("by_no", (q) => q.eq("no", overlay.partNo))
            .first();
          return part;
        }),
      );

      // Filter out null parts
      const validParts = parts.filter((part): part is NonNullable<typeof part> => part !== null);

      results = {
        page: validParts,
        isDone: overlays.isDone,
        continueCursor: overlays.continueCursor,
      };
    } else if (args.partId) {
      // Mode 2: Full-text search by part ID/number
      const searchResults = await ctx.db
        .query("parts")
        .withSearchIndex("search_parts_by_no", (q) => q.search("no", args.partId!))
        .paginate(args.paginationOpts);

      results = {
        page: searchResults.page,
        isDone: searchResults.isDone,
        continueCursor: searchResults.continueCursor,
      };
    } else if (args.partTitle) {
      // Mode 3: Full-text search by part title/name
      const searchResults = await ctx.db
        .query("parts")
        .withSearchIndex("search_parts_by_name", (q) => q.search("name", args.partTitle!))
        .paginate(args.paginationOpts);

      results = {
        page: searchResults.page,
        isDone: searchResults.isDone,
        continueCursor: searchResults.continueCursor,
      };
    } else {
      // No search parameters - return empty results
      results = {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    return {
      page: results.page.map((part) => ({
        partNumber: part.no, // Map 'no' to 'partNumber' for client compatibility
        name: part.name,
        type: part.type,
        categoryId: part.categoryId,
        alternateNo: part.alternateNo,
        imageUrl: normalizeImageUrl(part.imageUrl),
        thumbnailUrl: normalizeImageUrl(part.thumbnailUrl),
        weight: part.weight,
        dimX: part.dimX,
        dimY: part.dimY,
        dimZ: part.dimZ,
        yearReleased: part.yearReleased,
        description: part.description,
        isObsolete: part.isObsolete,
        lastFetched: part.lastFetched,
      })),
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

/**
 * Get detailed part information with colors and pricing
 * Note: This is a mutation (not query) so it can schedule refreshes for missing parts
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getPartDetails = mutation({
  args: {
    partNumber: v.string(),
    fetchFromBricklink: v.optional(v.boolean()), // Accepted but currently unused
  },
  returns: partDetailsReturnValidator,
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Get part (throws if not found, schedules refresh if stale)
    const part = await getPart(ctx, args.partNumber);

    // Get category (schedules refresh if stale)
    const category = part.categoryId ? await getCategory(ctx, part.categoryId) : null;

    // Get colors (schedules refresh if stale)
    const colorAvailability = await getPartColors(ctx, args.partNumber);

    return {
      partNumber: part.no,
      name: part.name,
      type: part.type,
      categoryId: part.categoryId,
      category: category?.categoryName ?? null,
      bricklinkPartId: part.alternateNo,
      imageUrl: normalizeImageUrl(part.imageUrl),
      thumbnailUrl: normalizeImageUrl(part.thumbnailUrl),
      weight: part.weight,
      dimX: part.dimX,
      dimY: part.dimY,
      dimZ: part.dimZ,
      yearReleased: part.yearReleased,
      description: part.description,
      isObsolete: part.isObsolete,
      lastFetched: part.lastFetched,
      colorAvailability,
    };
  },
});

/**
 * Public mutation to force refresh of part details from Bricklink
 * Refreshes both the part data and all associated partColors
 * User-facing endpoint (e.g., "Refresh data" button in catalog detail drawer)
 * Also handles fetching parts that don't exist in local catalog
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const forcePartDetailsRefresh = mutation({
  args: {
    partNumber: v.string(),
  },
  returns: forcePartDetailsRefreshReturnValidator,
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Check if part exists
    const part = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    // Force refresh of part data with high priority (works for both refresh and initial fetch)
    await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
      tableName: "parts",
      primaryKey: args.partNumber,
      lastFetched: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago,
      priority: REFRESH_PRIORITY.HIGH, // User clicked refresh - high priority
    });

    // Also force refresh of partColors data with high priority
    await ctx.runMutation(internal.bricklink.dataRefresher.checkAndScheduleRefresh, {
      tableName: "partColors",
      primaryKey: args.partNumber,
      lastFetched: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago,
      priority: REFRESH_PRIORITY.HIGH, // User clicked refresh - high priority
    });

    return {
      partNumber: args.partNumber,
      status: part ? "refresh_queued" : "fetch_queued",
    };
  },
});

/**
 * Get part overlay for the current user's business account
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getPartOverlay = query({
  args: {
    partNumber: v.string(),
  },
  returns: partOverlayReturnValidator,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);

    const overlay = await ctx.db
      .query("catalogPartOverlay")
      .withIndex("by_business_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNo", args.partNumber),
      )
      .first();

    if (!overlay) {
      return null;
    }

    return {
      tags: overlay.tags,
      notes: overlay.notes,
      sortLocation: overlay.sortLocation,
    };
  },
});

// Create or update part overlay
export const upsertPartOverlay = mutation({
  args: {
    partNo: v.string(),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortLocation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);

    // Verify part exists
    const part = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNo))
      .first();

    if (!part) {
      throw new ConvexError(`Part ${args.partNo} not found`);
    }

    // Check if overlay exists
    const existingOverlay = await ctx.db
      .query("catalogPartOverlay")
      .withIndex("by_business_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNo", args.partNo),
      )
      .first();

    const now = Date.now();

    if (existingOverlay) {
      // Update existing overlay
      await ctx.db.patch(existingOverlay._id, {
        tags: args.tags,
        notes: args.notes,
        sortLocation: args.sortLocation,
        updatedAt: now,
      });
    } else {
      // Create new overlay
      await ctx.db.insert("catalogPartOverlay", {
        businessAccountId,
        partNo: args.partNo,
        tags: args.tags,
        notes: args.notes,
        sortLocation: args.sortLocation,
        createdBy: userId,
        createdAt: now,
      });
    }
  },
});

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
 * Get all categories
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getCategories = query({
  args: {},
  returns: categoriesReturnValidator,
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();

    return categories.map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      parentId: category.parentId,
      lastFetched: category.lastFetched,
    }));
  },
});

/**
 * Get complete price guide for a part+color combination
 * Returns all 4 price types: new/used × stock/sold
 *
 * IMPORTANT: Return type is validated - frontend uses FunctionReturnType to derive types.
 * See convex/validators/catalog.ts for validator definition.
 */
export const getPriceGuide = mutation({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  returns: priceGuideReturnValidator,
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Get color details for context
    const color = await ctx.db
      .query("colors")
      .withIndex("by_colorId", (q) => q.eq("colorId", args.colorId))
      .first();

    // Get all 4 price records (schedules refresh if stale)
    const prices = await getPartPrices(ctx, args.partNumber, args.colorId);

    // Helper to map price record to return format
    const mapPrice = (price: Doc<"partPrices"> | null) => {
      if (!price) return null;
      return {
        minPrice: price.minPrice,
        maxPrice: price.maxPrice,
        avgPrice: price.avgPrice,
        qtyAvgPrice: price.qtyAvgPrice,
        unitQuantity: price.unitQuantity,
        totalQuantity: price.totalQuantity,
        currencyCode: price.currencyCode,
        lastFetched: price.lastFetched,
      };
    };

    return {
      partNumber: args.partNumber,
      colorId: args.colorId,
      colorName: color?.colorName,
      colorCode: color?.colorCode,
      prices: {
        newStock: mapPrice(prices.newStock),
        newSold: mapPrice(prices.newSold),
        usedStock: mapPrice(prices.usedStock),
        usedSold: mapPrice(prices.usedSold),
      },
    };
  },
});
