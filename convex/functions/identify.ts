import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import { mutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const IDENTIFY_WINDOW_MS = 60 * 60 * 1000; // one hour
export const IDENTIFY_LIMIT = 100;
export const RATE_LIMIT_KIND = "identify_part";

type RequireUserReturn = {
  userId: Id<"users">;
  businessAccountId: Id<"businessAccounts">;
};

export async function requireActiveUser(ctx: MutationCtx): Promise<RequireUserReturn> {
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

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireActiveUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});
