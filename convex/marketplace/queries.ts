import { getAuthUserId } from "@convex-dev/auth/server";
import { query, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";

type RequireOwnerReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

/**
 * Require authenticated owner user
 * Throws if user is not authenticated or not an owner
 */
async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<RequireOwnerReturn> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("User not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  if (user.role !== "owner") {
    throw new ConvexError("Access denied. Only account owners can manage marketplace credentials.");
  }

  return {
    userId,
    user,
    businessAccountId: user.businessAccountId as Id<"businessAccounts">,
  };
}

/**
 * Get credential status (non-sensitive data only)
 */
export const getCredentialStatus = query({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!credential) {
      return {
        configured: false,
        provider: args.provider,
      };
    }

    return {
      configured: true,
      provider: args.provider,
      isActive: credential.isActive,
      lastValidatedAt: credential.lastValidatedAt,
      validationStatus: credential.validationStatus,
      validationMessage: credential.validationMessage,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      // Mask credentials for display
      maskedCredentials:
        args.provider === "bricklink"
          ? {
              bricklinkConsumerKey: credential.bricklinkConsumerKey ? "****" : undefined,
              bricklinkTokenValue: credential.bricklinkTokenValue ? "****" : undefined,
            }
          : {
              brickowlApiKey: credential.brickowlApiKey ? "****" : undefined,
            },
    };
  },
});

/**
 * Get all credential statuses for a business
 */
export const getAllCredentialStatuses = query({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    return credentials.map((cred) => ({
      provider: cred.provider,
      configured: true,
      isActive: cred.isActive,
      lastValidatedAt: cred.lastValidatedAt,
      validationStatus: cred.validationStatus,
      validationMessage: cred.validationMessage,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    }));
  },
});
