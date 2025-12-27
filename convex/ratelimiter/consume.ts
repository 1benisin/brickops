/**
 * Rate Limiter - Token Consumption
 *
 * Provides database-backed rate limiting with token bucket algorithm.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getRateLimitConfig } from "./rateLimitConfig";
import { providerValidator } from "./schema";

// ============================================================================
// Mutation: Consume Token
// ============================================================================

const consumeTokenArgs = v.object({
  bucket: v.string(), // e.g. "bricklink:account:{id}" or "rebrickable:global"
  provider: providerValidator,
});

/**
 * Attempt to consume a rate limit token from a bucket.
 *
 * Returns:
 * - ok: true if token was granted, false if rate limited
 * - retryAfter: ms to wait before retrying (0 if granted)
 * - remaining: tokens remaining in current window
 * - resetAt: epoch ms when window resets
 */
export const consumeToken = internalMutation({
  args: consumeTokenArgs,
  handler: async (ctx, { provider, bucket }) => {
    const now = Date.now();
    const config = getRateLimitConfig(provider);
    const { capacity, windowDurationMs: windowMs } = config;

    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    const isNew = !rate;
    const isExpired = !!rate && now >= rate.resetAt;

    let granted: boolean;
    let remaining: number;
    let resetAt: number;

    if (isNew || isExpired) {
      // New window - reset everything
      granted = true;
      remaining = capacity - 1;
      resetAt = now + windowMs;
    } else if (rate!.remaining > 0) {
      // Same window, token available
      granted = true;
      remaining = rate!.remaining - 1;
      resetAt = rate!.resetAt;
    } else {
      // Same window, bucket empty
      granted = false;
      remaining = 0;
      resetAt = rate!.resetAt;
    }

    const payload = {
      bucket,
      capacity,
      windowMs,
      remaining,
      resetAt,
      updatedAt: now,
    };

    if (isNew) {
      await ctx.db.insert("rateLimits", {
        ...payload,
        provider,
      });
    } else {
      await ctx.db.patch(rate!._id, payload);
    }

    if (granted) {
      console.debug(`Rate limit granted: ${bucket}, remaining: ${remaining}/${capacity}`);
    } else {
      console.debug(`Rate limit denied: ${bucket}, retry after ${resetAt - now}ms`);
    }

    return {
      ok: granted,
      retryAfter: granted ? 0 : Math.max(0, resetAt - now),
      remaining,
      resetAt,
    } as const;
  },
});
