import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "../../_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { createBricklinkStoreClient } from "../shared/helpers";

function normalizeBaseUrl(rawUrl?: string | null): string {
  const candidate =
    rawUrl ??
    process.env.CONVEX_SITE_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site");

  if (!candidate) {
    throw new ConvexError(
      "CONVEX_SITE_URL environment variable is not configured. Provide overrideBaseUrl when invoking this action.",
    );
  }

  return candidate.replace(/\/functions$/, "").replace(/\/+$/, "");
}

async function requireOwner(ctx: Parameters<typeof registerWebhook.handler>[0]) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const currentUser = await ctx.runQuery(api.users.queries.getCurrentUser, {});
  if (currentUser.role !== "owner") {
    throw new ConvexError("Only account owners can manage webhook configuration");
  }

  return {
    userId,
    businessAccountId: currentUser.businessAccount._id,
  };
}

export const registerWebhook = action({
  args: {
    overrideBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credential = await ctx.runQuery(
      internal.marketplaces.shared.queries.getCredentialMetadata,
      {
        businessAccountId,
        provider: "bricklink",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickLink credentials not configured");
    }

    if (!credential.webhookToken) {
      throw new ConvexError("Webhook token not generated. Save BrickLink credentials first.");
    }

    const baseUrl = normalizeBaseUrl(args.overrideBaseUrl);
    const callbackUrl = `${baseUrl}/api/bricklink/webhook/${credential.webhookToken}`;

    const client = await createBricklinkStoreClient(ctx, businessAccountId);

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await client.setNotificationCallback(callbackUrl);

      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "bricklink",
        status: "registered",
        endpoint: callbackUrl,
        registeredAt: Date.now(),
        lastCheckedAt: Date.now(),
        clearError: true,
      });

      return {
        success: true,
        status: "registered" as const,
        endpoint: callbackUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "bricklink",
        status: "error",
        endpoint: callbackUrl,
        error: message,
      });

      throw new ConvexError(`Failed to register BrickLink webhook: ${message}`);
    }
  },
});

export const unregisterWebhook = action({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credential = await ctx.runQuery(
      internal.marketplaces.shared.queries.getCredentialMetadata,
      {
        businessAccountId,
        provider: "bricklink",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickLink credentials not configured");
    }

    const client = await createBricklinkStoreClient(ctx, businessAccountId);

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await client.setNotificationCallback(null);

      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "bricklink",
        status: "disabled",
        clearEndpoint: true,
        clearError: true,
        lastCheckedAt: Date.now(),
      });

      return {
        success: true,
        status: "disabled" as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "bricklink",
        status: "error",
        error: message,
      });

      throw new ConvexError(`Failed to unregister BrickLink webhook: ${message}`);
    }
  },
});

export const ensureWebhooks = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const credentials = await ctx.runQuery(
      internal.marketplaces.bricklink.notifications.getAllActiveCredentials,
      {},
    );

    const baseUrl = normalizeBaseUrl(null);
    const now = Date.now();
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

    for (const credential of credentials) {
      if (!credential.webhookToken) {
        continue;
      }

      const callbackUrl = `${baseUrl}/api/bricklink/webhook/${credential.webhookToken}`;

      const shouldRefresh =
        args.force ||
        credential.webhookEndpoint !== callbackUrl ||
        credential.webhookStatus !== "registered" ||
        !credential.webhookLastCheckedAt ||
        now - credential.webhookLastCheckedAt > STALE_THRESHOLD_MS;

      if (!shouldRefresh) {
        continue;
      }

      try {
        const client = await createBricklinkStoreClient(ctx, credential.businessAccountId);
        await client.setNotificationCallback(callbackUrl);

        await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
          businessAccountId: credential.businessAccountId,
          provider: "bricklink",
          status: "registered",
          endpoint: callbackUrl,
          registeredAt: credential.webhookRegisteredAt ?? now,
          lastCheckedAt: now,
          clearError: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
          businessAccountId: credential.businessAccountId,
          provider: "bricklink",
          status: "error",
          endpoint: callbackUrl,
          error: message,
        });
      }
    }
  },
});


