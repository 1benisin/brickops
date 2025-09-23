import { query } from "../_generated/server";
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
