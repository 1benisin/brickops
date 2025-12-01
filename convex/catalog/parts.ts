import { query, internalQuery, internalMutation, action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import {
  searchPartsReturnValidator,
  partOverlayReturnValidator,
  partTableFields,
} from "./validators";
import { requireActiveUser, normalizeImageUrl } from "./helpers";
import { recordMetric } from "../lib/external/metrics";

// ============================================================================
// QUERIES
// ============================================================================

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

    // Check if refresh is in progress (outbox)
    const outboxMessage = await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q.eq("tableName", "parts").eq("primaryKey", args.partNumber),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const isStale = part.lastFetched < thirtyDaysAgo;

    // Determine status: refreshing > stale > fresh
    const status: "refreshing" | "stale" | "fresh" = outboxMessage
      ? "refreshing"
      : isStale
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
        brickowlId: part.brickowlId,
        ldrawId: part.ldrawId,
        legoId: part.legoId,
        lastFetched: part.lastFetched,
      },
      status,
    };
  },
});

/**
 * Get part data for internal use (returns raw schema, not validated return type)
 */
export const getPartInternal = internalQuery({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();
  },
});

export const getPartByBrickowlId = internalQuery({
  args: {
    brickowlId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parts")
      .withIndex("by_brickowlId", (q) => q.eq("brickowlId", args.brickowlId))
      .first();
  },
});

// ============================================================================
// MUTATIONS
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
      // Update existing part
      await ctx.db.patch(existing._id, args.data);
    } else {
      // Insert new part
      await ctx.db.insert("parts", args.data);
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

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Enqueue part refresh - adds to outbox for background processing
 * Used by reactive hooks to trigger data updates
 */
export const enqueueRefreshPart = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    // Check if already in outbox (pending or inflight)
    const existing = await ctx.runQuery(internal.catalog.outbox.getOutboxMessage, {
      tableName: "parts",
      primaryKey: args.partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      // Already queued, skip silently
      return;
    }

    // Get lastFetched from part (if exists)
    const part = await ctx.runQuery(internal.catalog.parts.getPartInternal, {
      partNumber: args.partNumber,
    });

    // Enqueue to outbox
    await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
      tableName: "parts",
      primaryKey: args.partNumber,
      secondaryKey: undefined,
      lastFetched: part?.lastFetched,
      priority: 1, // HIGH priority for user-triggered refreshes
    });
  },
});

/**
 * Get BrickOwl part ID from BrickLink part ID using Rebrickable API
 * Returns the first BrickOwl ID found, or null if not found
 */
export const getBrickowlPartId = action({
  args: {
    bricklinkPartId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check feature flag to disable external calls in dev/test
    if (process.env.DISABLE_EXTERNAL_CALLS === "true") {
      return null;
    }

    await requireActiveUser(ctx);

    const { RebrickableClient } = await import("../api/rebrickable");
    const client = new RebrickableClient();

    try {
      const partsMap = await client.getPartsByBricklinkIds([args.bricklinkPartId]);
      const parts = partsMap.get(args.bricklinkPartId) ?? [];

      if (parts.length === 0) {
        return null;
      }

      // Return first BrickOwl ID found
      const brickowlIds = parts[0]?.external_ids.BrickOwl;
      if (!brickowlIds || brickowlIds.length === 0) {
        return null;
      }

      return brickowlIds[0];
    } catch (error) {
      // Log error but return null instead of throwing
      // This allows the calling code to handle missing mappings gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordMetric("external.rebrickable.getBrickowlPartId.error", {
        bricklinkPartId: args.bricklinkPartId,
        error: errorMessage,
      });
      return null;
    }
  },
});

/**
 * Get BrickOwl part IDs from multiple BrickLink part IDs using Rebrickable API
 * Returns a map of BrickLink ID -> BrickOwl ID(s)
 * Uses bulk API calls when possible to minimize requests
 */
export const getBrickowlPartIds = action({
  args: {
    bricklinkPartIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Check feature flag to disable external calls in dev/test
    if (process.env.DISABLE_EXTERNAL_CALLS === "true") {
      return {};
    }

    await requireActiveUser(ctx);

    if (args.bricklinkPartIds.length === 0) {
      return {};
    }

    const { RebrickableClient } = await import("../api/rebrickable");
    const client = new RebrickableClient();

    try {
      const partsMap = await client.getPartsByBricklinkIds(args.bricklinkPartIds);

      // Build map of BrickLink ID -> BrickOwl ID(s)
      const mapping: Record<string, string> = {};

      for (const bricklinkId of args.bricklinkPartIds) {
        const parts = partsMap.get(bricklinkId) ?? [];
        if (parts.length === 0) {
          continue;
        }

        // Get first BrickOwl ID from first part found
        const brickowlIds = parts[0]?.external_ids.BrickOwl;
        if (brickowlIds && brickowlIds.length > 0) {
          mapping[bricklinkId] = brickowlIds[0];
        }
      }

      return mapping;
    } catch (error) {
      // Log error but return empty map instead of throwing
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordMetric("external.rebrickable.getBrickowlPartIds.error", {
        bricklinkPartIdCount: args.bricklinkPartIds.length,
        error: errorMessage,
      });
      return {};
    }
  },
});

