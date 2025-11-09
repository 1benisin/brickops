import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction } from "../../_generated/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { createBrickOwlStoreClient } from "../shared/helpers";

const DEFAULT_VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

function resolveBrickOwlTarget(target?: string | null): string {
  const candidate = target ?? process.env.BRICKOWL_WEBHOOK_TARGET;
  if (!candidate || candidate.trim().length === 0) {
    throw new ConvexError(
      "BrickOwl webhook target not configured. Provide target or set BRICKOWL_WEBHOOK_TARGET.",
    );
  }
  return candidate.trim();
}

export const registerWebhook = action({
  args: {
    target: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);
    const target = resolveBrickOwlTarget(args.target);

    const credential = await ctx.runQuery(
      internal.marketplaces.shared.queries.getCredentialMetadata,
      {
        businessAccountId,
        provider: "brickowl",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickOwl credentials not configured");
    }

    const client = await createBrickOwlStoreClient(ctx, businessAccountId);

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "brickowl",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await client.setOrderNotifyTarget(target);

      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "brickowl",
        status: "registered",
        endpoint: target,
        registeredAt: Date.now(),
        lastCheckedAt: Date.now(),
        metadata: {
          target,
        },
        clearError: true,
      });

      return {
        success: true,
        status: "registered" as const,
        target,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "brickowl",
        status: "error",
        endpoint: target,
        error: message,
      });
      throw new ConvexError(`Failed to register BrickOwl notifications: ${message}`);
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
        provider: "brickowl",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickOwl credentials not configured");
    }

    const client = await createBrickOwlStoreClient(ctx, businessAccountId);

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "brickowl",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await client.setOrderNotifyTarget(null);

      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "brickowl",
        status: "disabled",
        clearEndpoint: true,
        clearError: true,
        lastCheckedAt: Date.now(),
        metadata: null,
      });

      return {
        success: true,
        status: "disabled" as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
        businessAccountId,
        provider: "brickowl",
        status: "error",
        error: message,
      });
      throw new ConvexError(`Failed to unregister BrickOwl notifications: ${message}`);
    }
  },
});

export const ensureWebhooks = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const activeCredentials = await ctx.runQuery(
      internal.marketplaces.brickowl.queries.getAllActiveCredentials,
      {},
    );

    const now = Date.now();

    for (const credential of activeCredentials) {
      const metadata = (credential.webhookMetadata as { target?: string } | undefined) ?? {};
      const target =
        credential.webhookEndpoint ??
        metadata.target ??
        process.env.BRICKOWL_WEBHOOK_TARGET;

      if (!target) {
        continue;
      }

      const shouldRefresh =
        args.force ||
        credential.webhookStatus !== "registered" ||
        !credential.webhookLastCheckedAt ||
        now - credential.webhookLastCheckedAt > DEFAULT_VERIFY_INTERVAL_MS;

      if (!shouldRefresh) {
        continue;
      }

      try {
        const client = await createBrickOwlStoreClient(ctx, credential.businessAccountId);
        await client.setOrderNotifyTarget(target);

        await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
          businessAccountId: credential.businessAccountId,
          provider: "brickowl",
          status: "registered",
          endpoint: target,
          registeredAt: credential.webhookRegisteredAt ?? now,
          lastCheckedAt: now,
          metadata: {
            target,
          },
          clearError: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
          businessAccountId: credential.businessAccountId,
          provider: "brickowl",
          status: "error",
          endpoint: target,
          error: message,
        });
      }
    }
  },
});

