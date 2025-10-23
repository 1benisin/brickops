import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * Helper to get current timestamp
 */
export const now = () => Date.now();

/**
 * Require authenticated and active user with business account
 * Helper function - not a Convex function
 * Returns user with guaranteed businessAccountId
 */
export async function requireUser(
  ctx: Ctx,
): Promise<{ userId: Id<"users">; user: Doc<"users">; businessAccountId: Id<"businessAccounts"> }> {
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

  return { userId, user, businessAccountId: user.businessAccountId };
}

/**
 * Assert that user belongs to the specified business account
 * Helper function - not a Convex function
 */
export function assertBusinessMembership(user: Doc<"users">, businessAccountId: string) {
  if (user.businessAccountId !== businessAccountId) {
    throw new ConvexError("User cannot modify another business account");
  }
}

/**
 * Require user has owner role
 * Helper function - not a Convex function
 */
export function requireOwnerRole(user: Doc<"users">) {
  if (user.role !== "owner") {
    throw new ConvexError("Only business account owners can manage inventory");
  }
}
