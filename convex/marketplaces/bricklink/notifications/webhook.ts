import { ConvexError } from "convex/values";
import { internal } from "../../../_generated/api";
import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { recordMetric } from "../../../lib/external/metrics";
import { requireUserRole } from "../../../users/authorization";
import { withBlClient, type BLApiResponse } from "../transport";
import { buildNotificationDedupeKey, isNotificationReplay } from "./utilities";
import { blNotificationSchema, type BLNotification } from "./schema";

export const WEBHOOK_PAYLOAD_MAX_BYTES = 1024;

export async function handleWebhookRequest(ctx: ActionCtx, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter((p) => p);
  const tokenIndex = pathParts.indexOf("webhook");

  let webhookToken: string | null = null;

  if (tokenIndex !== -1 && tokenIndex < pathParts.length - 1) {
    webhookToken = pathParts[tokenIndex + 1];
  } else {
    webhookToken = url.searchParams.get("token");
  }

  if (!webhookToken) {
    return new Response(
      JSON.stringify({
        error: "Invalid webhook URL. Expected /api/bricklink/webhook/{token} or ?token={token}",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const credential = await ctx.runQuery(
    internal.marketplaces.bricklink.notifications.actions.getCredentialByToken,
    {
      webhookToken,
    },
  );

  if (!credential) {
    recordMetric("external.bricklink.webhook.invalid_token", {
      tokenPrefix: webhookToken.substring(0, 8),
    });

    return new Response(
      JSON.stringify({
        error: "Invalid webhook token",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed. Use POST.",
      }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let notificationData: BLNotification;

  try {
    const body = await request.json();
    notificationData = blNotificationSchema.parse(body);
  } catch (error) {
    recordMetric("external.bricklink.webhook.invalid_payload", {
      webhookToken: webhookToken.substring(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        error: "Invalid notification payload",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const bodySize = JSON.stringify(notificationData).length;
  if (bodySize > WEBHOOK_PAYLOAD_MAX_BYTES) {
    recordMetric("external.bricklink.webhook.payload_too_large", {
      businessAccountId: credential.businessAccountId,
      size: bodySize,
    });

    return new Response(
      JSON.stringify({
        error: "Payload too large",
      }),
      {
        status: 413,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const dedupeKey = buildNotificationDedupeKey(
    credential.businessAccountId,
    notificationData.event_type,
    notificationData.resource_id,
    notificationData.timestamp,
  );

  if (isNotificationReplay(notificationData.timestamp)) {
    recordMetric("external.bricklink.webhook.replay_detected", {
      businessAccountId: credential.businessAccountId,
      ageMs: Date.now() - new Date(notificationData.timestamp).getTime(),
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const notificationId = await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.actions.upsertNotification,
      {
        businessAccountId: credential.businessAccountId,
        eventType: notificationData.event_type,
        resourceId: notificationData.resource_id,
        timestamp: notificationData.timestamp,
        dedupeKey,
      },
    );

    recordMetric("external.bricklink.webhook.received", {
      businessAccountId: credential.businessAccountId,
      eventType: notificationData.event_type,
      resourceId: notificationData.resource_id,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.marketplaces.bricklink.notifications.actions.processNotification,
      {
        notificationId,
      },
    );

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    recordMetric("external.bricklink.webhook.error", {
      businessAccountId: credential.businessAccountId,
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        received: true,
        note: "Notification queued for retry",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function registerWebhook(
  ctx: ActionCtx,
  overrideBaseUrl?: string,
): Promise<{ success: true; status: "registered"; endpoint: string }> {
  const { businessAccountId } = await requireUserRole(ctx, "owner");

  const credential = await ctx.runQuery(
    internal.marketplaces.shared.credentials.getCredentialMetadata,
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

  const baseUrl = normalizeBaseUrl(overrideBaseUrl);
  const callbackUrl = `${baseUrl}/api/bricklink/webhook/${credential.webhookToken}`;

  await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
    businessAccountId,
    provider: "bricklink",
    status: "registering",
    lastCheckedAt: Date.now(),
  });

  try {
    await withBlClient(ctx, {
      businessAccountId,
      fn: async (client) => {
        await client.request<BLApiResponse<null>>({
          path: "/notifications/register",
          method: "POST",
          body: { url: callbackUrl },
        });
      },
    });

    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
      status: "registered",
      endpoint: callbackUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "error",
      endpoint: callbackUrl,
      error: message,
    });

    throw new ConvexError(`Failed to register BrickLink webhook: ${message}`);
  }
}

export async function unregisterWebhook(
  ctx: ActionCtx,
): Promise<{ success: true; status: "disabled" }> {
  const { businessAccountId } = await requireUserRole(ctx, "owner");

  const credential = await ctx.runQuery(
    internal.marketplaces.shared.credentials.getCredentialMetadata,
    {
      businessAccountId,
      provider: "bricklink",
    },
  );

  if (!credential) {
    throw new ConvexError("BrickLink credentials not configured");
  }

  await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
    businessAccountId,
    provider: "bricklink",
    status: "registering",
    lastCheckedAt: Date.now(),
  });

  try {
    await withBlClient(ctx, {
      businessAccountId,
      fn: async (client) => {
        await client.request<BLApiResponse<null>>({
          path: "/notifications/register",
          method: "DELETE",
        });
      },
    });

    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "disabled",
      clearEndpoint: true,
      clearError: true,
      lastCheckedAt: Date.now(),
    });

    return {
      success: true,
      status: "disabled",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "error",
      error: message,
    });

    throw new ConvexError(`Failed to unregister BrickLink webhook: ${message}`);
  }
}

export async function ensureWebhooks(ctx: ActionCtx, force?: boolean): Promise<void> {
  const credentials = await ctx.runQuery(
    internal.marketplaces.bricklink.notifications.actions.getAllActiveCredentials,
    {},
  );

  const baseUrl = normalizeBaseUrl(null);
  const now = Date.now();
  const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

  for (const credential of credentials) {
    if (!credential.webhookToken) {
      continue;
    }

    const callbackUrl = `${baseUrl}/api/bricklink/webhook/${credential.webhookToken}`;

    const shouldRefresh =
      force ||
      credential.webhookEndpoint !== callbackUrl ||
      credential.webhookStatus !== "registered" ||
      !credential.webhookLastCheckedAt ||
      now - credential.webhookLastCheckedAt > STALE_THRESHOLD_MS;

    if (!shouldRefresh) {
      continue;
    }

    try {
      await withBlClient(ctx, {
        businessAccountId: credential.businessAccountId as Id<"businessAccounts">,
        fn: async (client) => {
          await client.request<BLApiResponse<null>>({
            path: "/notifications/register",
            method: "POST",
            body: { url: callbackUrl },
          });
        },
      });

      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
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
      await ctx.runMutation(internal.marketplaces.shared.webhooks.updateWebhookStatus, {
        businessAccountId: credential.businessAccountId,
        provider: "bricklink",
        status: "error",
        endpoint: callbackUrl,
        error: message,
      });
    }
  }
}

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
