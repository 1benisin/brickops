import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "../_generated/server";
import { randomHex } from "../lib/webcrypto";
import { ConvexError, v } from "convex/values";

type RequireUserReturn = {
  userId: string;
  user: any;
  businessAccountId: string;
};

async function requireActiveUser(ctx: any): Promise<RequireUserReturn> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId as any);
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

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const { user, userId, businessAccountId } = await requireActiveUser(ctx);
    const businessAccount = await ctx.db.get(businessAccountId as any);

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
      },
      businessAccount: {
        _id: businessAccount._id,
        name: (businessAccount as any).name,
        inviteCode: (businessAccount as any).inviteCode,
        ownerUserId: (businessAccount as any).ownerUserId,
      },
    };
  },
});

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const { userId, businessAccountId } = await requireActiveUser(ctx);

    const members = await ctx.db
      .query("users")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId as any))
      .collect();

    return members.map((member: any) => ({
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

export const updateProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireActiveUser(ctx);
    const normalizedFirst = args.firstName.trim();
    const normalizedLast = args.lastName.trim();

    if (!normalizedFirst || !normalizedLast) {
      throw new ConvexError("First and last name are required");
    }

    await ctx.db.patch(userId as any, {
      firstName: normalizedFirst,
      lastName: normalizedLast,
      name: `${normalizedFirst} ${normalizedLast}`.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const regenerateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, businessAccountId } = await requireActiveUser(ctx);

    if (user.role !== "owner") {
      throw new ConvexError("Only business owners can reset the invite code");
    }

    const INVITE_CODE_BYTES = 4;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const code = randomHex(INVITE_CODE_BYTES);
      const existing = await ctx.db
        .query("businessAccounts")
        .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
        .first();
      if (!existing) {
        await ctx.db.patch(businessAccountId as any, { inviteCode: code });
        return { inviteCode: code };
      }
    }
  },
});
