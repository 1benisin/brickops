import { getAuthUserId } from "@convex-dev/auth/server";
import { query, MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
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
      webhookToken: credential.webhookToken, // Include webhook token for BrickLink
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
 * Get marketplace sync configuration for inventory display
 * Returns whether each marketplace should show sync status columns
 * Available to all authenticated users (not just owners)
 */
export const getMarketplaceSyncConfig = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    // Get all marketplace credentials for this business account
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Determine if each marketplace should show sync column
    const bricklinkCred = credentials.find((c) => c.provider === "bricklink");
    const brickowlCred = credentials.find((c) => c.provider === "brickowl");

    return {
      showBricklinkSync:
        bricklinkCred !== undefined &&
        bricklinkCred.isActive &&
        (bricklinkCred.syncEnabled ?? true), // Default to true for backward compatibility
      showBrickowlSync:
        brickowlCred !== undefined && brickowlCred.isActive && (brickowlCred.syncEnabled ?? true), // Default to true for backward compatibility
    };
  },
});

/**
 * Get sync settings for all configured providers
 */
export const getSyncSettings = query({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    return credentials.map((cred) => ({
      provider: cred.provider,
      syncEnabled: cred.syncEnabled ?? true, // Default to true
      isActive: cred.isActive,
    }));
  },
});
