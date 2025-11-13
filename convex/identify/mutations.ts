import { ConvexError, v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { checkAndConsumeRateLimitDirect } from "../lib/dbRateLimiter";
import { IDENTIFY_LIMIT, IDENTIFY_WINDOW_MS, RATE_LIMIT_KIND } from "./helpers";
import { requireActiveUser } from "../users/authorization";

// ============================================================================
// PUBLIC MUTATIONS
// ============================================================================

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

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
