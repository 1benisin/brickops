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
    searchTerm: v.string(),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
    includeBricklinkFallback: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    const searchTerm = args.searchTerm.trim();
    const limit = Math.min(args.limit ?? 20, 100); // Cap at 100 results

    if (!searchTerm || searchTerm.length < 2) {
      throw new ConvexError("Search term must be at least 2 characters");
    }

    const startTime = Date.now();

    // Search local catalog first using full-text search
    let localResults;
    try {
      // Try using search index if available (real Convex environment)
      localResults = await ctx.db
        .query("legoPartCatalog")
        .withSearchIndex("search_parts", (q) => {
          let query = q.search("name", searchTerm).eq("businessAccountId", businessAccountId);
          if (args.category) {
            query = query.eq("category", args.category);
          }
          return query;
        })
        .take(limit);
    } catch (error) {
      // Fallback for test environment - use simple filtering
      const allParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
        .collect();

      localResults = allParts
        .filter((part) => {
          const matchesSearch = part.name.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesCategory = !args.category || part.category === args.category;
          return matchesSearch && matchesCategory;
        })
        .slice(0, limit);
    }

    const searchDuration = Date.now() - startTime;

    recordMetric("catalog.search.local", {
      searchTerm: searchTerm.substring(0, 50), // Truncate for privacy
      resultCount: localResults.length,
      durationMs: searchDuration,
      category: args.category,
    });

    // If we have sufficient fresh results or fallback is disabled, return local results
    const freshResults = localResults.filter(
      (part) => getDataFreshness(part.lastUpdated) === "fresh",
    );

    if (freshResults.length >= Math.min(limit, 10) || !args.includeBricklinkFallback) {
      return {
        parts: localResults.map(formatPartForResponse),
        source: "local" as const,
        searchDurationMs: searchDuration,
        totalResults: localResults.length,
      };
    }

    // If insufficient fresh results and fallback enabled, try Bricklink API
    try {
      // Apply rate limiting before external API call
      sharedRateLimiter.consume({
        key: "catalog:bricklink-search",
        capacity: CATALOG_RATE_LIMIT.capacity,
        intervalMs: CATALOG_RATE_LIMIT.intervalMs,
      });

      const bricklinkClient = new BricklinkClient();

      // Search Bricklink for parts (using items endpoint)
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
          limit: Math.min(limit - localResults.length, 20),
        },
        identityKey: businessAccountId,
      });

      if (bricklinkResponse.data && bricklinkResponse.data.data) {
        const bricklinkParts = bricklinkResponse.data.data;

        recordMetric("catalog.search.bricklink", {
          searchTerm: searchTerm.substring(0, 50),
          resultCount: bricklinkParts.length,
          durationMs: Date.now() - startTime,
        });

        // Convert Bricklink results to our format
        const formattedBricklinkParts = bricklinkParts.map((part) => ({
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
          createdBy: null,
          createdAt: Date.now(),
        }));

        // Combine local and Bricklink results, prioritizing local
        const combinedResults = [
          ...localResults.map(formatPartForResponse),
          ...formattedBricklinkParts.slice(0, limit - localResults.length),
        ];

        return {
          parts: combinedResults,
          source: "hybrid" as const,
          searchDurationMs: Date.now() - startTime,
          totalResults: combinedResults.length,
          bricklinkResultCount: formattedBricklinkParts.length,
        };
      }
    } catch (error) {
      // Log error but don't fail the request - return local results as fallback
      recordMetric("catalog.search.bricklink.error", {
        searchTerm: searchTerm.substring(0, 50),
        error: error instanceof Error ? error.message : "Unknown error",
      });

      console.warn("Bricklink search failed, falling back to local results:", error);
    }

    return {
      parts: localResults.map(formatPartForResponse),
      source: "local" as const,
      searchDurationMs: Date.now() - startTime,
      totalResults: localResults.length,
      fallbackUsed: true,
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

      // If data is fresh or Bricklink fetch not requested, return local data
      if (freshness === "fresh" || !args.fetchFromBricklink) {
        recordMetric("catalog.getPartDetails.local", {
          partNumber: args.partNumber,
          dataFreshness: freshness,
          durationMs: Date.now() - startTime,
        });

        return formatPartForResponse(localPart);
      }
    }

    // If no local data or stale/expired data and Bricklink fetch requested
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
            year_released?: number;
            weight?: string;
            dim_x?: string;
            dim_y?: string;
            dim_z?: string;
          };
        }>({
          path: `/items/part/${args.partNumber}`,
          identityKey: businessAccountId,
        });

        if (bricklinkResponse.data && bricklinkResponse.data.data) {
          const bricklinkPart = bricklinkResponse.data.data;

          recordMetric("catalog.getPartDetails.bricklink", {
            partNumber: args.partNumber,
            durationMs: Date.now() - startTime,
          });

          return {
            _id: localPart?._id ?? (`bricklink:${bricklinkPart.no}` as Id<"legoPartCatalog">),
            partNumber: bricklinkPart.no,
            name: bricklinkPart.name,
            description: `Bricklink part: ${bricklinkPart.name}`,
            category: bricklinkPart.category_id?.toString(),
            imageUrl: bricklinkPart.image_url,
            dataSource: "bricklink" as const,
            lastUpdated: Date.now(),
            dataFreshness: "fresh" as const,
            businessAccountId,
            bricklinkPartId: bricklinkPart.no,
            bricklinkCategoryId: bricklinkPart.category_id,
            metadata: {
              yearReleased: bricklinkPart.year_released,
              weight: bricklinkPart.weight,
              dimensions: {
                x: bricklinkPart.dim_x,
                y: bricklinkPart.dim_y,
                z: bricklinkPart.dim_z,
              },
            },
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

    // Return local data if available, even if stale
    if (localPart) {
      return formatPartForResponse(localPart);
    }

    throw new ConvexError(`Part ${args.partNumber} not found in catalog`);
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
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);
    const now = Date.now();

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
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
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
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
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

// Helper function to format parts for response
function formatPartForResponse(part: Doc<"legoPartCatalog">) {
  return {
    _id: part._id,
    partNumber: part.partNumber,
    name: part.name,
    description: part.description,
    category: part.category,
    imageUrl: part.imageUrl,
    dataSource: part.dataSource,
    lastUpdated: part.lastUpdated,
    dataFreshness: getDataFreshness(part.lastUpdated),
    bricklinkPartId: part.bricklinkPartId,
    bricklinkCategoryId: part.bricklinkCategoryId,
  };
}
