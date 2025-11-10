import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getRateLimitConfig, providerValidator } from "./rateLimitConfig";

const takeTokenArgs = v.object({
  bucket: v.string(), // e.g. "brickopsSuperAdmin" or businessAccountId
  provider: providerValidator,
});

export const takeToken = internalMutation({
  args: takeTokenArgs,
  handler: async (ctx, { provider, bucket }) => {
    const now = Date.now();

    const { capacity, windowDurationMs: windowMs } = getRateLimitConfig(provider);

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
      // new window
      granted = true;
      remaining = capacity - 1;
      resetAt = now + windowMs;
    } else if (rate!.remaining > 0) {
      // same window, token available
      granted = true;
      remaining = rate!.remaining - 1;
      resetAt = rate!.resetAt;
    } else {
      // same window, bucket empty
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
      ...(isNew ? { createdAt: now } : {}),
    };

    if (isNew) {
      await ctx.db.insert("rateLimits", {
        ...payload,
        provider,
      });
    } else {
      await ctx.db.patch(rate!._id, payload);
    }

    console.debug(`Rate limit granted: ${bucket}, remaining: ${remaining} out of ${capacity}`);

    return { granted, resetAt, remaining } as const;
  },
});
