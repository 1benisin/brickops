import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { checkAndConsumeRateLimitDirect } from "../lib/dbRateLimiter";
import { IDENTIFY_LIMIT, IDENTIFY_WINDOW_MS, RATE_LIMIT_KIND } from "./helpers";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

type RequireUserReturn = {
  userId: Id<"users">;
  businessAccountId: Id<"businessAccounts">;
};

async function requireActiveUser(ctx: MutationCtx): Promise<RequireUserReturn> {
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
    businessAccountId: user.businessAccountId as Id<"businessAccounts">,
  };
}

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
