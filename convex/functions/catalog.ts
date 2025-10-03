import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { BricklinkClient } from "../lib/external/bricklink";
import { sharedRateLimiter } from "../lib/external/inMemoryRateLimiter";
import { recordMetric } from "../lib/external/metrics";
// import { api } from "../_generated/api";

/**
 * Catalog Functions
 *
 * This module provides comprehensive catalog management functionality including:
 * - Part search with local catalog and Bricklink API fallback
 * - Part overlay management for business-specific customizations
 * - Reference data seeding (colors, categories, parts)
 * - Filter count management for efficient UI filtering
 * - Data freshness tracking and refresh operations
 */

// Authentication helper types and functions
type RequireUserReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

/**
 * Ensures user is authenticated, active, and linked to a business account
 */
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

// Data freshness tracking constants
const FRESH_THRESHOLD_HOURS = 7 * 24; // 7 days
const STALE_THRESHOLD_HOURS = 30 * 24; // 30 days
const FRESH_THRESHOLD_MS = FRESH_THRESHOLD_HOURS * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

// Rate limiting configuration for Bricklink API calls
const CATALOG_RATE_LIMIT = {
  capacity: 50,
  intervalMs: 60 * 60 * 1000, // 1 hour
};

// Pagination defaults
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Determine data freshness based on last update timestamp
 * @param lastUpdated - Timestamp of last update
 * @returns "fresh" (< 7 days), "stale" (7-30 days), or "expired" (> 30 days)
 */
function getDataFreshness(lastUpdated: number): "fresh" | "stale" | "expired" {
  const now = Date.now();
  const age = now - lastUpdated;

  if (age < FRESH_THRESHOLD_MS) return "fresh";
  if (age < STALE_THRESHOLD_MS) return "stale";
  return "expired";
}

/**
 * Search for Lego parts in local catalog with optional Bricklink API fallback
 */
