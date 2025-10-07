import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { recordMetric } from "../lib/external/metrics";
import {
  applyBackgroundState,
  computeFreshness,
  computeNextRefreshSuggestion,
  isStaleOrWorse,
} from "../lib/catalog/freshness";
import type { FreshnessState } from "../lib/catalog/freshness";
import { upsertCatalogSnapshot } from "../lib/catalog/persistence";
import { BricklinkQuotaExceededError } from "../lib/catalog/rateLimiter";
// import { api } from "../_generated/api";
import {
  SearchPartsReturn,
  OverlayResponse,
  RefreshPartReturn,
  PartDetailsReturn,
  ValidateFreshnessReturn,
  type ValidateFreshnessResult,
} from "../validators/catalog";

/**
 * Catalog Functions
 *
 * This module provides comprehensive catalog management functionality including:
 * - Part search with local catalog and Bricklink API fallback
 * - Part overlay management for business-specific customizations
 * - Data freshness tracking and refresh operations
 */

/**
 * Convert protocol-relative URLs (starting with //) to absolute HTTPS URLs
 * This is required for Next.js Image component compatibility
 */
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

// Pagination is now handled by Convex paginationOptsValidator

/**
 * Determine data freshness based on last update timestamp
 * @param lastUpdated - Timestamp of last update
 * @returns "fresh" (< 7 days), "stale" (7-30 days), or "expired" (> 30 days)
 */
function getDataFreshness(lastFetchedFromBricklink: number | null | undefined): FreshnessState {
  return computeFreshness(lastFetchedFromBricklink ?? null);
}

/**
 * Search for Lego parts in local catalog with optional Bricklink API fallback
 * Uses proper Convex pagination following Convex best practices
 */
