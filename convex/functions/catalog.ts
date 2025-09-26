import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { BricklinkClient } from "../lib/external/bricklink";
import { sharedRateLimiter } from "../lib/external/inMemoryRateLimiter";
import { recordMetric } from "../lib/external/metrics";

type RequireUserReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

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

// Data freshness constants
const FRESH_THRESHOLD_HOURS = 7 * 24; // 7 days
const STALE_THRESHOLD_HOURS = 30 * 24; // 30 days
const FRESH_THRESHOLD_MS = FRESH_THRESHOLD_HOURS * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

// Rate limiting for internal requests
const CATALOG_RATE_LIMIT = {
  capacity: 50,
  intervalMs: 60 * 60 * 1000, // 1 hour
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SEARCH_PREFETCH_MULTIPLIER = 3;

function getDataFreshness(lastUpdated: number): "fresh" | "stale" | "expired" {
  const now = Date.now();
  const age = now - lastUpdated;

  if (age < FRESH_THRESHOLD_MS) return "fresh";
  if (age < STALE_THRESHOLD_MS) return "stale";
  return "expired";
}

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
    const { businessAccountId } = await requireActiveUser(ctx);
    const searchTerm = args.query.trim();
    const pageSize = Math.min(Math.max(args.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const fetchSize = pageSize * SEARCH_PREFETCH_MULTIPLIER;
    const startTime = Date.now();

    const filters = {
      colors: new Set(args.colors ?? []),
      categories: new Set(args.categories ?? []),
      freshness: args.freshness ?? "all",
    } as const;

    const matchesFilters = (part: Doc<"legoPartCatalog">) => {
      const matchesFreshness =
        filters.freshness === "all" || filters.freshness === getDataFreshness(part.lastUpdated);

      const matchesColor =
        filters.colors.size === 0 ||
        part.availableColorIds?.some((colorId) => filters.colors.has(colorId)) ||
        (part.primaryColorId !== undefined && filters.colors.has(part.primaryColorId));

      const matchesCategory =
        filters.categories.size === 0 ||
        (part.categoryPath &&
          part.categoryPath.some((categoryId) => filters.categories.has(categoryId))) ||
        (part.bricklinkCategoryId !== undefined &&
          filters.categories.has(part.bricklinkCategoryId));

      return matchesFreshness && matchesColor && matchesCategory;
    };

    const applySort = (parts: Doc<"legoPartCatalog">[]) => {
      if (!args.sort) return parts;
      const direction = args.sort.direction === "desc" ? -1 : 1;
      const sorted = [...parts];

      sorted.sort((a, b) => {
        switch (args.sort?.field) {
          case "marketPrice":
            return direction * ((a.marketPrice ?? 0) - (b.marketPrice ?? 0));
          case "lastUpdated":
            return direction * (a.lastUpdated - b.lastUpdated);
          case "name":
          default:
            return direction * a.name.localeCompare(b.name);
        }
      });

      return sorted;
    };

    const baseQuery = ctx.db.query("legoPartCatalog");
    let searchQuery;

    if (searchTerm.length >= 2) {
      try {
        searchQuery = baseQuery.withSearchIndex("search_parts", (q) =>
          q.search("searchKeywords", searchTerm).eq("businessAccountId", businessAccountId),
        );
      } catch (error) {
        console.warn("Search index unavailable, falling back to index lookup", error);
        searchQuery = baseQuery.withIndex("by_businessAccount", (q) =>
          q.eq("businessAccountId", businessAccountId),
        );
      }
    } else {
      searchQuery = baseQuery.withIndex("by_businessAccount", (q) =>
        q.eq("businessAccountId", businessAccountId),
      );
    }

    let cursor = args.cursor ?? null;
    let aggregated: Doc<"legoPartCatalog">[] = [];
    let nextCursor: string | null = null;
    let isDone = false;

    if (typeof (searchQuery as { paginate?: unknown }).paginate !== "function") {
      const allParts = await searchQuery.collect();
      const filteredManual = allParts.filter(matchesFilters);
      const sortedManual = applySort(filteredManual);
      const limited = sortedManual.slice(0, pageSize);

      recordMetric("catalog.search.local", {
        query: searchTerm.substring(0, 50),
        resultCount: limited.length,
        durationMs: Date.now() - startTime,
        cursorConsumed: null,
        fetchedMore: filteredManual.length,
      });

      const metadata = args.includeMetadata
        ? await loadCatalogFilters(ctx, businessAccountId, {
            colors: filters.colors,
            categories: filters.categories,
          })
        : undefined;

      return {
        parts: limited.map(formatPartForResponse),
        source: "local" as const,
        searchDurationMs: Date.now() - startTime,
        pagination: {
          cursor: null,
          hasNextPage: filteredManual.length > limited.length,
          pageSize,
          fetched: filteredManual.length,
          isDone: true,
        },
        metadata,
      };
    }

    do {
      const page = await searchQuery.paginate({
        cursor,
        numItems: fetchSize,
      });

      cursor = page.continueCursor ?? null;
      isDone = page.isDone;
      aggregated = aggregated.concat(page.page.filter(matchesFilters));

      if (aggregated.length >= pageSize) {
        nextCursor = cursor;
      }
    } while (!isDone && aggregated.length < pageSize);

    const localResults = applySort(aggregated).slice(0, pageSize);
    const searchDuration = Date.now() - startTime;

    recordMetric("catalog.search.local", {
      query: searchTerm.substring(0, 50),
      resultCount: localResults.length,
      durationMs: searchDuration,
      cursorConsumed: args.cursor ?? null,
      fetchedMore: aggregated.length,
    });

    let source: "local" | "hybrid" = "local";
    const fallbackParts: ReturnType<typeof formatPartForResponse>[] = [];

    if (localResults.length === 0 && searchTerm.length >= 2) {
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
          identityKey: businessAccountId,
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
              imageUrl: part.image_url,
              dataSource: "bricklink" as const,
              lastUpdated: Date.now(),
              dataFreshness: "fresh" as const,
              businessAccountId,
              bricklinkPartId: part.no,
              bricklinkCategoryId: part.category_id,
              createdBy: undefined,
              createdAt: Date.now(),
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

    const formattedLocalResults = localResults.map(formatPartForResponse);
    const parts = formattedLocalResults.length > 0 ? formattedLocalResults : fallbackParts;
    const hasNextPage = !!nextCursor && parts.length === pageSize;

    const metadata = args.includeMetadata
      ? await loadCatalogFilters(ctx, businessAccountId, {
          colors: filters.colors,
          categories: filters.categories,
        })
      : undefined;

    return {
      parts,
      source,
      searchDurationMs: Date.now() - startTime,
      pagination: {
        cursor: nextCursor,
        hasNextPage,
        pageSize,
        fetched: aggregated.length,
        isDone,
      },
      metadata,
    };
  },
});

/**
 * Get detailed information for a specific part
 */
export const getPartDetails = query({
  args: {
    partNumber: v.string(),
    fetchFromBricklink: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    const startTime = Date.now();

    // First check local catalog
    const localPart = await ctx.db
      .query("legoPartCatalog")
      .withIndex("by_partNumber", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", args.partNumber),
      )
      .first();

    if (localPart) {
      const freshness = getDataFreshness(localPart.lastUpdated);
      const detail = await enrichPartWithReferences(ctx, businessAccountId, localPart);

      let bricklinkStatus: "skipped" | "refreshed" | "error" = "skipped";
      let pricing = detail.marketPricing;
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
              identityKey: businessAccountId,
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
              identityKey: businessAccountId,
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
          identityKey: businessAccountId,
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

export const getCatalogFilters = query({
  args: {
    selectedColors: v.optional(v.array(v.number())),
    selectedCategories: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    return loadCatalogFilters(ctx, businessAccountId, {
      colors: new Set(args.selectedColors ?? []),
      categories: new Set(args.selectedCategories ?? []),
    });
  },
});

/**
 * Save or update a part in the local catalog
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
    sortGrid: v.optional(v.string()),
    sortBin: v.optional(v.string()),
    marketPrice: v.optional(v.number()),
    marketPriceCurrency: v.optional(v.string()),
    marketPriceLastSyncedAt: v.optional(v.number()),
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);
    const now = Date.now();
    const searchKeywords = buildSearchKeywords(args.partNumber, args.name, {
      description: args.description,
      category: args.category,
      sortGrid: args.sortGrid,
      sortBin: args.sortBin,
      aliases: args.aliases,
    });
    const categoryPathKey = buildCategoryPathKey(args.categoryPath);

    // Check if part already exists
    const existing = await ctx.db
      .query("legoPartCatalog")
      .withIndex("by_partNumber", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", args.partNumber),
      )
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
        sortGrid: args.sortGrid,
        sortBin: args.sortBin,
        marketPrice: args.marketPrice,
        marketPriceCurrency: args.marketPriceCurrency,
        marketPriceLastSyncedAt: args.marketPriceLastSyncedAt,
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
        businessAccountId,
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
        sortGrid: args.sortGrid,
        sortBin: args.sortBin,
        marketPrice: args.marketPrice,
        marketPriceCurrency: args.marketPriceCurrency,
        marketPriceLastSyncedAt: args.marketPriceLastSyncedAt,
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
        sortGrid: v.optional(v.string()),
        sortBin: v.optional(v.string()),
        marketPrice: v.optional(v.number()),
        marketPriceCurrency: v.optional(v.string()),
        marketPriceLastSyncedAt: v.optional(v.number()),
        aliases: v.optional(v.array(v.string())),
      }),
    ),
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);

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
          .withIndex("by_partNumber", (q) =>
            q.eq("businessAccountId", businessAccountId).eq("partNumber", part.partNumber),
          )
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
            sortGrid: part.sortGrid,
            sortBin: part.sortBin,
            marketPrice: part.marketPrice,
            marketPriceCurrency: part.marketPriceCurrency,
            marketPriceLastSyncedAt: part.marketPriceLastSyncedAt,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name, {
              description: part.description,
              category: part.category,
              sortGrid: part.sortGrid,
              sortBin: part.sortBin,
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
            businessAccountId,
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
            sortGrid: part.sortGrid,
            sortBin: part.sortBin,
            marketPrice: part.marketPrice,
            marketPriceCurrency: part.marketPriceCurrency,
            marketPriceLastSyncedAt: part.marketPriceLastSyncedAt,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name, {
              description: part.description,
              category: part.category,
              sortGrid: part.sortGrid,
              sortBin: part.sortBin,
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

export const seedBricklinkColors = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
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
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("bricklinkColorReference")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
      for (const entry of existing) {
        await ctx.db.delete(entry._id);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      const existing = await ctx.db
        .query("bricklinkColorReference")
        .withIndex("by_colorId", (q) =>
          q
            .eq("businessAccountId", args.businessAccountId)
            .eq("bricklinkColorId", record.bricklinkColorId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: record.name,
          rgb: record.rgb,
          colorType: record.colorType,
          isTransparent: record.isTransparent,
          syncedAt: record.syncedAt,
          updatedAt: record.syncedAt,
        });
        updated++;
      } else {
        await ctx.db.insert("bricklinkColorReference", {
          businessAccountId: args.businessAccountId,
          bricklinkColorId: record.bricklinkColorId,
          name: record.name,
          rgb: record.rgb,
          colorType: record.colorType,
          isTransparent: record.isTransparent,
          syncedAt: record.syncedAt,
          createdAt: record.syncedAt,
          updatedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedBricklinkColors", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

export const seedBricklinkCategories = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    records: v.array(
      v.object({
        bricklinkCategoryId: v.number(),
        name: v.string(),
        parentCategoryId: v.optional(v.number()),
        path: v.optional(v.array(v.number())),
        syncedAt: v.number(),
      }),
    ),
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("bricklinkCategoryReference")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
      for (const entry of existing) {
        await ctx.db.delete(entry._id);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      const existing = await ctx.db
        .query("bricklinkCategoryReference")
        .withIndex("by_categoryId", (q) =>
          q
            .eq("businessAccountId", args.businessAccountId)
            .eq("bricklinkCategoryId", record.bricklinkCategoryId),
        )
        .first();

      const pathKey = buildCategoryPathKey(record.path);

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: record.name,
          parentCategoryId: record.parentCategoryId,
          path: record.path,
          pathKey,
          syncedAt: record.syncedAt,
          updatedAt: record.syncedAt,
        });
        updated++;
      } else {
        await ctx.db.insert("bricklinkCategoryReference", {
          businessAccountId: args.businessAccountId,
          bricklinkCategoryId: record.bricklinkCategoryId,
          name: record.name,
          parentCategoryId: record.parentCategoryId,
          path: record.path,
          pathKey,
          syncedAt: record.syncedAt,
          createdAt: record.syncedAt,
          updatedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedBricklinkCategories", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

export const seedPartColorAvailability = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
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
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("bricklinkPartColorAvailability")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
      for (const entry of existing) {
        await ctx.db.delete(entry._id);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      const candidates = await ctx.db
        .query("bricklinkPartColorAvailability")
        .withIndex("by_part", (q) =>
          q.eq("businessAccountId", args.businessAccountId).eq("partNumber", record.partNumber),
        )
        .collect();
      const existing = candidates.find((entry) => entry.colorId === record.colorId);

      if (existing) {
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
        await ctx.db.insert("bricklinkPartColorAvailability", {
          businessAccountId: args.businessAccountId,
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

export const seedElementReferences = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
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
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("bricklinkElementReference")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
      for (const entry of existing) {
        await ctx.db.delete(entry._id);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      const existing = await ctx.db
        .query("bricklinkElementReference")
        .withIndex("by_element", (q) =>
          q.eq("businessAccountId", args.businessAccountId).eq("elementId", record.elementId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          partNumber: record.partNumber,
          colorId: record.colorId,
          bricklinkPartId: record.bricklinkPartId ?? existing.bricklinkPartId,
          designId: record.designId ?? existing.designId,
          syncedAt: record.syncedAt,
        });
        updated++;
      } else {
        await ctx.db.insert("bricklinkElementReference", {
          businessAccountId: args.businessAccountId,
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

export const refreshCatalogEntries = mutation({
  args: {
    limit: v.optional(v.number()),
    partNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

    const targetParts: Doc<"legoPartCatalog">[] = [];

    if (args.partNumber) {
      const specific = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("partNumber", args.partNumber!),
        )
        .first();
      if (specific) {
        targetParts.push(specific);
      }
    }

    if (targetParts.length < limit) {
      const staleParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("dataFreshness", "stale"),
        )
        .take(limit);

      const expiredParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("dataFreshness", "expired"),
        )
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
            identityKey: businessAccountId,
          }),
          client.request<{
            data: {
              avg_price?: number;
              currency_code?: string;
            };
          }>({
            path: `/items/part/${part.partNumber}/price`,
            identityKey: businessAccountId,
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
          marketPrice: price?.avg_price ?? part.marketPrice,
          marketPriceCurrency: price?.currency_code ?? part.marketPriceCurrency ?? "USD",
          marketPriceLastSyncedAt: price?.avg_price ? completedAt : part.marketPriceLastSyncedAt,
          lastUpdated: completedAt,
          lastFetchedFromBricklink: completedAt,
          dataFreshness: "fresh",
          searchKeywords: buildSearchKeywords(part.partNumber, detail?.name ?? part.name, {
            description: detail ? `Bricklink part: ${detail.name}` : part.description,
            category: part.category,
            sortGrid: part.sortGrid,
            sortBin: part.sortBin,
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

// Helper function to format parts for response
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
    dataSource: part.dataSource,
    lastUpdated: part.lastUpdated,
    dataFreshness: getDataFreshness(part.lastUpdated),
    bricklinkPartId: part.bricklinkPartId,
    bricklinkCategoryId: part.bricklinkCategoryId,
    primaryColorId: part.primaryColorId,
    availableColorIds: part.availableColorIds ?? [],
    sortGrid: part.sortGrid,
    sortBin: part.sortBin,
    marketPrice: part.marketPrice,
    marketPriceCurrency: part.marketPriceCurrency,
    marketPriceLastSyncedAt: part.marketPriceLastSyncedAt,
  };
}

async function loadCatalogFilters(
  ctx: QueryCtx,
  businessAccountId: Id<"businessAccounts">,
  filters: {
    colors: Set<number>;
    categories: Set<number>;
  },
) {
  const [colorReferences, categoryReferences, colorAvailability, catalogParts] = await Promise.all([
    ctx.db
      .query("bricklinkColorReference")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect(),
    ctx.db
      .query("bricklinkCategoryReference")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect(),
    ctx.db
      .query("bricklinkPartColorAvailability")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect(),
    ctx.db
      .query("legoPartCatalog")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect(),
  ]);

  const colorCounts = new Map<number, number>();
  for (const availability of colorAvailability) {
    colorCounts.set(
      availability.colorId,
      (colorCounts.get(availability.colorId) ?? 0) + (availability.elementIds?.length ?? 1),
    );
  }

  const categoryCounts = new Map<number, number>();
  for (const part of catalogParts) {
    if (part.bricklinkCategoryId !== undefined) {
      categoryCounts.set(
        part.bricklinkCategoryId,
        (categoryCounts.get(part.bricklinkCategoryId) ?? 0) + 1,
      );
    }
    part.categoryPath?.forEach((categoryId) => {
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
    });
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
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 100);

  return {
    colors,
    categories,
    summary: {
      totalParts: catalogParts.length,
      totalColors: colors.length,
      totalCategories: categories.length,
    },
  };
}

async function fetchColorReferences(
  ctx: QueryCtx,
  businessAccountId: Id<"businessAccounts">,
  colorIds: number[],
) {
  const uniqueIds = Array.from(new Set(colorIds));
  const map = new Map<number, Doc<"bricklinkColorReference">>();

  for (const colorId of uniqueIds) {
    const record = await ctx.db
      .query("bricklinkColorReference")
      .withIndex("by_colorId", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("bricklinkColorId", colorId),
      )
      .first();
    if (record) {
      map.set(colorId, record);
    }
  }

  return map;
}

async function enrichPartWithReferences(
  ctx: QueryCtx,
  businessAccountId: Id<"businessAccounts">,
  part: Doc<"legoPartCatalog">,
) {
  const [colorAvailability, elementReferences] = await Promise.all([
    ctx.db
      .query("bricklinkPartColorAvailability")
      .withIndex("by_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", part.partNumber),
      )
      .collect(),
    ctx.db
      .query("bricklinkElementReference")
      .withIndex("by_part", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("partNumber", part.partNumber),
      )
      .collect(),
  ]);

  const colorIds = new Set<number>();
  colorAvailability.forEach((entry) => colorIds.add(entry.colorId));
  if (part.primaryColorId !== undefined) {
    colorIds.add(part.primaryColorId);
  }

  const colorMap = await fetchColorReferences(ctx, businessAccountId, Array.from(colorIds));
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
    marketPricing:
      formattedPart.marketPrice !== undefined
        ? {
            amount: formattedPart.marketPrice,
            currency: formattedPart.marketPriceCurrency ?? "USD",
            lastSyncedAt: formattedPart.marketPriceLastSyncedAt,
          }
        : null,
  };
}
