import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal-only Convex queries/mutations not exposed to the public API layer.
 * Use these for server-side composition and implementation details.
 */

/**
 * Fetch a business account by invite code.
 *
 * Purpose:
 * - Supports flows that resolve an invite code to a business account record
 * - Not exposed publicly; intended for server-side usage only
 *
 * Index requirement:
 * - Relies on `businessAccounts` table index: `by_inviteCode(inviteCode)`
 */
export const getBusinessAccountByInviteCode = query({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businessAccounts")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.inviteCode))
      .first();
  },
});

/**
 * Simple sliding window rate limiter using the `rateLimitEvents` table.
 * Stores an event row and ensures the count in the last `windowMs` does not exceed `limit`.
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
