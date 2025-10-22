import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getRateLimitConfig } from "./rateLimitConfig";

type Provider = "bricklink" | "brickowl";

export const takeToken = internalMutation({
  args: { bucket: v.string() },
  handler: async (ctx, { bucket }) => {
    const now = Date.now();

    const [providerRaw] = bucket.split(":", 1);
    const provider = providerRaw as Provider;
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
        createdAt: now,
      });
    } else {
      await ctx.db.patch(rate!._id, payload);
    }

    console.log(`Rate limit granted: ${bucket}, remaining: ${remaining} out of ${capacity}`);

    return { granted, resetAt, remaining } as const;
  },
});