export const searchParts = query({
  args: {
    query: v.string(),
    // New structured search fields (optional; maintained for backward compatibility)
    gridBin: v.optional(v.string()),
    partTitle: v.optional(v.string()),
    partId: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    sort: v.optional(
      v.object({
        field: v.union(v.literal("name"), v.literal("marketPrice"), v.literal("lastUpdated")),
        direction: v.union(v.literal("asc"), v.literal("desc")),
      }),
    ),
  },

  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    const partIdSearch = args.partId?.trim();
    const partTitleSearch = args.partTitle?.trim();
    const gridBinSearch = args.gridBin?.trim();
    const pageSize = Math.min(Math.max(args.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const startTime = Date.now();

    // Determine single active search mode
    let mode: "partNumber" | "name" | "gridBin" | null = null;
    if (partIdSearch) mode = "partNumber";
    else if (partTitleSearch) mode = "name";
    else if (gridBinSearch) mode = "gridBin";

    if (!mode) {
      return {
        parts: [],
        source: "local" as const,
        searchDurationMs: Date.now() - startTime,
        pagination: {
          cursor: null,
          hasNextPage: false,
          pageSize,
          fetched: 0,
          isDone: true,
        },
      };
    }

    if (mode === "partNumber") {
      const query = ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", partIdSearch!));

      const paginationResult = await query.paginate({
        cursor: args.cursor ?? null,
        numItems: pageSize,
      });

      const parts = paginationResult.page.map(formatPartForResponse);

      recordMetric("catalog.search.local", {
        query: partIdSearch!.substring(0, 50),
        resultCount: parts.length,
        durationMs: Date.now() - startTime,
        strategy: "partNumber",
      });

      return {
        parts,
        source: "local" as const,
        searchDurationMs: Date.now() - startTime,
        pagination: {
          cursor: paginationResult.continueCursor ?? null,
          hasNextPage: !paginationResult.isDone && parts.length === pageSize,
          pageSize,
          fetched: paginationResult.page.length,
          isDone: paginationResult.isDone,
        },
      };
    }

    if (mode === "name") {
      // Convex search indexes return results ordered by relevance by default
      const query = ctx.db
        .query("legoPartCatalog")
        .withSearchIndex("search_parts_by_name", (q) => q.search("name", partTitleSearch!));

      const paginationResult = await query.paginate({
        cursor: args.cursor ?? null,
        numItems: pageSize,
      });

      const parts = paginationResult.page.map(formatPartForResponse);

      recordMetric("catalog.search.local", {
        query: partTitleSearch!.substring(0, 50),
        resultCount: parts.length,
        durationMs: Date.now() - startTime,
        strategy: "name",
      });

      return {
        parts,
        source: "local" as const,
        searchDurationMs: Date.now() - startTime,
        pagination: {
          cursor: paginationResult.continueCursor ?? null,
          hasNextPage: !paginationResult.isDone,
          pageSize,
          fetched: parts.length,
          isDone: paginationResult.isDone,
        },
      };
    }

    // mode === "gridBin"
    // Parse inputs like "A-99" or "A 99" or just "A" or just "99"
    const match = gridBinSearch!.match(/^\s*([A-Za-z]+)?\s*[-\s]?([0-9]+)?\s*$/);
    const grid = match?.[1]?.toUpperCase() ?? null;
    const bin = match?.[2] ?? null;

    let overlayQuery;
    if (grid && bin) {
      overlayQuery = ctx.db
        .query("catalogPartOverlay")
        .withIndex("by_business_sortLocation", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("sortGrid", grid).eq("sortBin", bin),
        );
    } else if (grid) {
      overlayQuery = ctx.db
        .query("catalogPartOverlay")
        .withIndex("by_business_sortLocation", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("sortGrid", grid),
        );
    } else {
      // bin only: use businessAccount index then filter in-memory
      overlayQuery = ctx.db
        .query("catalogPartOverlay")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId));
    }

    const overlayPage = await overlayQuery.paginate({
      cursor: args.cursor ?? null,
      numItems: pageSize,
    });

    // In-memory filter for bin-only case
    const overlayFiltered = bin
      ? overlayPage.page.filter((o: Doc<"catalogPartOverlay">) =>
          grid ? true : (o.sortBin ?? "") === bin,
        )
      : overlayPage.page;

    // Fetch corresponding part records
    const partsDocs: Doc<"legoPartCatalog">[] = [];
    for (const o of overlayFiltered) {
      const part = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", o.partNumber))
        .first();
      if (part) partsDocs.push(part);
    }

    const parts = partsDocs.map(formatPartForResponse);

    recordMetric("catalog.search.local", {
      query: gridBinSearch!.substring(0, 50),
      resultCount: parts.length,
      durationMs: Date.now() - startTime,
      strategy: "gridBin",
    });

    return {
      parts,
      source: "local" as const,
      searchDurationMs: Date.now() - startTime,
      pagination: {
        cursor: overlayPage.continueCursor ?? null,
        hasNextPage: !overlayPage.isDone && parts.length === pageSize,
        pageSize,
        fetched: overlayPage.page.length,
        isDone: overlayPage.isDone,
      },
    };
  },
});

/**
 * Get detailed information for a specific part
 * Includes color availability, element references, and optional Bricklink refresh
 */
