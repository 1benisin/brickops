"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";

import { sendInviteEmail } from "../lib/external/email";

export const sendInvite = action({
  args: {
    to: v.string(),
    inviteLink: v.string(),
    invitedRole: v.union(v.literal("manager"), v.literal("picker"), v.literal("viewer")),
  },
  handler: async (_ctx, args) => {
    await sendInviteEmail({
      to: args.to,
      inviteLink: args.inviteLink,
      invitedRole: args.invitedRole,
    });
  },
});
