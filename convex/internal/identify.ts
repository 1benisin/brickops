import { ConvexError, v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { checkAndConsumeRateLimitDirect } from "../lib/dbRateLimiter";
import { IDENTIFY_LIMIT, IDENTIFY_WINDOW_MS, RATE_LIMIT_KIND } from "../functions/identify";

export const consumeIdentificationRate = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { allowed, remaining } = await checkAndConsumeRateLimitDirect(ctx, {
      key: `user:${args.userId}:${RATE_LIMIT_KIND}`,
      kind: RATE_LIMIT_KIND,
      limit: IDENTIFY_LIMIT,
      windowMs: IDENTIFY_WINDOW_MS,
    });

    if (!allowed) {
      throw new ConvexError("Identification rate limit exceeded. Please try again later.");
    }

    return { remaining } as const;
  },
});