export const searchParts = query({
  args: {
    query: v.string(),
    // New structured search fields (optional; maintained for backward compatibility)
    gridBin: v.optional(v.string()),
    partTitle: v.optional(v.string()),
    partId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(
      v.object({
        field: v.union(v.literal("name"), v.literal("marketPrice"), v.literal("lastUpdated")),
        direction: v.union(v.literal("asc"), v.literal("desc")),
      }),
    ),
  },
  returns: SearchPartsReturn,

  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);
    const partIdSearch = args.partId?.trim();
    const partTitleSearch = args.partTitle?.trim();
    const gridBinSearch = args.gridBin?.trim();
    const startTime = Date.now();

    // Determine single active search mode
    let mode: "partNumber" | "name" | "gridBin" | null = null;
    if (partIdSearch) mode = "partNumber";
    else if (partTitleSearch) mode = "name";
    else if (gridBinSearch) mode = "gridBin";

    if (!mode) {
      // Return empty pagination result that matches Convex's expected structure
      const emptyResult: {
        page: ReturnType<typeof formatPartForResponse>[];
        isDone: boolean;
        continueCursor: string;
      } = {
        page: [],
        isDone: true,
        // A string is required by PaginationResult; since we're done, this won't be used.
        continueCursor: "",
      };
      return emptyResult;
    }

    if (mode === "partNumber") {
      const queryResults = await ctx.db
        .query("parts")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", partIdSearch!))
        .paginate(args.paginationOpts);

      const parts = queryResults.page.map(formatPartForResponse);

      recordMetric("catalog.search.local", {
        query: partIdSearch!.substring(0, 50),
        resultCount: parts.length,
        durationMs: Date.now() - startTime,
        strategy: "partNumber",
      });

      // Transform the results and return pagination structure directly
      return {
        page: parts,
        isDone: queryResults.isDone,
        continueCursor: queryResults.continueCursor,
      };
    }

    if (mode === "name") {
      // Convex search indexes return results ordered by relevance by default
      const query = ctx.db
        .query("parts")
        .withSearchIndex("search_parts_by_name", (q) => q.search("name", partTitleSearch!));

      const paginationResult = await query.paginate(args.paginationOpts);

      const parts = paginationResult.page.map(formatPartForResponse);

      recordMetric("catalog.search.local", {
        query: partTitleSearch!.substring(0, 50),
        resultCount: parts.length,
        durationMs: Date.now() - startTime,
        strategy: "name",
      });

      // Transform the results and return pagination structure directly
      return {
        page: parts,
        isDone: paginationResult.isDone,
        continueCursor: paginationResult.continueCursor,
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

    const overlayPage = await overlayQuery.paginate(args.paginationOpts);

    // In-memory filter for bin-only case
    const overlayFiltered = bin
      ? overlayPage.page.filter((o: Doc<"catalogPartOverlay">) =>
          grid ? true : (o.sortBin ?? "") === bin,
        )
      : overlayPage.page;

    // Fetch corresponding part records
    const partsDocs: Doc<"parts">[] = [];
    for (const o of overlayFiltered) {
      const part = await ctx.db
        .query("parts")
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

    // Transform the results and return pagination structure directly
    return {
      page: parts,
      isDone: overlayPage.isDone,
      continueCursor: overlayPage.continueCursor,
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
  returns: PartDetailsReturn,
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const startTime = Date.now();

    // First check local catalog
    const localPart = await ctx.db
      .query("parts")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    if (localPart) {
      const freshness = getDataFreshness(
        localPart.lastFetchedFromBricklink ?? localPart.lastUpdated,
      );
      const detail = await enrichPartWithReferences(ctx, localPart);
      const refreshSuggestion = computeNextRefreshSuggestion(
        localPart.dataFreshness ?? freshness,
        localPart.lastFetchedFromBricklink ?? localPart.lastUpdated,
      );

      recordMetric("catalog.getPartDetails.cache", {
        partNumber: args.partNumber,
        durationMs: Date.now() - startTime,
        dataFreshness: freshness,
        cacheHit: true,
      });

      // Fetch pricing data from partPrices table
      const pricingRecords =
        localPart.primaryColorId !== undefined
          ? await ctx.db
              .query("partPrices")
              .withIndex("by_part_color_condition_type", (q) =>
                q
                  .eq("partNumber", args.partNumber)
                  .eq("colorId", localPart.primaryColorId!)
                  .eq("condition", "new")
                  .eq("priceType", "stock"),
              )
              .take(1)
          : await ctx.db
              .query("partPrices")
              .withIndex("by_part_color_condition_type", (q) => q.eq("partNumber", args.partNumber))
              .take(1);

      const marketPricing =
        pricingRecords.length > 0
          ? {
              amount:
                pricingRecords[0].avgPrice ??
                pricingRecords[0].minPrice ??
                pricingRecords[0].maxPrice,
              currency: pricingRecords[0].currency,
              lastSyncedAt: pricingRecords[0].lastSyncedAt,
            }
          : null;

      return {
        ...detail,
        source: "local" as const,
        bricklinkStatus: "skipped" as const,
        marketPricing,
        refresh: {
          ...refreshSuggestion,
          shouldRefresh: isStaleOrWorse(localPart.dataFreshness ?? freshness),
        },
      };
    }
    recordMetric("catalog.getPartDetails.cache", {
      partNumber: args.partNumber,
      durationMs: Date.now() - startTime,
      dataFreshness: "expired",
      cacheHit: false,
    });

    throw new ConvexError(`Part ${args.partNumber} not found in catalog`);
  },
});

/**
 * Refresh part snapshot - lightweight mutation that schedules the actual work
 * Follows Convex best practices by using mutation + scheduled action pattern
 */
export const refreshPartSnapshot = mutation({
  args: {
    partNumber: v.string(),
    reserve: v.optional(v.boolean()),
  },
  returns: RefreshPartReturn,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);

    // Check if part exists in catalog
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    if (!existing) {
      throw new ConvexError(`Part ${args.partNumber} not found in catalog`);
    }

    // Check if refresh is already in progress to prevent duplicates
    const refreshInProgress = existing.dataFreshness === "background";
    if (refreshInProgress) {
      // Return current state if refresh already scheduled
      return {
        ...formatPartForResponse(existing),
        bricklinkStatus: "scheduled" as const,
        marketPricing: null,
      };
    }

    // Mark as background refresh to prevent duplicate requests
    const now = Date.now();
    const fallbackState =
      existing.dataFreshness ??
      getDataFreshness(existing.lastFetchedFromBricklink ?? existing.lastUpdated);
    await ctx.db.patch(existing._id, {
      dataFreshness: applyBackgroundState(fallbackState),
      freshnessUpdatedAt: now,
    });

    // Schedule the actual refresh work as an action
    await ctx.scheduler.runAfter(0, internal.functions.catalog.refreshPartSnapshotAction, {
      partNumber: args.partNumber,
      reserve: args.reserve ?? true,
      businessAccountId,
    });

    recordMetric("catalog.refresh.part.scheduled", {
      partNumber: args.partNumber,
      businessAccountId,
    });

    // Return immediate response indicating refresh is scheduled
    return {
      ...formatPartForResponse(existing),
      bricklinkStatus: "scheduled" as const,
      marketPricing: null,
    };
  },
});

