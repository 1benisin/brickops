/**
 * BrickLink Webhook Handler
 * Receives push notifications from BrickLink and enqueues them for processing
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { recordMetric } from "../lib/external/metrics";

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
  const credential = await ctx.runQuery(internal.bricklink.notifications.getCredentialByToken, {
    webhookToken,
  });

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
      internal.bricklink.notifications.upsertNotification,
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
    await ctx.scheduler.runAfter(0, internal.bricklink.notifications.processNotification, {
      notificationId,
    });

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
