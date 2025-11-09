import { internalQuery } from "../../_generated/server";

export const getAllActiveCredentials = internalQuery({
  args: {},
  handler: async (ctx) => {
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_provider_active", (q) => q.eq("provider", "brickowl").eq("isActive", true))
      .collect();

    return credentials.map((cred) => ({
      businessAccountId: cred.businessAccountId,
      webhookEndpoint: cred.webhookEndpoint,
      webhookStatus: cred.webhookStatus,
      webhookRegisteredAt: cred.webhookRegisteredAt,
      webhookLastCheckedAt: cred.webhookLastCheckedAt,
      webhookMetadata: cred.webhookMetadata,
    }));
  },
});


