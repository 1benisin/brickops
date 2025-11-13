import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { requireActiveUser } from "./authorization";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const { user, userId, businessAccountId } = await requireActiveUser(ctx);
    const businessAccount = await ctx.db.get(businessAccountId);

    if (!businessAccount) {
      throw new ConvexError("Business account not found");
    }

    return {
      user: {
        _id: userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        role: user.role,
        status: user.status,
        useSortLocations: user.useSortLocations,
      },
      businessAccount: {
        _id: businessAccount._id,
        name: businessAccount.name,
        inviteCode: businessAccount.inviteCode,
        ownerUserId: businessAccount.ownerUserId,
      },
    };
  },
});

/**
 * Lightweight auth state for client-side guards.
 * Never throws; returns minimal data even when the user is not yet active or linked.
 */
export const getAuthState = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      return { isAuthenticated: false as const };
    }

    const user = await ctx.db.get(authUserId);
    if (!user) {
      // Logged in at auth layer but user row missing – treat as incomplete onboarding
      return { isAuthenticated: true as const, user: null };
    }

    const businessAccount = user.businessAccountId
      ? await ctx.db.get(user.businessAccountId)
      : null;

    return {
      isAuthenticated: true as const,
      user: {
        _id: authUserId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        role: user.role,
        status: user.status,
        businessAccountId: user.businessAccountId,
      },
      businessAccount: businessAccount
        ? { _id: businessAccount._id, name: businessAccount.name }
        : null,
    };
  },
});

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);

    const members = await ctx.db
      .query("users")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    return members.map((member: Doc<"users">) => ({
      _id: member._id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      name: member.name,
      role: member.role,
      status: member.status,
      isCurrentUser: member._id === userId,
    }));
  },
});

export const getActiveUserContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    return requireActiveUser(ctx);
  },
});
