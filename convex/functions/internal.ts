import { query } from "../_generated/server";
import { v } from "convex/values";

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
