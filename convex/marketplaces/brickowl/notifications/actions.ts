import { action, internalAction } from "../../../_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../../../_generated/api";
import { recordMetric } from "../../../lib/external/metrics";
import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { requireUserRole } from "../../../users/authorization";
import { withBoClient } from "../client";
import { normalizeBoStoreError } from "../errors";
import { generateCorrelationId } from "../ids";
import { boOrderNotifyPayloadSchema } from "./schema";

const DEFAULT_VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

type NotificationMetricStatus = "success" | "failure";

function recordNotificationMetric(params: {
  businessAccountId: Id<"businessAccounts">;
  correlationId: string;
  endpoint: string;
  status: NotificationMetricStatus;
  errorCode?: string;
}) {
  recordMetric("external.brickowl.notifications", {
    businessAccountId: params.businessAccountId,
    correlationId: params.correlationId,
    endpoint: params.endpoint,
    status: params.status,
    ...(params.errorCode ? { errorCode: params.errorCode } : {}),
  });
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

export async function setOrderNotifyTarget(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; target: string | null },
): Promise<void> {
  const { businessAccountId, target } = params;
  const correlationId = generateCorrelationId();
  await withBoClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const payload = boOrderNotifyPayloadSchema.parse({
        ip: target ?? "",
      });

      try {
        await client.requestWithRetry({
          path: "/order/notify",
          method: "POST",
          body: payload,
          correlationId,
          idempotencyKey: target ? `notify-${target}` : "notify-clear",
          isIdempotent: true,
        });

        recordNotificationMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/notify",
          status: "success",
        });
      } catch (error) {
        const normalized = normalizeBoStoreError(error);
        recordNotificationMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/notify",
          status: "failure",
          errorCode: normalized.code,
        });
        throw error;
      }
    },
  });
}

export const registerWebhook = action({
  args: {
    target: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUserRole(ctx, "owner");
    const target = resolveBrickOwlTarget(args.target);

    const credential = await ctx.runQuery(
      internal.marketplaces.shared.credentials.getCredentialMetadata,
      {
        businessAccountId,
        provider: "brickowl",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickOwl credentials not configured");
    }

    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
      businessAccountId,
      provider: "brickowl",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await setOrderNotifyTarget(ctx, { businessAccountId, target });

      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    const credential = await ctx.runQuery(
      internal.marketplaces.shared.credentials.getCredentialMetadata,
      {
        businessAccountId,
        provider: "brickowl",
      },
    );

    if (!credential) {
      throw new ConvexError("BrickOwl credentials not configured");
    }

    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
      businessAccountId,
      provider: "brickowl",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await setOrderNotifyTarget(ctx, { businessAccountId, target: null });

      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
        credential.webhookEndpoint ?? metadata.target ?? process.env.BRICKOWL_WEBHOOK_TARGET;

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
        await setOrderNotifyTarget(ctx, {
          businessAccountId: credential.businessAccountId,
          target,
        });

        await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
        await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
