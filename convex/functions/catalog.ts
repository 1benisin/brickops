import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx, action } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { BricklinkClient } from "../lib/external/bricklink";
import { sharedRateLimiter } from "../lib/external/inMemoryRateLimiter";
import { recordMetric } from "../lib/external/metrics";
import { api } from "../_generated/api";

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

/**
 * Parse system admin emails from environment variable
 * Supports comma-separated list of admin emails
 */
function parseSystemAdminEmails(): Set<string> {
  const configured = process.env.BRICKOPS_SYSTEM_ADMIN_EMAILS ?? "";
  if (!configured.trim()) {
    return new Set();
  }
  return new Set(
    configured
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Check if user has system admin privileges
 * Either configured via email list or has owner role
 */
function isSystemAdmin(user: Doc<"users">): boolean {
  const configuredEmails = parseSystemAdminEmails();
  const normalizedEmail = user.email?.trim().toLowerCase();

  if (configuredEmails.size > 0) {
    return normalizedEmail ? configuredEmails.has(normalizedEmail) : false;
  }

  return user.role === "owner";
}

async function requireSystemAdmin(ctx: QueryCtx | MutationCtx): Promise<RequireUserReturn> {
  const identity = await requireActiveUser(ctx);
  if (!isSystemAdmin(identity.user)) {
    throw new ConvexError("System administrator access required");
  }
  return identity;
}

/**
 * Special authentication function for seeding operations.
 * Allows admin-authenticated scripts to bypass user authentication.
 * Returns null for seeding operations, full user context for admin users.
 */
async function requireSystemAdminOrSeeding(
  ctx: QueryCtx | MutationCtx,
): Promise<RequireUserReturn | null> {
  // Try to get user authentication first
  const userId = await getAuthUserId(ctx);

  if (userId) {
    // Normal user authentication path
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

    if (!isSystemAdmin(user)) {
      throw new ConvexError("System administrator access required");
    }

    return {
      userId,
      user,
      businessAccountId: user.businessAccountId as Id<"businessAccounts">,
    };
  }

  // If no user ID, this might be an admin-authenticated seeding operation
  // In this case, we'll return null and let the seeding operation proceed
  // This is safe because seeding operations are isolated and only used for bootstrapping
  return null;
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
 * Build search keywords from part data for full-text search
 * Normalizes and tokenizes all searchable fields into a single string
 */
function buildSearchKeywords(
  partNumber: string,
  name: string,
  options: {
    description?: string | null;
    category?: string | null;
    sortGrid?: string | null;
    sortBin?: string | null;
    aliases?: string[];
  } = {},
): string {
  const tokens = new Set<string>();
  const push = (value?: string | null) => {
    if (!value) return;
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  };

  push(partNumber);
  push(name);
  push(options.description ?? undefined);
  push(options.category ?? undefined);
  push(options.sortGrid ?? undefined);
  push(options.sortBin ?? undefined);
  options.aliases?.forEach((alias) => push(alias));

  return Array.from(tokens).join(" ");
}

/**
 * Convert category path array to string key for indexing
 * @param path - Array of category IDs representing hierarchy
 * @returns Joined string or undefined if empty
 */
function buildCategoryPathKey(path?: number[] | null): string | undefined {
  if (!path || path.length === 0) return undefined;
  return path.join("/");
}

/**
 * Search for Lego parts in local catalog with optional Bricklink API fallback
 */
export const searchParts = query({
  args: {
    query: v.string(),
    categories: v.optional(v.array(v.number())),
    colors: v.optional(v.array(v.number())),
    pageSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
    includeMetadata: v.optional(v.boolean()),
    sort: v.optional(
      v.object({
        field: v.union(v.literal("name"), v.literal("marketPrice"), v.literal("lastUpdated")),
        direction: v.union(v.literal("asc"), v.literal("desc")),
      }),
    ),
    freshness: v.optional(
      v.union(v.literal("fresh"), v.literal("stale"), v.literal("expired"), v.literal("all")),
    ),
  },

  handler: async (ctx, args) => {
    const { userId } = await requireActiveUser(ctx);
    const searchTerm = args.query.trim();
    const pageSize = Math.min(Math.max(args.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const startTime = Date.now();

    // Analyze query characteristics to select optimal strategy
    const hasSearch = searchTerm.length >= 2;
    const hasCategory = args.categories && args.categories.length > 0;
    const hasFreshness = args.freshness && args.freshness !== "all";
    const hasColors = args.colors && args.colors.length > 0;
    const singleCategory = hasCategory && args.categories!.length === 1;

    // QUERY STRATEGY SELECTION
    // Strategy 1: Search with database-level filters (most efficient for text search)
    // Strategy 2: Index-based with sorting (efficient for browsing without search)
    // Strategy 3: Fallback to base query (least efficient, minimal use)

    let query;
    let queryStrategy: "search" | "index" | "scan" = "scan";

    if (hasSearch) {
      // Use search index with database-level filters
      queryStrategy = "search";
      query = ctx.db.query("legoPartCatalog").withSearchIndex("search_parts", (q) => {
        let sq = q.search("searchKeywords", searchTerm);

        // Push freshness filter to database (eliminates 66-95% of results before fetch)
        if (hasFreshness && args.freshness !== "all") {
          sq = sq.eq("dataFreshness", args.freshness as "fresh" | "stale" | "expired");
        }

        // Push single category filter to database (highly selective)
        if (singleCategory) {
          sq = sq.eq("bricklinkCategoryId", args.categories![0]);
        }

        return sq;
      });
    } else if (hasFreshness && args.freshness !== "all" && args.sort?.field === "name") {
      // Use compound index for efficient sorted browsing
      queryStrategy = "index";
      query = ctx.db
        .query("legoPartCatalog")
        .withIndex("by_freshness_and_name", (q) =>
          q.eq("dataFreshness", args.freshness as "fresh" | "stale" | "expired"),
        )
        .order(args.sort.direction === "desc" ? "desc" : "asc");
    } else if (hasFreshness && args.freshness !== "all" && args.sort?.field === "lastUpdated") {
      // Use compound index for date-sorted browsing
      queryStrategy = "index";
      query = ctx.db
        .query("legoPartCatalog")
        .withIndex("by_freshness_and_updated", (q) =>
          q.eq("dataFreshness", args.freshness as "fresh" | "stale" | "expired"),
        )
        .order(args.sort.direction === "desc" ? "desc" : "asc");
    } else if (singleCategory && args.sort?.field === "name") {
      // Use compound index for category browsing
      queryStrategy = "index";
      query = ctx.db
        .query("legoPartCatalog")
        .withIndex("by_category_and_name", (q) => q.eq("bricklinkCategoryId", args.categories![0]))
        .order(args.sort?.direction === "desc" ? "desc" : "asc");
    } else if (hasFreshness && args.freshness !== "all") {
      // Simple freshness filter
      queryStrategy = "index";
      query = ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) =>
          q.eq("dataFreshness", args.freshness as "fresh" | "stale" | "expired"),
        );
    } else {
      // Fallback: no filters, use base query
      queryStrategy = "scan";
      query = ctx.db.query("legoPartCatalog");
    }

    // Efficient pagination - fetch only what we need
    const paginationResult = await query.paginate({
      cursor: args.cursor ?? null,
      numItems: pageSize,
    });

    let filteredParts = paginationResult.page;

    // Apply remaining filters that couldn't be pushed to database
    // Multi-category filter (only if not already filtered at DB level)
    if (hasCategory && !singleCategory) {
      const categorySet = new Set(args.categories);
      filteredParts = filteredParts.filter(
        (part) =>
          part.categoryPath?.some((cat) => categorySet.has(cat)) ||
          (part.bricklinkCategoryId !== undefined && categorySet.has(part.bricklinkCategoryId)),
      );
    }

    // Color filter (complex - requires array intersection, must be in-memory)
    // Checks both availableColorIds array and primaryColorId field
    if (hasColors) {
      const colorSet = new Set(args.colors);
      filteredParts = filteredParts.filter(
        (part) =>
          part.availableColorIds?.some((colorId) => colorSet.has(colorId)) ||
          (part.primaryColorId !== undefined && colorSet.has(part.primaryColorId)),
      );
    }

    // Apply sorting if not handled by index
    const needsManualSort =
      args.sort &&
      (queryStrategy === "scan" ||
        (queryStrategy === "search" && args.sort.field !== "name") ||
        (queryStrategy === "index" &&
          !query.toString().includes(args.sort.field) &&
          !query.toString().includes("by_freshness_and_" + args.sort.field)));

    if (needsManualSort) {
      const direction = args.sort!.direction === "desc" ? -1 : 1;
      filteredParts = [...filteredParts].sort((a, b) => {
        switch (args.sort!.field) {
          case "lastUpdated":
            return direction * (a.lastUpdated - b.lastUpdated);
          case "name":
          default:
            return direction * a.name.localeCompare(b.name);
        }
      });
    }

    const localResults = filteredParts.map(formatPartForResponse);
    const searchDuration = Date.now() - startTime;

    recordMetric("catalog.search.local", {
      query: searchTerm.substring(0, 50),
      resultCount: localResults.length,
      durationMs: searchDuration,
      strategy: queryStrategy,
      dbFiltered: hasFreshness || singleCategory,
      inMemoryFiltered: (hasCategory && !singleCategory) || hasColors,
    });

    // Bricklink API fallback only when local search returns nothing
    // This provides seamless experience when parts aren't in local catalog yet
    let source: "local" | "hybrid" = "local";
    const fallbackParts: ReturnType<typeof formatPartForResponse>[] = [];

    if (localResults.length === 0 && hasSearch) {
      try {
        sharedRateLimiter.consume({
          key: "catalog:bricklink-search",
          capacity: CATALOG_RATE_LIMIT.capacity,
          intervalMs: CATALOG_RATE_LIMIT.intervalMs,
        });

        const bricklinkClient = new BricklinkClient();
        const bricklinkResponse = await bricklinkClient.request<{
          data: Array<{
            no: string;
            name: string;
            type: string;
            category_id: number;
            image_url?: string;
          }>;
        }>({
          path: "/items/part",
          query: {
            search: searchTerm,
            limit: Math.min(pageSize, 20),
          },
          identityKey: "global-catalog",
        });

        const bricklinkParts = bricklinkResponse.data?.data ?? [];
        if (bricklinkParts.length > 0) {
          source = "hybrid";
          fallbackParts.push(
            ...bricklinkParts.map((part) => ({
              _id: `bricklink:${part.no}` as Id<"legoPartCatalog">,
              partNumber: part.no,
              name: part.name,
              description: `Bricklink part: ${part.name}`,
              category: part.category_id?.toString(),
              categoryPath: part.category_id ? [part.category_id] : [],
              categoryPathKey: part.category_id?.toString(),
              imageUrl: part.image_url,
              thumbnailUrl: undefined,
              primaryColorId: undefined,
              availableColorIds: [],
              weightGrams: undefined,
              dimensionXMm: undefined,
              dimensionYMm: undefined,
              dimensionZMm: undefined,
              printed: undefined,
              isObsolete: undefined,
              marketPriceLastSyncedAt: undefined,
              dataSource: "bricklink" as const,
              lastUpdated: Date.now(),
              lastFetchedFromBricklink: Date.now(),
              dataFreshness: "fresh" as const,
              bricklinkPartId: part.no,
              bricklinkCategoryId: part.category_id,
              createdBy: userId,
              createdAt: Date.now(),
              updatedAt: undefined,
              searchKeywords: buildSearchKeywords(part.no, part.name),
            })),
          );

          recordMetric("catalog.search.bricklink", {
            query: searchTerm.substring(0, 50),
            resultCount: bricklinkParts.length,
            durationMs: Date.now() - startTime,
          });
        }
      } catch (error) {
        recordMetric("catalog.search.bricklink.error", {
          query: searchTerm.substring(0, 50),
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.warn("Bricklink search failed, falling back to local results:", error);
      }
    }

    const parts = localResults.length > 0 ? localResults : fallbackParts;
    const hasNextPage = !paginationResult.isDone && parts.length === pageSize;

    const metadata = args.includeMetadata
      ? await loadCatalogFilters(ctx, {
          colors: new Set(args.colors ?? []),
          categories: new Set(args.categories ?? []),
        })
      : undefined;

    return {
      parts,
      source,
      searchDurationMs: Date.now() - startTime,
      pagination: {
        cursor: paginationResult.continueCursor ?? null,
        hasNextPage,
        pageSize,
        fetched: paginationResult.page.length,
        isDone: paginationResult.isDone,
      },
      metadata,
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
 * Get catalog filter options (colors, categories) with counts
 * Used for building filter UI components
 */
export const getCatalogFilters = query({
  args: {
    selectedColors: v.optional(v.array(v.number())),
    selectedCategories: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    return loadCatalogFilters(ctx, {
      colors: new Set(args.selectedColors ?? []),
      categories: new Set(args.selectedCategories ?? []),
    });
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

/**
 * Save or update a part in the local catalog
 * Used for manual part entry and Bricklink data import
 */
export const savePartToLocalCatalog = mutation({
  args: {
    partNumber: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    bricklinkPartId: v.optional(v.string()),
    bricklinkCategoryId: v.optional(v.number()),
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
    categoryPath: v.optional(v.array(v.number())),
    primaryColorId: v.optional(v.number()),
    availableColorIds: v.optional(v.array(v.number())),
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSystemAdmin(ctx);
    const now = Date.now();
    const searchKeywords = buildSearchKeywords(args.partNumber, args.name, {
      description: args.description,
      category: args.category,
      aliases: args.aliases,
    });
    const categoryPathKey = buildCategoryPathKey(args.categoryPath);

    // Check if part already exists
    const existing = await ctx.db
      .query("legoPartCatalog")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    const freshness = getDataFreshness(now);

    if (existing) {
      // Update existing part
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        category: args.category,
        categoryPath: args.categoryPath,
        categoryPathKey,
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
        primaryColorId: args.primaryColorId,
        availableColorIds: args.availableColorIds,
        searchKeywords,
        dataSource: args.dataSource,
        lastUpdated: now,
        lastFetchedFromBricklink:
          args.dataSource === "bricklink" ? now : existing.lastFetchedFromBricklink,
        dataFreshness: freshness,
        updatedAt: now,
      });

      recordMetric("catalog.savePartToLocalCatalog.updated", {
        partNumber: args.partNumber,
        dataSource: args.dataSource,
      });

      return existing._id;
    } else {
      // Create new part
      const partId = await ctx.db.insert("legoPartCatalog", {
        partNumber: args.partNumber,
        name: args.name,
        description: args.description,
        category: args.category,
        categoryPath: args.categoryPath,
        categoryPathKey,
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
        primaryColorId: args.primaryColorId,
        availableColorIds: args.availableColorIds,
        searchKeywords,
        dataSource: args.dataSource,
        lastUpdated: now,
        lastFetchedFromBricklink: args.dataSource === "bricklink" ? now : undefined,
        dataFreshness: freshness,
        createdBy: userId,
        createdAt: now,
      });

      recordMetric("catalog.savePartToLocalCatalog.created", {
        partNumber: args.partNumber,
        dataSource: args.dataSource,
      });

      return partId;
    }
  },
});

/**
 * Batch import parts for catalog maintenance
 * Processes up to 100 parts per request for efficient bulk operations
 */
export const batchImportParts = mutation({
  args: {
    parts: v.array(
      v.object({
        partNumber: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        bricklinkPartId: v.optional(v.string()),
        bricklinkCategoryId: v.optional(v.number()),
        categoryPath: v.optional(v.array(v.number())),
        primaryColorId: v.optional(v.number()),
        availableColorIds: v.optional(v.array(v.number())),
        aliases: v.optional(v.array(v.string())),
      }),
    ),
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSystemAdmin(ctx);

    if (args.parts.length === 0) {
      throw new ConvexError("No parts provided for import");
    }

    if (args.parts.length > 100) {
      throw new ConvexError("Batch size limited to 100 parts per request");
    }

    const now = Date.now();
    const freshness = getDataFreshness(now);
    const results = { created: 0, updated: 0, errors: [] as string[] };

    for (const part of args.parts) {
      try {
        // Check if part exists
        const existing = await ctx.db
          .query("legoPartCatalog")
          .withIndex("by_partNumber", (q) => q.eq("partNumber", part.partNumber))
          .first();

        if (existing) {
          // Update existing
          await ctx.db.patch(existing._id, {
            name: part.name,
            description: part.description,
            category: part.category,
            imageUrl: part.imageUrl,
            bricklinkPartId: part.bricklinkPartId,
            bricklinkCategoryId: part.bricklinkCategoryId,
            categoryPath: part.categoryPath,
            categoryPathKey: buildCategoryPathKey(part.categoryPath),
            primaryColorId: part.primaryColorId,
            availableColorIds: part.availableColorIds,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name, {
              description: part.description,
              category: part.category,
              aliases: part.aliases,
            }),
            dataSource: args.dataSource,
            lastUpdated: now,
            lastFetchedFromBricklink:
              args.dataSource === "bricklink" ? now : existing.lastFetchedFromBricklink,
            dataFreshness: freshness,
            updatedAt: now,
          });
          results.updated++;
        } else {
          // Create new
          await ctx.db.insert("legoPartCatalog", {
            partNumber: part.partNumber,
            name: part.name,
            description: part.description,
            category: part.category,
            imageUrl: part.imageUrl,
            bricklinkPartId: part.bricklinkPartId,
            bricklinkCategoryId: part.bricklinkCategoryId,
            categoryPath: part.categoryPath,
            categoryPathKey: buildCategoryPathKey(part.categoryPath),
            primaryColorId: part.primaryColorId,
            availableColorIds: part.availableColorIds,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name, {
              description: part.description,
              category: part.category,
              aliases: part.aliases,
            }),
            dataSource: args.dataSource,
            lastUpdated: now,
            lastFetchedFromBricklink: args.dataSource === "bricklink" ? now : undefined,
            dataFreshness: freshness,
            createdBy: userId,
            createdAt: now,
          });
          results.created++;
        }
      } catch (error) {
        const errorMsg = `Failed to import part ${part.partNumber}: ${error instanceof Error ? error.message : "Unknown error"}`;
        results.errors.push(errorMsg);
      }
    }

    recordMetric("catalog.batchImportParts", {
      totalParts: args.parts.length,
      created: results.created,
      updated: results.updated,
      errors: results.errors.length,
      dataSource: args.dataSource,
    });

    return results;
  },
});

// Reference data seeding mutations - used for initial catalog setup

/**
 * Seed Bricklink color reference data
 * Optimized for bulk operations with parallel processing
 */
export const seedBricklinkColors = mutation({
  args: {
    records: v.array(
      v.object({
        bricklinkColorId: v.number(),
        name: v.string(),
        rgb: v.optional(v.string()),
        colorType: v.optional(v.string()),
        isTransparent: v.optional(v.boolean()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Bulk query: Fetch all existing records once instead of per-record queries
    const allExisting = await ctx.db.query("bricklinkColorReference").collect();
    const existingById = new Map(allExisting.map((entry) => [entry.bricklinkColorId, entry]));

    // Separate inserts from updates
    const insertOperations = [];
    const updateOperations = [];

    for (const record of args.records) {
      const existing = existingById.get(record.bricklinkColorId);

      if (existing) {
        updateOperations.push(
          ctx.db.patch(existing._id, {
            name: record.name,
            rgb: record.rgb,
            colorType: record.colorType,
            isTransparent: record.isTransparent,
            syncedAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      } else {
        insertOperations.push(
          ctx.db.insert("bricklinkColorReference", {
            bricklinkColorId: record.bricklinkColorId,
            name: record.name,
            rgb: record.rgb,
            colorType: record.colorType,
            isTransparent: record.isTransparent,
            syncedAt: record.syncedAt,
            createdAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      }
    }

    // Execute all operations in parallel
    await Promise.all([...insertOperations, ...updateOperations]);

    const inserted = insertOperations.length;
    const updated = updateOperations.length;

    recordMetric("catalog.seedBricklinkColors", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed Bricklink category reference data with hierarchical paths
 */
export const seedBricklinkCategories = mutation({
  args: {
    records: v.array(
      v.object({
        bricklinkCategoryId: v.number(),
        name: v.string(),
        parentCategoryId: v.optional(v.number()),
        path: v.optional(v.array(v.number())),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Bulk query: Fetch all existing records once instead of per-record queries
    const allExisting = await ctx.db.query("bricklinkCategoryReference").collect();
    const existingById = new Map(allExisting.map((entry) => [entry.bricklinkCategoryId, entry]));

    // Separate inserts from updates
    const insertOperations = [];
    const updateOperations = [];

    for (const record of args.records) {
      const existing = existingById.get(record.bricklinkCategoryId);
      const pathKey = buildCategoryPathKey(record.path);

      if (existing) {
        updateOperations.push(
          ctx.db.patch(existing._id, {
            name: record.name,
            parentCategoryId: record.parentCategoryId,
            path: record.path,
            pathKey,
            syncedAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      } else {
        insertOperations.push(
          ctx.db.insert("bricklinkCategoryReference", {
            bricklinkCategoryId: record.bricklinkCategoryId,
            name: record.name,
            parentCategoryId: record.parentCategoryId,
            path: record.path,
            pathKey,
            syncedAt: record.syncedAt,
            createdAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      }
    }

    // Execute all operations in parallel
    await Promise.all([...insertOperations, ...updateOperations]);

    const inserted = insertOperations.length;
    const updated = updateOperations.length;

    recordMetric("catalog.seedBricklinkCategories", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed part-color availability data from Bricklink
 * Maps which colors are available for each part
 */
export const seedPartColorAvailability = mutation({
  args: {
    records: v.array(
      v.object({
        partNumber: v.string(),
        bricklinkPartId: v.optional(v.string()),
        colorId: v.number(),
        elementIds: v.optional(v.array(v.string())),
        isLegacy: v.optional(v.boolean()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      // Indexed query for this specific part+color combination
      const candidates = await ctx.db
        .query("bricklinkPartColorAvailability")
        .withIndex("by_part", (q) => q.eq("partNumber", record.partNumber))
        .collect();

      const existing = candidates.find((entry) => entry.colorId === record.colorId);

      if (existing) {
        // Update existing record, merging element IDs
        const elementIds = Array.from(
          new Set([...(existing.elementIds ?? []), ...(record.elementIds ?? [])]),
        );
        await ctx.db.patch(existing._id, {
          bricklinkPartId: record.bricklinkPartId ?? existing.bricklinkPartId,
          elementIds,
          isLegacy: record.isLegacy ?? existing.isLegacy,
          syncedAt: record.syncedAt,
        });
        updated++;
      } else {
        // Insert new record
        await ctx.db.insert("bricklinkPartColorAvailability", {
          partNumber: record.partNumber,
          bricklinkPartId: record.bricklinkPartId,
          colorId: record.colorId,
          elementIds: record.elementIds,
          isLegacy: record.isLegacy,
          syncedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedPartColorAvailability", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed element reference data linking LEGO element IDs to parts and colors
 */
export const seedElementReferences = mutation({
  args: {
    records: v.array(
      v.object({
        elementId: v.string(),
        partNumber: v.string(),
        colorId: v.number(),
        bricklinkPartId: v.optional(v.string()),
        designId: v.optional(v.string()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      // Indexed query for this specific element ID
      const existing = await ctx.db
        .query("bricklinkElementReference")
        .withIndex("by_element", (q) => q.eq("elementId", record.elementId))
        .first();

      if (existing) {
        // Update existing record
        await ctx.db.patch(existing._id, {
          partNumber: record.partNumber,
          colorId: record.colorId,
          bricklinkPartId: record.bricklinkPartId ?? existing.bricklinkPartId,
          designId: record.designId ?? existing.designId,
          syncedAt: record.syncedAt,
        });
        updated++;
      } else {
        // Insert new record
        await ctx.db.insert("bricklinkElementReference", {
          elementId: record.elementId,
          partNumber: record.partNumber,
          colorId: record.colorId,
          bricklinkPartId: record.bricklinkPartId,
          designId: record.designId,
          syncedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedElementReferences", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed manual LEGO part catalog entries
 * Used for parts not available through Bricklink API
 */
export const seedLegoPartCatalog = mutation({
  args: {
    records: v.array(
      v.object({
        partNumber: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        bricklinkPartId: v.optional(v.string()),
        bricklinkCategoryId: v.optional(v.number()),
        weightGrams: v.optional(v.number()),
        dimensionXMm: v.optional(v.number()),
        dimensionYMm: v.optional(v.number()),
        dimensionZMm: v.optional(v.number()),
        dataSource: v.literal("manual"),
        lastUpdated: v.number(),
        dataFreshness: v.literal("fresh"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const auth = await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const record of args.records) {
      // Indexed query for this specific part number
      const existing = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", record.partNumber))
        .first();

      if (existing) {
        // Update existing part
        await ctx.db.patch(existing._id, {
          name: record.name,
          description: record.description,
          bricklinkPartId: record.bricklinkPartId,
          bricklinkCategoryId: record.bricklinkCategoryId,
          searchKeywords: record.name.toLowerCase(),
          weightGrams: record.weightGrams,
          dimensionXMm: record.dimensionXMm,
          dimensionYMm: record.dimensionYMm,
          dimensionZMm: record.dimensionZMm,
          dataSource: record.dataSource,
          lastUpdated: record.lastUpdated,
          dataFreshness: record.dataFreshness,
          updatedAt: now,
        });
        updated++;
      } else {
        // Insert new part
        await ctx.db.insert("legoPartCatalog", {
          partNumber: record.partNumber,
          name: record.name,
          description: record.description,
          bricklinkPartId: record.bricklinkPartId,
          bricklinkCategoryId: record.bricklinkCategoryId,
          searchKeywords: record.name.toLowerCase(),
          weightGrams: record.weightGrams,
          dimensionXMm: record.dimensionXMm,
          dimensionYMm: record.dimensionYMm,
          dimensionZMm: record.dimensionZMm,
          dataSource: record.dataSource,
          lastUpdated: record.lastUpdated,
          dataFreshness: record.dataFreshness,
          createdAt: now,
          ...(auth?.userId ? { createdBy: auth.userId } : {}),
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedLegoPartCatalog", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Refresh stale catalog entries from Bricklink API
 * Processes up to 25 parts per request to respect rate limits
 */
export const refreshCatalogEntries = mutation({
  args: {
    limit: v.optional(v.number()),
    partNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

    const targetParts: Doc<"legoPartCatalog">[] = [];

    if (args.partNumber) {
      const specific = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber!))
        .first();
      if (specific) {
        targetParts.push(specific);
      }
    }

    if (targetParts.length < limit) {
      const staleParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) => q.eq("dataFreshness", "stale"))
        .take(limit);

      const expiredParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) => q.eq("dataFreshness", "expired"))
        .take(limit);

      [...staleParts, ...expiredParts].forEach((part) => {
        if (!targetParts.find((existing) => existing._id === part._id)) {
          targetParts.push(part);
        }
      });
    }

    const toRefresh = targetParts.slice(0, limit);
    if (toRefresh.length === 0) {
      return { refreshed: 0, errors: [] as string[] };
    }

    const client = new BricklinkClient();
    const errors: string[] = [];
    let refreshed = 0;

    for (const part of toRefresh) {
      const requestStartedAt = Date.now();
      try {
        sharedRateLimiter.consume({
          key: "catalog:bricklink-refresh",
          capacity: CATALOG_RATE_LIMIT.capacity,
          intervalMs: CATALOG_RATE_LIMIT.intervalMs,
        });

        const [detailResponse, priceResponse] = await Promise.all([
          client.request<{
            data: {
              no: string;
              name: string;
              category_id: number;
              image_url?: string;
            };
          }>({
            path: `/items/part/${part.partNumber}`,
            identityKey: "global-catalog",
          }),
          client.request<{
            data: {
              avg_price?: number;
              currency_code?: string;
            };
          }>({
            path: `/items/part/${part.partNumber}/price`,
            identityKey: "global-catalog",
          }),
        ]);

        const completedAt = Date.now();
        const durationMs = completedAt - requestStartedAt;
        const detail = detailResponse.data?.data;
        const price = priceResponse.data?.data;

        await ctx.db.patch(part._id, {
          name: detail?.name ?? part.name,
          description: detail ? `Bricklink part: ${detail.name}` : part.description,
          bricklinkPartId: detail?.no ?? part.bricklinkPartId ?? part.partNumber,
          bricklinkCategoryId: detail?.category_id ?? part.bricklinkCategoryId,
          imageUrl: detail?.image_url ?? part.imageUrl,
          lastUpdated: completedAt,
          lastFetchedFromBricklink: completedAt,
          dataFreshness: "fresh",
          searchKeywords: buildSearchKeywords(part.partNumber, detail?.name ?? part.name, {
            description: detail ? `Bricklink part: ${detail.name}` : part.description,
            category: part.category,
          }),
          updatedAt: completedAt,
        });

        recordMetric("catalog.refresh.success", {
          partNumber: part.partNumber,
          durationMs,
          priceUpdated: Boolean(price?.avg_price),
        });

        refreshed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${part.partNumber}: ${message}`);
        recordMetric("catalog.refresh.error", {
          partNumber: part.partNumber,
          error: message,
          durationMs: Date.now() - requestStartedAt,
        });
      }
    }

    return { refreshed, errors };
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
    dataFreshness: getDataFreshness(part.lastUpdated),
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

/**
 * Load catalog filter options with counts for UI
 * Efficiently loads reference data and pre-computed counts
 */
async function loadCatalogFilters(
  ctx: QueryCtx,
  filters: {
    colors: Set<number>;
    categories: Set<number>;
  },
) {
  // Load reference data and pre-computed counts efficiently
  const [colorReferences, categoryReferences, filterCounts] = await Promise.all([
    ctx.db.query("bricklinkColorReference").collect(),
    ctx.db.query("bricklinkCategoryReference").collect(),
    ctx.db.query("catalogFilterCounts").collect(),
  ]);

  // Create lookup maps for filter counts
  const colorCounts = new Map<number, number>();
  const categoryCounts = new Map<number, number>();

  for (const count of filterCounts) {
    if (count.type === "color") {
      colorCounts.set(count.referenceId, count.count);
    } else if (count.type === "category") {
      categoryCounts.set(count.referenceId, count.count);
    }
  }

  const colors = colorReferences
    .map((color) => ({
      id: color.bricklinkColorId,
      name: color.name,
      rgb: color.rgb,
      colorType: color.colorType,
      isTransparent: color.isTransparent ?? false,
      count: colorCounts.get(color.bricklinkColorId) ?? 0,
      active: filters.colors.has(color.bricklinkColorId),
    }))
    .filter((color) => color.count > 0) // Only show colors with parts
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 100);

  const categories = categoryReferences
    .map((category) => ({
      id: category.bricklinkCategoryId,
      name: category.name,
      parentCategoryId: category.parentCategoryId,
      path: category.path ?? [],
      count: categoryCounts.get(category.bricklinkCategoryId) ?? 0,
      active: filters.categories.has(category.bricklinkCategoryId),
    }))
    .filter((category) => category.count > 0) // Only show categories with parts
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 100);

  return {
    colors,
    categories,
    summary: {
      totalParts: Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0),
      totalColors: colors.length,
      totalCategories: categories.length,
    },
  };
}

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

// Filter count management mutations - optimize UI filter performance

/**
 * Seed catalog filter counts for efficient UI filtering
 * Pre-computes counts for colors and categories to avoid expensive queries
 */
export const seedColorFilterCounts = action({
  args: {
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    colorCount: number;
    processedColorAvailability: number;
  }> => {
    // Auth check can be added here if needed, for now relying on admin key in script
    const colorCounts = new Map<number, number>();
    let cursor: string | null = null;
    let processed = 0;

    do {
      const batch: {
        page: Doc<"bricklinkPartColorAvailability">[];
        continueCursor: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } = await ctx.runQuery((api.functions.internal as any)._getColorAvailabilityPage, {
        cursor,
      });

      for (const availability of batch.page) {
        colorCounts.set(
          availability.colorId,
          (colorCounts.get(availability.colorId) ?? 0) + (availability.elementIds?.length ?? 1),
        );
      }

      processed += batch.page.length;
      cursor = batch.continueCursor;
    } while (cursor);

    const countsArray = Array.from(colorCounts.entries()).map(([referenceId, count]) => ({
      referenceId,
      count,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { inserted } = await ctx.runMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.functions.internal as any)._writeColorFilterCounts,
      {
        counts: countsArray,
        clearExisting: !!args.clearExisting,
      },
    );

    return { inserted, colorCount: countsArray.length, processedColorAvailability: processed };
  },
});

export const seedCategoryFilterCounts = action({
  args: {
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    categoryCount: number;
    processedCatalogParts: number;
  }> => {
    // Auth check can be added here if needed
    const categoryCounts = new Map<number, number>();
    let cursor: string | null = null;
    let processed = 0;

    do {
      const batch: {
        page: Doc<"legoPartCatalog">[];
        continueCursor: string | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } = await ctx.runQuery((api.functions.internal as any)._getPartPage, { cursor });

      for (const part of batch.page) {
        if (part.bricklinkCategoryId !== undefined) {
          categoryCounts.set(
            part.bricklinkCategoryId,
            (categoryCounts.get(part.bricklinkCategoryId) ?? 0) + 1,
          );
        }
        part.categoryPath?.forEach((categoryId: number) => {
          categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
        });
      }

      processed += batch.page.length;
      cursor = batch.continueCursor;
    } while (cursor);

    const countsArray = Array.from(categoryCounts.entries()).map(([referenceId, count]) => ({
      referenceId,
      count,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { inserted } = await ctx.runMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.functions.internal as any)._writeCategoryFilterCounts,
      {
        counts: countsArray,
        clearExisting: !!args.clearExisting,
      },
    );

    return { inserted, categoryCount: countsArray.length, processedCatalogParts: processed };
  },
});

// Aggregator action that orchestrates the two paginated actions above
export const seedCatalogFilterCounts = action({
  args: {
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    colorCount: number;
    categoryCount: number;
    processedColorAvailability: number;
    processedCatalogParts: number;
  }> => {
    // Auth check can be added here if needed

    const clear = Boolean(args.clearExisting);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colorResult = await ctx.runAction((api.functions.catalog as any).seedColorFilterCounts, {
      clearExisting: clear,
    });

    const categoryResult = await ctx.runAction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api.functions.catalog as any).seedCategoryFilterCounts,
      {
        clearExisting: clear,
      },
    );

    return {
      inserted: colorResult.inserted + categoryResult.inserted,
      colorCount: colorResult.colorCount,
      categoryCount: categoryResult.categoryCount,
      processedColorAvailability: colorResult.processedColorAvailability,
      processedCatalogParts: categoryResult.processedCatalogParts,
    };
  },
});

/**
 * Update filter count for a specific color or category
 * Used for incremental updates when parts are added/removed
 */
export const updateFilterCount = mutation({
  args: {
    type: v.union(v.literal("color"), v.literal("category")),
    referenceId: v.number(),
    delta: v.number(), // +1 for add, -1 for remove
  },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);

    const existing = await ctx.db
      .query("catalogFilterCounts")
      .withIndex("by_type_and_id", (q) =>
        q.eq("type", args.type).eq("referenceId", args.referenceId),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      const newCount = Math.max(0, existing.count + args.delta);
      await ctx.db.patch(existing._id, {
        count: newCount,
        lastUpdated: now,
      });
      return { count: newCount, action: "updated" };
    } else if (args.delta > 0) {
      // Only create new entries for positive deltas
      await ctx.db.insert("catalogFilterCounts", {
        type: args.type,
        referenceId: args.referenceId,
        count: args.delta,
        lastUpdated: now,
      });
      return { count: args.delta, action: "created" };
    }

    return { count: 0, action: "noop" };
  },
});

/**
 * Refresh all filter counts by recomputing from scratch
 * Fallback action - use sparingly as it reads all documents
 */
export const refreshFilterCounts = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    inserted: number;
    colorCount: number;
    categoryCount: number;
    processedColorAvailability: number;
    processedCatalogParts: number;
  }> => {
    // Auth check can be added here if needed

    // This is a fallback action to fully recompute counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await ctx.runAction((api.functions.catalog as any).seedCatalogFilterCounts, {
      clearExisting: true,
    });
  },
});
