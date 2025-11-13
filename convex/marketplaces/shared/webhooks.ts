// Internal mutation helpers for keeping webhook status fields up to date.
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { getCredentialDoc } from "./getCredentialDoc";

export const updateWebhookStatus = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    status: v.union(
      v.literal("unconfigured"),
      v.literal("registering"),
      v.literal("registered"),
      v.literal("disabled"),
      v.literal("error"),
    ),
    endpoint: v.optional(v.string()),
    clearEndpoint: v.optional(v.boolean()),
    registeredAt: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    clearError: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Look up the credential document tied to this business account.
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential) {
      return;
    }

    // Build a patch containing all of the optional webhook fields we want to update.
    const patch: Record<string, unknown> = {
      webhookStatus: args.status,
      updatedAt: Date.now(),
    };

    if (args.endpoint !== undefined) {
      // Replace the stored endpoint with the new URL.
      patch.webhookEndpoint = args.endpoint;
    } else if (args.clearEndpoint) {
      // Caller asked us to clear the endpoint fields entirely.
      patch.webhookEndpoint = undefined;
    }

    if (args.registeredAt !== undefined) {
      patch.webhookRegisteredAt = args.registeredAt;
    } else if (args.clearEndpoint) {
      patch.webhookRegisteredAt = undefined;
    }

    if (args.lastCheckedAt !== undefined) {
      patch.webhookLastCheckedAt = args.lastCheckedAt;
    } else {
      // Default to "right now" if the caller does not supply a timestamp.
      patch.webhookLastCheckedAt = Date.now();
    }

    if (args.metadata !== undefined) {
      patch.webhookMetadata = args.metadata;
    }

    if (args.error !== undefined) {
      patch.webhookLastError = args.error;
    } else if (args.clearError) {
      // Clear out any stale error state.
      patch.webhookLastError = undefined;
    }

    await ctx.db.patch(credential._id, patch);
  },
});
