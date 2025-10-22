import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { catalogClient } from "../bricklink/catalogClient";

// ============================================================================
// REFRESH ACTIONS (for frontend hooks)
// ============================================================================

/**
 * Refresh part data - directly fetches from Bricklink and updates database
 * Used by reactive hooks to trigger immediate data updates
 * Protected by lock to prevent concurrent refreshes
 */
export const refreshPart = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    // Try to acquire lock
    const lockAcquired = await ctx.runMutation(internal.catalog.mutations.markPartRefreshing, {
      partNumber: args.partNumber,
    });

    if (!lockAcquired) {
      // Already refreshing, skip silently
      return;
    }

    try {
      const token = await ctx.runMutation(internal.ratelimit.mutations.takeToken, {
        bucket: "bricklink:global",
      });
      // in case of rate limit exceeded, throw an error
      if (!token.granted) {
        const retryAfterMs = Math.max(0, token.resetAt - Date.now());
        throw new ConvexError({ code: "RATE_LIMIT_EXCEEDED", retryAfterMs });
      }
      // Fetch fresh data from Bricklink
      const partData = await catalogClient.getRefreshedPart(args.partNumber);

      // Upsert into database
      await ctx.runMutation(internal.catalog.mutations.upsertPart, { data: partData });
    } finally {
      // Always release lock
      await ctx.runMutation(internal.catalog.mutations.clearPartRefreshing, {
        partNumber: args.partNumber,
      });
    }
  },
});

/**
 * Refresh part colors data - directly fetches from Bricklink and updates database
 * Protected by lock to prevent concurrent refreshes
 */
export const refreshPartColors = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("🔄 refreshPartColors called for:", args.partNumber);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    // Try to acquire lock
    const lockAcquired = await ctx.runMutation(
      internal.catalog.mutations.markPartColorsRefreshing,
      { partNumber: args.partNumber },
    );

    if (!lockAcquired) {
      // Already refreshing, skip silently
      console.log("⏭️  refreshPartColors skipped (already refreshing):", args.partNumber);
      return;
    }

    try {
      const token = await ctx.runMutation(internal.ratelimit.mutations.takeToken, {
        bucket: "bricklink:global",
      });
      if (!token.granted) {
        const retryAfterMs = Math.max(0, token.resetAt - Date.now());
        throw new ConvexError({ code: "RATE_LIMIT_EXCEEDED", retryAfterMs });
      }
      const partColorsData = await catalogClient.getRefreshedPartColors(args.partNumber);

      await ctx.runMutation(internal.catalog.mutations.upsertPartColors, {
        data: partColorsData,
      });
    } finally {
      // Always release lock
      await ctx.runMutation(internal.catalog.mutations.clearPartColorsRefreshing, {
        partNumber: args.partNumber,
      });
    }
  },
});

/**
 * Refresh price guide data - directly fetches from Bricklink and updates database
 * Protected by lock to prevent concurrent refreshes
 */
export const refreshPriceGuide = action({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    // Try to acquire lock
    const lockAcquired = await ctx.runMutation(
      internal.catalog.mutations.markPriceGuideRefreshing,
      { partNumber: args.partNumber, colorId: args.colorId },
    );

    if (!lockAcquired) {
      // Already refreshing, skip silently
      return;
    }

    try {
      const token = await ctx.runMutation(internal.ratelimit.mutations.takeToken, {
        bucket: "bricklink:global",
      });
      if (!token.granted) {
        const retryAfterMs = Math.max(0, token.resetAt - Date.now());
        throw new ConvexError({ code: "RATE_LIMIT_EXCEEDED", retryAfterMs });
      }

      // Fetch all 4 price guides from Bricklink
      const priceGuides = await catalogClient.getRefreshedPriceGuide(args.partNumber, args.colorId);

      // Convert to array format for upsert
      const prices = [
        priceGuides.newStock,
        priceGuides.newSold,
        priceGuides.usedStock,
        priceGuides.usedSold,
      ];

      await ctx.runMutation(internal.catalog.mutations.upsertPriceGuide, {
        prices,
      });
    } finally {
      // Always release lock
      await ctx.runMutation(internal.catalog.mutations.clearPriceGuideRefreshing, {
        partNumber: args.partNumber,
        colorId: args.colorId,
      });
    }
  },
});