export const getPartDetails = query({
  args: {
    partNumber: v.string(),
    fetchFromBricklink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const startTime = Date.now();

    // First check local catalog
    const localPart = await ctx.db
      .query("legoPartCatalog")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    if (localPart) {
      const freshness = getDataFreshness(localPart.lastUpdated);
      const detail = await enrichPartWithReferences(ctx, localPart);

      let bricklinkStatus: "skipped" | "refreshed" | "error" = "skipped";
      let pricing: { amount: number; currency: string; lastSyncedAt: number } | null = null;
      let bricklinkSnapshot: Record<string, unknown> | undefined;

      if (args.fetchFromBricklink && freshness !== "fresh") {
        try {
          sharedRateLimiter.consume({
            key: "catalog:bricklink-details",
            capacity: CATALOG_RATE_LIMIT.capacity,
            intervalMs: CATALOG_RATE_LIMIT.intervalMs,
          });

          const bricklinkClient = new BricklinkClient();
          const [detailResponse, priceResponse] = await Promise.all([
            bricklinkClient.request<{
              data: {
                no: string;
                name: string;
                type: string;
                category_id: number;
                image_url?: string;
                year_released?: number;
                weight?: string;
                dim_x?: string;
                dim_y?: string;
                dim_z?: string;
              };
            }>({
              path: `/items/part/${args.partNumber}`,
              identityKey: "global-catalog",
            }),
            bricklinkClient.request<{
              data: {
                avg_price?: number;
                qty_avg_price?: number;
                unit_price?: number;
                currency_code?: string;
              };
            }>({
              path: `/items/part/${args.partNumber}/price`,
              identityKey: "global-catalog",
            }),
          ]);

          bricklinkSnapshot = {
            detail: detailResponse.data?.data ?? null,
            pricing: priceResponse.data?.data ?? null,
          };

          if (priceResponse.data?.data?.avg_price) {
            pricing = {
              amount: priceResponse.data.data.avg_price,
              currency: priceResponse.data.data.currency_code ?? "USD",
              lastSyncedAt: Date.now(),
            };
          }

          recordMetric("catalog.getPartDetails.bricklink", {
            partNumber: args.partNumber,
            durationMs: Date.now() - startTime,
            fetchedPricing: Boolean(priceResponse.data?.data?.avg_price),
          });

          bricklinkStatus = "refreshed";
        } catch (error) {
          recordMetric("catalog.getPartDetails.bricklink.error", {
            partNumber: args.partNumber,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          console.warn("Bricklink part details fetch failed:", error);
          bricklinkStatus = "error";
        }
      }

      recordMetric("catalog.getPartDetails.local", {
        partNumber: args.partNumber,
        dataFreshness: freshness,
        durationMs: Date.now() - startTime,
        bricklinkStatus,
      });

      return {
        ...detail,
        source: "local" as const,
        bricklinkStatus,
        bricklinkSnapshot,
        marketPricing: pricing,
      };
    }

    if (args.fetchFromBricklink) {
      try {
        sharedRateLimiter.consume({
          key: "catalog:bricklink-details",
          capacity: CATALOG_RATE_LIMIT.capacity,
          intervalMs: CATALOG_RATE_LIMIT.intervalMs,
        });

        const bricklinkClient = new BricklinkClient();
        const bricklinkResponse = await bricklinkClient.request<{
          data: {
            no: string;
            name: string;
            type: string;
            category_id: number;
            image_url?: string;
          };
        }>({
          path: `/items/part/${args.partNumber}`,
          identityKey: "global-catalog",
        });

        if (bricklinkResponse.data?.data) {
          const bricklinkPart = bricklinkResponse.data.data;

          recordMetric("catalog.getPartDetails.bricklink", {
            partNumber: args.partNumber,
            durationMs: Date.now() - startTime,
            fallback: true,
          });

          return {
            _id: `bricklink:${bricklinkPart.no}` as Id<"legoPartCatalog">,
            partNumber: bricklinkPart.no,
            name: bricklinkPart.name,
            description: `Bricklink part: ${bricklinkPart.name}`,
            category: bricklinkPart.category_id?.toString(),
            categoryPath: bricklinkPart.category_id ? [bricklinkPart.category_id] : [],
            imageUrl: bricklinkPart.image_url,
            dataSource: "bricklink" as const,
            lastUpdated: Date.now(),
            dataFreshness: "fresh" as const,
            bricklinkPartId: bricklinkPart.no,
            bricklinkCategoryId: bricklinkPart.category_id,
            source: "bricklink" as const,
            bricklinkStatus: "refreshed" as const,
            colorAvailability: [],
            elementReferences: [],
            availableColorIds: [],
            marketPricing: null,
          };
        }
      } catch (error) {
        recordMetric("catalog.getPartDetails.bricklink.error", {
          partNumber: args.partNumber,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.warn("Bricklink part details fetch failed:", error);
      }
    }

    throw new ConvexError(`Part ${args.partNumber} not found in catalog`);
  },
});

/**
 * Get business-specific overlay data for a part
 * Includes custom tags, notes, sort locations, etc.
 */
export const getPartOverlay = query({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);

    const overlay = await ctx.db
      .query("catalogPartOverlay")
      .withIndex("by_business_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", args.partNumber),
      )
      .first();

    if (!overlay) {
      return null;
    }

    return formatOverlayForResponse(overlay);
  },
});

/**
 * Create or update business-specific overlay data for a part
 * Supports partial updates - only provided fields are updated
 */
export const upsertPartOverlay = mutation({
  args: {
    partNumber: v.string(),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortGrid: v.optional(v.string()),
    sortBin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);

    const overlay = await ctx.db
      .query("catalogPartOverlay")
      .withIndex("by_business_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", args.partNumber),
      )
      .first();

    const now = Date.now();

    // Check which fields were provided (vs undefined) for partial updates
    const hasTags = Object.prototype.hasOwnProperty.call(args, "tags");
    const normalizedTags = hasTags
      ? (args.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
      : undefined;

    const hasNotes = Object.prototype.hasOwnProperty.call(args, "notes");
    const normalizedNotes = hasNotes ? (args.notes ?? "").trim() : undefined;

    const hasSortGrid = Object.prototype.hasOwnProperty.call(args, "sortGrid");
    const normalizedSortGrid = hasSortGrid ? (args.sortGrid ?? "").trim() : undefined;

    const hasSortBin = Object.prototype.hasOwnProperty.call(args, "sortBin");
    const normalizedSortBin = hasSortBin ? (args.sortBin ?? "").trim() : undefined;

    if (overlay) {
      const updates: Partial<Doc<"catalogPartOverlay">> = {
        updatedAt: now,
      };

      if (hasTags) {
        updates.tags = normalizedTags && normalizedTags.length > 0 ? normalizedTags : undefined;
      }

      if (hasNotes) {
        updates.notes = normalizedNotes && normalizedNotes.length > 0 ? normalizedNotes : undefined;
      }

      if (hasSortGrid) {
        updates.sortGrid =
          normalizedSortGrid && normalizedSortGrid.length > 0 ? normalizedSortGrid : undefined;
      }

      if (hasSortBin) {
        updates.sortBin =
          normalizedSortBin && normalizedSortBin.length > 0 ? normalizedSortBin : undefined;
      }

      await ctx.db.patch(overlay._id, updates);

      const updated = await ctx.db.get(overlay._id);
      return updated ? formatOverlayForResponse(updated) : null;
    }

    const createdId = await ctx.db.insert("catalogPartOverlay", {
      businessAccountId,
      partNumber: args.partNumber,
      tags: normalizedTags && normalizedTags.length > 0 ? normalizedTags : undefined,
      notes: normalizedNotes && normalizedNotes.length > 0 ? normalizedNotes : undefined,
      sortGrid:
        normalizedSortGrid && normalizedSortGrid.length > 0 ? normalizedSortGrid : undefined,
      sortBin: normalizedSortBin && normalizedSortBin.length > 0 ? normalizedSortBin : undefined,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.db.get(createdId);
    return created ? formatOverlayForResponse(created) : null;
  },
});

// Helper functions for data formatting and processing

/**
 * Format overlay data for API response
 */
function formatOverlayForResponse(overlay: Doc<"catalogPartOverlay">) {
  return {
    _id: overlay._id,
    businessAccountId: overlay.businessAccountId,
    partNumber: overlay.partNumber,
    tags: overlay.tags ?? [],
    notes: overlay.notes ?? null,
    sortGrid: overlay.sortGrid ?? null,
    sortBin: overlay.sortBin ?? null,
    createdBy: overlay.createdBy,
    createdAt: overlay.createdAt,
    updatedAt: overlay.updatedAt ?? overlay.createdAt,
  };
}

/**
 * Format part data for API response with computed freshness
 */
function formatPartForResponse(part: Doc<"legoPartCatalog">) {
  return {
    _id: part._id,
    partNumber: part.partNumber,
    name: part.name,
    description: part.description,
    category: part.category,
    categoryPath: part.categoryPath ?? [],
    categoryPathKey: part.categoryPathKey,
    imageUrl: part.imageUrl,
    thumbnailUrl: part.thumbnailUrl,
    dataSource: part.dataSource,
    lastUpdated: part.lastUpdated,
    bricklinkPartId: part.bricklinkPartId,
    bricklinkCategoryId: part.bricklinkCategoryId,
    primaryColorId: part.primaryColorId,
    availableColorIds: part.availableColorIds ?? [],
    weightGrams: part.weightGrams,
    dimensionXMm: part.dimensionXMm,
    dimensionYMm: part.dimensionYMm,
    dimensionZMm: part.dimensionZMm,
    printed: part.printed,
    isObsolete: part.isObsolete,
  };
}

// loadCatalogFilters removed; metadata no longer returned by search

/**
 * Fetch color reference data for given color IDs
 * Returns a map for efficient lookups
 */
async function fetchColorReferences(ctx: QueryCtx, colorIds: number[]) {
  const uniqueIds = Array.from(new Set(colorIds));
  const map = new Map<number, Doc<"bricklinkColorReference">>();

  for (const colorId of uniqueIds) {
    const record = await ctx.db
      .query("bricklinkColorReference")
      .withIndex("by_colorId", (q) => q.eq("bricklinkColorId", colorId))
      .first();
    if (record) {
      map.set(colorId, record);
    }
  }

  return map;
}

/**
 * Enrich part data with color availability and element references
 * Used for detailed part views
 */
async function enrichPartWithReferences(ctx: QueryCtx, part: Doc<"legoPartCatalog">) {
  const [colorAvailability, elementReferences] = await Promise.all([
    ctx.db
      .query("bricklinkPartColorAvailability")
      .withIndex("by_part", (q) => q.eq("partNumber", part.partNumber))
      .collect(),
    ctx.db
      .query("bricklinkElementReference")
      .withIndex("by_part", (q) => q.eq("partNumber", part.partNumber))
      .collect(),
  ]);

  const colorIds = new Set<number>();
  colorAvailability.forEach((entry) => colorIds.add(entry.colorId));
  if (part.primaryColorId !== undefined) {
    colorIds.add(part.primaryColorId);
  }

  const colorMap = await fetchColorReferences(ctx, Array.from(colorIds));
  const formattedPart = formatPartForResponse(part);

  return {
    ...formattedPart,
    colorAvailability: colorAvailability.map((availability) => ({
      colorId: availability.colorId,
      elementIds: availability.elementIds ?? [],
      isLegacy: availability.isLegacy ?? false,
      color: colorMap.get(availability.colorId)
        ? {
            name: colorMap.get(availability.colorId)!.name,
            rgb: colorMap.get(availability.colorId)!.rgb,
            colorType: colorMap.get(availability.colorId)!.colorType,
            isTransparent: colorMap.get(availability.colorId)!.isTransparent ?? false,
          }
        : null,
    })),
    elementReferences: elementReferences.map((reference) => ({
      elementId: reference.elementId,
      colorId: reference.colorId,
      designId: reference.designId,
      bricklinkPartId: reference.bricklinkPartId,
    })),
    // TODO: Load pricing from legoPartPricing table
    marketPricing: null,
  };
}

// Removed filter count management; counts no longer used