/**
 * Internal helper to fetch BrickLink part IDs from a BrickOwl BOID using Rebrickable.
 * Returns an array of BrickLink IDs (deduplicated) or an empty array if none found.
 */
export const getBricklinkPartIdsFromBrickowl = internalAction({
  args: {
    brickowlId: v.string(),
  },
  handler: async (_ctx, args) => {
    if (process.env.DISABLE_EXTERNAL_CALLS === "true") {
      return [];
    }

    const { RebrickableClient } = await import("../api/rebrickable");
    const client = new RebrickableClient();

    try {
      const partsMap = await client.getPartsByBrickowlIds([args.brickowlId]);
      const parts = partsMap.get(args.brickowlId) ?? [];

      const bricklinkIds = new Set<string>();
      for (const part of parts) {
        const ids = part.external_ids.BrickLink ?? [];
        for (const id of ids) {
          if (id) {
            bricklinkIds.add(id);
          }
        }
      }

      recordMetric("external.rebrickable.getBricklinkPartIdsFromBrickowl", {
        brickowlId: args.brickowlId,
        bricklinkIdCount: bricklinkIds.size,
      });

      return Array.from(bricklinkIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordMetric("external.rebrickable.getBricklinkPartIdsFromBrickowl.error", {
        brickowlId: args.brickowlId,
        errorCode: message,
      });
      return [];
    }
  },
});

/**
 * Ensure a part exists in the catalog and is up-to-date.
 * Checks part, colors, and prices. Enqueues refreshes if missing or stale.
 */
export const ensurePartCompleteness = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    const { partNumber } = args;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // 1. Check Part
    const part = await ctx.runQuery(internal.catalog.parts.getPartInternal, {
      partNumber,
    });

    const isPartMissing = !part;
    const isPartStale = part && part.lastFetched < thirtyDaysAgo;
    const isBrickowlIdMissing = part && !part.brickowlId;

    if (isPartMissing || isPartStale || isBrickowlIdMissing) {
      await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
        tableName: "parts",
        primaryKey: partNumber,
        lastFetched: part?.lastFetched,
        priority: 1,
      });
    }

    // 2. Check Part Colors
    const partColors = await ctx.runQuery(internal.catalog.colors.getPartColorsInternal, {
      partNumber,
    });

    const areColorsMissing = partColors.length === 0;
    // Check if ANY color is stale (or if we have colors but they are old)
    // Actually, usually we refresh all colors for a part at once.
    // Let's check the oldest fetch time.
    const oldestColorFetch =
      partColors.length > 0 ? Math.min(...partColors.map((pc) => pc.lastFetched)) : 0;
    const areColorsStale = partColors.length > 0 && oldestColorFetch < thirtyDaysAgo;

    if (areColorsMissing || areColorsStale) {
      await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
        tableName: "partColors",
        primaryKey: partNumber,
        lastFetched: oldestColorFetch || undefined,
        priority: 1,
      });
    }

    // Check if referenced colors exist and have mappings
    if (partColors.length > 0) {
      const uniqueColorIds = Array.from(new Set(partColors.map((pc) => pc.colorId)));

      for (const colorId of uniqueColorIds) {
        if (colorId === 0) continue;

        const color = await ctx.runQuery(internal.catalog.colors.getColorInternal, { colorId });

        // Refresh if color is missing entirely OR if we haven't checked for BrickOwl mapping yet (undefined)
        // null means we checked and found no mapping, so don't retry
        if (!color || color.brickowlColorId === undefined) {
          await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
            tableName: "colors",
            primaryKey: String(colorId),
            priority: 2,
          });
        }
      }
    }

    // 3. Check Prices (only if we have colors)
    if (partColors.length > 0) {
      for (const pc of partColors) {
        const prices = await ctx.runQuery(internal.catalog.prices.getPriceGuideInternal, {
          partNumber,
          colorId: pc.colorId,
        });

        const arePricesMissing = prices.length === 0;
        const oldestPriceFetch =
          prices.length > 0 ? Math.min(...prices.map((p) => p.lastFetched)) : 0;
        const arePricesStale = prices.length > 0 && oldestPriceFetch < thirtyDaysAgo;

        if (arePricesMissing || arePricesStale) {
          await ctx.runMutation(internal.catalog.outbox.enqueueCatalogRefresh, {
            tableName: "partPrices",
            primaryKey: partNumber,
            secondaryKey: String(pc.colorId),
            lastFetched: oldestPriceFetch || undefined,
            priority: 1,
          });
        }
      }
    }
  },
});
