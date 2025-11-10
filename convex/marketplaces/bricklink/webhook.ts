/**
 * BrickLink Webhook Handler
 * Receives push notifications from BrickLink and enqueues them for processing
 */

import { action, httpAction, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { ConvexError, v } from "convex/values";
import { recordMetric } from "../../lib/external/metrics";
import { withBricklinkClient, type BricklinkApiResponse } from "./storeClient";
import { requireUserRole } from "../../users/helpers";

/**
 * HTTP endpoint for BrickLink push notifications
 * Route: POST /api/bricklink/webhook/{webhookToken}
 *
 * BrickLink sends notifications in format:
 * {
 *   "event_type": "Order" | "Message" | "Feedback",
 *   "resource_id": 12345,
 *   "timestamp": "2013-12-17T08:20:02.177Z"
 * }
 */
export const bricklinkWebhook = httpAction(async (ctx, request) => {
  // Extract webhook token from URL path or query parameter
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter((p) => p);
  const tokenIndex = pathParts.indexOf("webhook");

  let webhookToken: string | null = null;

  // Try to get token from path: /api/bricklink/webhook/{token}
  if (tokenIndex !== -1 && tokenIndex < pathParts.length - 1) {
    webhookToken = pathParts[tokenIndex + 1];
  } else {
    // Fallback: try query parameter
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

  // Validate token and get business account
  const credential = await ctx.runQuery(
    internal.marketplaces.bricklink.notifications.getCredentialByToken,
    {
      webhookToken,
    },
  );

  if (!credential) {
    recordMetric("external.bricklink.webhook.invalid_token", {
      tokenPrefix: webhookToken.substring(0, 8),
    });

    // Return 200 to prevent BrickLink from retrying invalid tokens
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

  // Validate request method
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

  // Parse and validate request body
  let notificationData: {
    event_type: "Order" | "Message" | "Feedback";
    resource_id: number;
    timestamp: string;
  };

  try {
    const body = await request.json();
    notificationData = body as typeof notificationData;

    // Validate required fields
    if (
      !notificationData.event_type ||
      !["Order", "Message", "Feedback"].includes(notificationData.event_type) ||
      typeof notificationData.resource_id !== "number" ||
      !notificationData.timestamp
    ) {
      throw new Error("Invalid notification payload");
    }
  } catch (error) {
    // Note: credential might not be defined yet if this is a parsing error before validation
    recordMetric("external.bricklink.webhook.invalid_payload", {
      webhookToken: webhookToken ? webhookToken.substring(0, 8) : "unknown",
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

  // Validate payload size (prevent abuse)
  const bodySize = JSON.stringify(notificationData).length;
  if (bodySize > 1024) {
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

  // Create idempotency key
  const dedupeKey = `${credential.businessAccountId}:${notificationData.event_type}:${notificationData.resource_id}:${notificationData.timestamp}`;

  // Check for replay (timestamp within last hour)
  const notificationTime = new Date(notificationData.timestamp).getTime();
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  if (notificationTime < oneHourAgo) {
    // Notification is too old, likely a replay
    recordMetric("external.bricklink.webhook.replay_detected", {
      businessAccountId: credential.businessAccountId,
      ageMs: now - notificationTime,
    });

    // Still return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Upsert notification (idempotent via dedupeKey)
    const notificationId = await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.upsertNotification,
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

    // Enqueue processing (async, fire-and-forget)
    await ctx.scheduler.runAfter(
      0,
      internal.marketplaces.bricklink.notifications.processNotification,
      {
        notificationId,
      },
    );

    // Return success immediately (don't wait for processing)
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    recordMetric("external.bricklink.webhook.error", {
      businessAccountId: credential.businessAccountId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return 200 even on error to prevent BrickLink retries
    // We'll retry via polling as safety net
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
});

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

const registerWebhookAction: ReturnType<typeof action> = action({
  args: {
    overrideBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUserRole(ctx, "owner");

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

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await withBricklinkClient(ctx, {
        businessAccountId,
        fn: async (client) => {
          if (callbackUrl) {
            await client.request<BricklinkApiResponse<null>>({
              path: "/notifications/register",
              method: "POST",
              body: { url: callbackUrl },
            });
          } else {
            await client.request<BricklinkApiResponse<null>>({
              path: "/notifications/register",
              method: "DELETE",
            });
          }
        },
      });

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

export const registerWebhook = registerWebhookAction;

const unregisterWebhookAction: ReturnType<typeof action> = action({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireUserRole(ctx, "owner");

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

    await ctx.runMutation(internal.marketplaces.shared.mutations.updateWebhookStatus, {
      businessAccountId,
      provider: "bricklink",
      status: "registering",
      lastCheckedAt: Date.now(),
    });

    try {
      await withBricklinkClient(ctx, {
        businessAccountId,
        fn: async (client) => {
          await client.request<BricklinkApiResponse<null>>({
            path: "/notifications/register",
            method: "DELETE",
          });
        },
      });

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

export const unregisterWebhook = unregisterWebhookAction;

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
        await withBricklinkClient(ctx, {
          businessAccountId: credential.businessAccountId,
          fn: async (client) => {
            await client.request<BricklinkApiResponse<null>>({
              path: "/notifications/register",
              method: "POST",
              body: { url: callbackUrl },
            });
          },
        });

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
