import { query } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  searchPartsReturnValidator,
  partOverlayReturnValidator,
  colorsReturnValidator,
  categoriesReturnValidator,
} from "./validators";
import { requireActiveUser, normalizeImageUrl } from "./helpers";

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

// ============================================================================
// STATUS-AWARE QUERIES (for frontend hooks)
// ============================================================================

/**
 * Get part with status information for reactive hooks
 * Returns data + status to enable smart client-side refresh behavior
 */
export const getPart = query({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const part = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    if (!part) {
      return {
        data: null,
        status: "missing" as const,
      };
    }

    // Fetch category name if categoryId exists
    let categoryName: string | null = null;
    if (part.categoryId) {
      const category = await ctx.db
        .query("categories")
        .withIndex("by_categoryId", (q) => q.eq("categoryId", part.categoryId!))
        .first();
      categoryName = category?.categoryName ?? null;
    }

    // Determine status: refreshing > stale > fresh
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const status: "refreshing" | "stale" | "fresh" =
      part.refreshUntil && part.refreshUntil > Date.now()
        ? "refreshing"
        : part.lastFetched < thirtyDaysAgo
          ? "stale"
          : "fresh";

    return {
      data: {
        partNumber: part.no,
        name: part.name,
        type: part.type,
        categoryId: part.categoryId,
        categoryName,
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
      },
      status,
    };
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

    // Check if currently refreshing (any lock is active)
    const isRefreshing = partColors.some((pc) => pc.refreshUntil && pc.refreshUntil > Date.now());

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

    // Determine status: refreshing > stale > fresh
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const status: "refreshing" | "stale" | "fresh" = isRefreshing
      ? "refreshing"
      : partColors.some((pc) => pc.lastFetched < thirtyDaysAgo)
        ? "stale"
        : "fresh";

    return {
      data: colorDetails,
      status,
    };
  },
});

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

    // Check if currently refreshing (any lock is active)
    const isRefreshing = priceRecords.some((pr) => pr.refreshUntil && pr.refreshUntil > Date.now());

    // Determine status: refreshing > stale > fresh
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const status: "refreshing" | "stale" | "fresh" = isRefreshing
      ? "refreshing"
      : priceRecords.some((pr) => pr.lastFetched < thirtyDaysAgo)
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
