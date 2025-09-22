"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { randomBytes } from "node:crypto";

export const generateRandomHex = action({
  args: {
    bytes: v.number(),
  },
  handler: async (ctx, args) => {
    return randomBytes(args.bytes).toString("hex");
  },
});

export const generateUniqueInviteCode = action({
  args: {},
  handler: async (ctx) => {
    const INVITE_CODE_BYTES = 4;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const code = randomBytes(INVITE_CODE_BYTES).toString("hex");
      const existing = await ctx.runQuery("internal:getBusinessAccountByInviteCode", {
        inviteCode: code,
      });

      if (!existing) {
        return code;
      }
    }
  },
});