/**
 * Internal action that performs the actual Bricklink API refresh
 * Actions can use setTimeout (for retries) and external APIs
 */
export const refreshPartSnapshotAction = internalAction({
  args: {
    partNumber: v.string(),
    reserve: v.boolean(),
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();

    try {
      // Fetch the current part state
      const existing = await ctx.runQuery(internal.functions.catalog.getPartForAction, {
        partNumber: args.partNumber,
      });

      if (!existing) {
        recordMetric("catalog.refresh.part.action.error", {
          partNumber: args.partNumber,
          error: "part_not_found",
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Call Bricklink API directly (actions don't have ctx.db for the aggregator's rate limiter)
      // The httpClient has its own in-memory rate limiting
      const { BricklinkClient } = await import("../lib/external/bricklink");
      const client = new BricklinkClient();

      const DETAIL_PATH = `/items/part/${encodeURIComponent(args.partNumber)}`;
      const COLORS_PATH = `/items/part/${encodeURIComponent(args.partNumber)}/colors`;

      const [detailResult, colorsResult] = await Promise.all([
        client.request<{ meta: unknown; data: Record<string, unknown> }>({
          path: DETAIL_PATH,
          identityKey: "catalog-refresh",
        }),
        client.request<{ meta: unknown; data: Array<Record<string, unknown>> }>({
          path: COLORS_PATH,
          identityKey: "catalog-refresh",
        }),
      ]);

      const detail = detailResult.data?.data;
      const colors = colorsResult.data?.data;

      if (!detail) {
        throw new ConvexError(`Bricklink part ${args.partNumber} not found`);
      }

      // Parse the response using the same logic as the aggregator
      const parseNumber = (input: unknown): number | undefined => {
        if (input === undefined || input === null) return undefined;
        if (typeof input === "number") return Number.isNaN(input) ? undefined : input;
        if (typeof input === "string") {
          const num = Number(input);
          return Number.isNaN(num) ? undefined : num;
        }
        return undefined;
      };

      const coerceBoolean = (value: unknown): boolean | undefined => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value !== 0;
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (normalized === "y" || normalized === "yes" || normalized === "true") return true;
          if (normalized === "n" || normalized === "no" || normalized === "false") return false;
        }
        return undefined;
      };

      const availableColorIds = Array.isArray(colors)
        ? colors
            .map((entry) => parseNumber((entry as Record<string, unknown>)["color_id"]))
            .filter((value): value is number => typeof value === "number")
        : undefined;

      const snapshot = {
        partNumber: args.partNumber,
        canonicalName: typeof detail.name === "string" ? detail.name : undefined,
        categoryId: parseNumber(detail.category_id),
        description: typeof detail.description === "string" ? detail.description : undefined,
        imageUrl: normalizeImageUrl(
          typeof detail.image_url === "string" ? detail.image_url : undefined,
        ),
        thumbnailUrl: normalizeImageUrl(
          typeof detail.thumbnail_url === "string" ? detail.thumbnail_url : undefined,
        ),
        weightGrams: parseNumber(detail.weight),
        dimensionsMm: {
          lengthMm: parseNumber(detail.dim_x),
          widthMm: parseNumber(detail.dim_y),
          heightMm: parseNumber(detail.dim_z),
        },
        isPrinted: coerceBoolean(detail.printed),
        isObsolete: coerceBoolean(detail.is_obsolete ?? detail.obsolete),
        availableColorIds,
        rawDetail: detail,
        rawColors: colors,
      };

      // Update the database via internal mutation
      await ctx.runMutation(internal.functions.catalog.updatePartFromSnapshot, {
        partNumber: args.partNumber,
        snapshot,
        now: startTime,
        existing,
      });

      recordMetric("catalog.refresh.part.action.success", {
        partNumber: args.partNumber,
        durationMs: Date.now() - startTime,
        snapshotColors: snapshot.availableColorIds?.length ?? 0,
        source: "bricklink",
      });
    } catch (error) {
      if (error instanceof BricklinkQuotaExceededError) {
        recordMetric("catalog.refresh.part.action.quota", {
          partNumber: args.partNumber,
          retryAfterMs: error.retryAfterMs,
        });

        // Schedule retry after quota reset
        const jitterMs = Math.floor(Math.random() * 500);
        await ctx.scheduler.runAfter(
          (error.retryAfterMs ?? 0) + jitterMs,
          internal.functions.catalog.refreshPartSnapshotAction,
          {
            partNumber: args.partNumber,
            reserve: true,
            businessAccountId: args.businessAccountId,
          },
        );
        return;
      }

      console.error("[ERROR] Refresh failed:", error);
      console.error("[ERROR] Error type:", typeof error);
      console.error("[ERROR] Error instanceof Error:", error instanceof Error);
      console.error("[ERROR] Error stack:", error instanceof Error ? error.stack : "N/A");

      recordMetric("catalog.refresh.part.action.error", {
        partNumber: args.partNumber,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });

      // Mark as failed and remove background state
      await ctx.runMutation(internal.functions.catalog.markRefreshFailed, {
        partNumber: args.partNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const validateDataFreshness = mutation({
  args: {
    partNumbers: v.array(v.string()),
    enqueueRefresh: v.optional(v.boolean()),
  },
  returns: ValidateFreshnessReturn,
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);
    const uniqueParts = Array.from(new Set(args.partNumbers));
    const now = Date.now();

    const results: ValidateFreshnessResult["results"] = [];

    for (const partNumber of uniqueParts) {
      const part = await ctx.db
        .query("parts")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", partNumber))
        .first();

      if (!part) {
        results.push({ partNumber, status: "missing" });
        continue;
      }

      const dataFreshness =
        part.dataFreshness ?? getDataFreshness(part.lastFetchedFromBricklink ?? part.lastUpdated);

      // For now, assume pricing freshness is separate - this could be enhanced later
      const pricingFreshness = "fresh"; // Pricing freshness should be checked separately

      const effectiveFreshness = part.dataFreshness ?? dataFreshness;
      const shouldRefresh = isStaleOrWorse(effectiveFreshness);

      let scheduled = false;
      if (shouldRefresh && args.enqueueRefresh) {
        await ctx.db.patch(part._id, {
          dataFreshness: applyBackgroundState(effectiveFreshness),
          freshnessUpdatedAt: now,
        });

        await ctx.scheduler.runAfter(0, internal.functions.catalog.refreshPartSnapshotAction, {
          partNumber,
          reserve: true,
          businessAccountId: (await requireActiveUser(ctx)).businessAccountId,
        });
        scheduled = true;
      }

      results.push({
        partNumber,
        status: "ok",
        dataFreshness: effectiveFreshness,
        pricingFreshness,
        shouldRefresh,
        scheduled,
        refreshWindow: computeNextRefreshSuggestion(
          effectiveFreshness,
          part.lastFetchedFromBricklink ?? part.lastUpdated,
        ),
        lastFetchedFromBricklink: part.lastFetchedFromBricklink ?? null,
        marketPriceLastSyncedAt: null,
      });
    }

    recordMetric("catalog.validateFreshness", {
      evaluated: results.length,
      scheduled: results.filter((r) => r.status === "ok" && r.scheduled === true).length,
    });

    return {
      evaluated: results.length,
      results,
    };
  },
});

export const scheduleStaleRefresh = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const queued = new Map<string, Doc<"parts">>();

    const enqueue = (parts: Doc<"parts">[]) => {
      for (const part of parts) {
        if (queued.size >= limit) return;
        if (!queued.has(part.partNumber)) {
          queued.set(part.partNumber, part);
        }
      }
    };

    const states: FreshnessState[] = ["background", "stale", "expired"];
    for (const state of states) {
      if (queued.size >= limit) {
        break;
      }

      const matches = await ctx.db
        .query("parts")
        .withIndex("by_dataFreshness", (q) => q.eq("dataFreshness", state))
        .collect();
      enqueue(matches.slice(0, Math.max(0, limit - queued.size)));
    }

    const tasks = Array.from(queued.values());
    const scheduled: string[] = [];
    const now = Date.now();

    for (const part of tasks) {
      const freshness =
        part.dataFreshness ?? getDataFreshness(part.lastFetchedFromBricklink ?? part.lastUpdated);
      await ctx.db.patch(part._id, {
        dataFreshness: applyBackgroundState(freshness),
        freshnessUpdatedAt: now,
      });

      await ctx.scheduler.runAfter(0, internal.functions.catalog.refreshPartSnapshotAction, {
        partNumber: part.partNumber,
        reserve: true,
        businessAccountId: "system" as Id<"businessAccounts">, // System-level refresh
      });
      scheduled.push(part.partNumber);
    }

    recordMetric("catalog.refresh.schedule", {
      requested: limit,
      scheduled: scheduled.length,
    });

    return {
      scheduled: scheduled.length,
      partNumbers: scheduled,
    };
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
  returns: v.union(OverlayResponse, v.null()),
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
  returns: v.union(OverlayResponse, v.null()),
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
function formatPartForResponse(part: Doc<"parts">) {
  return {
    _id: part._id,
    partNumber: part.partNumber,
    name: part.name,
    description: part.description ?? null,
    category: part.category ?? null,
    categoryPath: part.categoryPath ?? [],
    categoryPathKey: part.categoryPathKey,
    imageUrl: part.imageUrl ?? null,
    thumbnailUrl: part.thumbnailUrl ?? null,
    dataSource: part.dataSource,
    lastUpdated: part.lastUpdated,
    lastFetchedFromBricklink: part.lastFetchedFromBricklink ?? null,
    dataFreshness: part.dataFreshness,
    freshnessUpdatedAt: part.freshnessUpdatedAt ?? part.lastUpdated,
    bricklinkPartId: part.bricklinkPartId,
    bricklinkCategoryId: part.bricklinkCategoryId,
    primaryColorId: part.primaryColorId,
    availableColorIds: part.availableColorIds ?? [],
    weight: part.weight ?? null,
    dimensions: part.dimensions ?? null,
    isPrinted: part.isPrinted,
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
async function enrichPartWithReferences(ctx: QueryCtx, part: Doc<"parts">) {
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
    // Fetch pricing from partPrices table
    marketPricing: await fetchPartPricing(ctx, part.partNumber),
  };
}

// Removed filter count management; counts no longer used

/**
 * Fetch pricing data for a part from the partPrices table
 */
async function fetchPartPricing(ctx: QueryCtx, partNumber: string) {
  const pricingRecords = await ctx.db
    .query("partPrices")
    .withIndex("by_part_color_condition_type", (q) => q.eq("partNumber", partNumber))
    .take(1);

  if (pricingRecords.length === 0) {
    return null;
  }

  const record = pricingRecords[0];
  return {
    amount: record.avgPrice ?? record.minPrice ?? record.maxPrice,
    currency: record.currency,
    lastSyncedAt: record.lastSyncedAt,
  };
}

// Internal helper functions for the action-based refresh pattern

/**
 * Internal query to get part data for action processing
 */
export const getPartForAction = internalQuery({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parts")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();
  },
});

/**
 * Internal mutation to update part from snapshot
 */
export const updatePartFromSnapshot = internalMutation({
  args: {
    partNumber: v.string(),
    snapshot: v.any(), // PartSnapshot type
    now: v.number(),
    existing: v.any(), // Doc<"parts">
  },
  handler: async (ctx, args) => {
    const updated = await upsertCatalogSnapshot(ctx, args.partNumber, args.snapshot, {
      now: args.now,
      existing: args.existing,
    });
    return updated;
  },
});

/**
 * Internal mutation to mark refresh as failed
 */
export const markRefreshFailed = internalMutation({
  args: {
    partNumber: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    if (existing && existing.dataFreshness === "background") {
      // Restore previous freshness state
      const previousState =
        existing.dataFreshness ??
        getDataFreshness(existing.lastFetchedFromBricklink ?? existing.lastUpdated);
      await ctx.db.patch(existing._id, {
        dataFreshness: previousState,
        freshnessUpdatedAt: Date.now(),
      });
    }
  },
});
