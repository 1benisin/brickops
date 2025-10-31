import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
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
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

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
