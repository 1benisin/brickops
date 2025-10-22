import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { randomHex } from "../lib/webcrypto";
import { ConvexError, v } from "convex/values";
import { checkAndConsumeRateLimitDirect } from "../lib/dbRateLimiter";
import { api } from "../_generated/api";
import { requireActiveUser } from "./helpers";

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

    await ctx.db.patch(userId, {
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
        await ctx.db.patch(businessAccountId, { inviteCode: code });
        return { inviteCode: code };
      }
    }
  },
});

export const createUserInvite = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("manager"), v.literal("picker"), v.literal("viewer")),
    inviteBaseUrl: v.string(), // e.g., https://app.example.com/invite
    expiresInHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireActiveUser(ctx);

    if (user.role !== "owner") {
      throw new ConvexError("Only business owners can invite users");
    }

    const email = args.email.trim().toLowerCase();
    if (!email) {
      throw new ConvexError("Email is required");
    }

    // Rate limit by business account and recipient email to mitigate abuse
    const keyByAccount = `ba:${businessAccountId}:invite_create`;
    const accountLimit = await checkAndConsumeRateLimitDirect(ctx, {
      key: keyByAccount,
      kind: "invite_create",
      limit: 10, // 10 invites per hour per business
      windowMs: 60 * 60 * 1000,
    });
    if (!accountLimit.allowed) {
      throw new ConvexError("Rate limit exceeded for invites. Please try again later.");
    }

    const keyByEmail = `email:${email}:invite_create`;
    const emailLimit = await checkAndConsumeRateLimitDirect(ctx, {
      key: keyByEmail,
      kind: "invite_create",
      limit: 3, // 3 invites per day per email
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      throw new ConvexError("Too many invites sent to this email recently. Try again later.");
    }

    const token = randomHex(16);
    const now = Date.now();
    const expiresAt = now + (args.expiresInHours ?? 72) * 60 * 60 * 1000;

    await ctx.db.insert("userInvites", {
      businessAccountId,
      email,
      token,
      role: args.role,
      expiresAt,
      createdBy: user._id,
      createdAt: now,
    });

    await ctx.db.insert("userAuditLogs", {
      businessAccountId,
      targetUserId: undefined,
      action: "invite_created",
      actorUserId: user._id,
      createdAt: now,
    });

    const inviteLink = `${args.inviteBaseUrl}?token=${token}`;
    // Offload email delivery to an action (required for fetch)
    await ctx.scheduler.runAfter(0, api.users.actions.sendInvite, {
      to: email,
      inviteLink,
      invitedRole: args.role,
    });

    return { token, expiresAt };
  },
});

export const updateUserRole = mutation({
  args: {
    targetUserId: v.id("users"),
    role: v.union(v.literal("manager"), v.literal("picker"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireActiveUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError("Only business owners can update roles");
    }

    const target = await ctx.db.get(args.targetUserId);
    if (!target || target.businessAccountId !== businessAccountId) {
      throw new ConvexError("User not found in this business account");
    }
    if (target._id === user._id) {
      throw new ConvexError("Owners cannot change their own role");
    }

    type RoleLiteral = "owner" | "manager" | "picker" | "viewer";

    const now = Date.now();
    await ctx.db.patch(target._id, { role: args.role, updatedAt: now });

    await ctx.db.insert("userAuditLogs", {
      businessAccountId,
      targetUserId: target._id,
      action: "role_updated",
      fromRole: target.role as RoleLiteral,
      toRole: args.role as RoleLiteral,
      actorUserId: user._id,
      createdAt: now,
    });
  },
});

export const removeUser = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireActiveUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError("Only business owners can remove users");
    }

    const target = await ctx.db.get(args.targetUserId);
    if (!target || target.businessAccountId !== businessAccountId) {
      throw new ConvexError("User not found in this business account");
    }
    if (target._id === user._id) {
      throw new ConvexError("Owners cannot remove themselves");
    }

    // Soft-delete approach: set status invited and remove business link to prevent access
    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: "invited",
      businessAccountId: undefined as unknown as Id<"businessAccounts">,
      updatedAt: now,
    });

    await ctx.db.insert("userAuditLogs", {
      businessAccountId,
      targetUserId: target._id,
      action: "user_removed",
      actorUserId: user._id,
      createdAt: now,
    });
  },
});

/**
 * Simple sliding window rate limiter using the `rateLimitEvents` table.
 * Internal mutation for rate limiting sensitive operations
 */
export const checkAndConsumeRateLimit = mutation({
  args: {
    key: v.string(), // unique dimension (e.g., business account id, email, token)
    kind: v.string(), // bucket name (e.g., "invite_create", "invite_redeem")
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const since = now - args.windowMs;

    // Count existing events in window for this (key, kind)
    const events = await ctx.db
      .query("rateLimitEvents")
      .withIndex("by_key_kind", (q) => q.eq("key", args.key).eq("kind", args.kind))
      .collect();

    const inWindow = events.filter((e) => e.createdAt >= since);
    if (inWindow.length >= args.limit) {
      return { allowed: false, remaining: 0 } as const;
    }

    await ctx.db.insert("rateLimitEvents", {
      key: args.key,
      kind: args.kind,
      createdAt: now,
    });

    return { allowed: true, remaining: Math.max(0, args.limit - (inWindow.length + 1)) } as const;
  },
});
