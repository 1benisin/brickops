import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { recordMetric } from "../lib/external/metrics";
import { requireActiveUser } from "../users/authorization";
// (catalogClient not needed for direct image URLs)

// ============================================================================
// ENQUEUE ACTIONS (for frontend hooks)
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
    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "parts",
      primaryKey: args.partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      // Already queued, skip silently
      return;
    }

    // Get lastFetched from part (if exists)
    const part = await ctx.runQuery(internal.catalog.queries.getPartInternal, {
      partNumber: args.partNumber,
    });

    // Enqueue to outbox
    await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "parts",
      primaryKey: args.partNumber,
      secondaryKey: undefined,
      lastFetched: part?.lastFetched,
      priority: 1, // HIGH priority for user-triggered refreshes
    });
  },
});

/**
 * Enqueue part colors refresh - adds to outbox for background processing
 */
export const enqueueRefreshPartColors = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "partColors",
      primaryKey: args.partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      return;
    }

    // Get lastFetched from any partColor record for this part
    const partColors = await ctx.runQuery(internal.catalog.queries.getPartColorsInternal, {
      partNumber: args.partNumber,
    });

    const isMissing = partColors.length === 0;
    const lastFetched =
      partColors.length > 0 ? Math.min(...partColors.map((pc) => pc.lastFetched)) : undefined;

    // Enqueue to outbox
    const messageId = await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "partColors",
      primaryKey: args.partNumber,
      secondaryKey: undefined,
      lastFetched,
      priority: 1, // HIGH priority
    });

    // If data is missing, schedule immediate processing for better UX
    if (isMissing && messageId) {
      await ctx.scheduler.runAfter(0, internal.catalog.refreshWorker.processSingleOutboxMessage, {
        messageId,
      });
    }
  },
});

/**
 * Enqueue price guide refresh - adds to outbox for background processing
 */
export const enqueueRefreshPriceGuide = action({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    await requireActiveUser(ctx);

    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "partPrices",
      primaryKey: args.partNumber,
      secondaryKey: String(args.colorId),
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      return;
    }

    // Get lastFetched from any price record for this part+color
    const prices = await ctx.runQuery(internal.catalog.queries.getPriceGuideInternal, {
      partNumber: args.partNumber,
      colorId: args.colorId,
    });

    const isMissing = prices.length === 0;
    const lastFetched =
      prices.length > 0 ? Math.min(...prices.map((p) => p.lastFetched)) : undefined;

    // Enqueue to outbox
    const messageId = await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "partPrices",
      primaryKey: args.partNumber,
      secondaryKey: String(args.colorId),
      lastFetched,
      priority: 1, // HIGH priority
    });

    // If data is missing, schedule immediate processing for better UX
    if (isMissing && messageId) {
      await ctx.scheduler.runAfter(0, internal.catalog.refreshWorker.processSingleOutboxMessage, {
        messageId,
      });
    }
  },
});

/**
 * Fetch part color image on-demand if not already cached
 * Uses rate limiting to respect Bricklink API limits
 */
// (fetchPartColorImage removed - client uses BrickLink CDN directly)

// ============================================================================
// REBRICKABLE ID MAPPING ACTIONS
// ============================================================================

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
