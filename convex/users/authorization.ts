import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

export type RequireUserReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

async function requireActiveUserFromDb(ctx: QueryCtx | MutationCtx): Promise<RequireUserReturn> {
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
    user,
    businessAccountId: user.businessAccountId,
  };
}

/**
 * Helper function to ensure user is authenticated, active, and linked to a business account.
 * Works across queries, mutations, and actions.
 */
export async function requireActiveUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<RequireUserReturn> {
  if ("db" in ctx) {
    return requireActiveUserFromDb(ctx);
  }

  return ctx.runQuery(internal.users.queries.getActiveUserContext, {});
}

/**
 * Ensure the authenticated user has the specified role.
 * Returns the authenticated user context when the role matches.
 */
type RoleCtx = QueryCtx | MutationCtx | ActionCtx;

export async function requireUserRole(
  ctx: RoleCtx,
  requiredRole: Doc<"users">["role"],
): Promise<RequireUserReturn> {
  const context = await requireActiveUser(ctx);

  if (context.user.role !== requiredRole) {
    throw new ConvexError(`Only users with the ${requiredRole} role can perform this action`);
  }

  return context;
}
