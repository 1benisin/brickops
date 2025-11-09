/**
 * BrickLink Notifications Processing
 * Handles notification ingestion and processing (both webhook and polling)
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { createBricklinkStoreClient } from "../shared/helpers";
import type { BricklinkOrderResponse, BricklinkOrderItemResponse } from "./storeClient";

const MAX_PROCESSING_ATTEMPTS = 5;
const RETRY_DELAY_MS = 60000; // 1 minute

/**
 * Get credential by webhook token (internal query)
 */
export const getCredentialByToken = internalQuery({
  args: {
    webhookToken: v.string(),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_webhookToken", (q) => q.eq("webhookToken", args.webhookToken))
      .first();

    if (!credential || !credential.isActive || credential.provider !== "bricklink") {
      return null;
    }

    return {
      businessAccountId: credential.businessAccountId,
    };
  },
});

/**
 * Upsert notification (idempotent via dedupeKey)
 */
export const upsertNotification = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    eventType: v.union(v.literal("Order"), v.literal("Message"), v.literal("Feedback")),
    resourceId: v.number(),
    timestamp: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if notification already exists
    const existing = await ctx.db
      .query("bricklinkNotifications")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .first();

    const now = Date.now();
    const occurredAt = new Date(args.timestamp).getTime();

    if (existing) {
      // Update existing notification if it's pending (might be a retry)
      if (existing.status === "pending" || existing.status === "failed") {
        await ctx.db.patch(existing._id, {
          attempts: 0, // Reset attempts for new processing attempt
          lastError: undefined,
          updatedAt: now,
        });
        return existing._id;
      }
      // Already processed, return existing ID
      return existing._id;
    }

    // Create new notification
    const notificationId = await ctx.db.insert("bricklinkNotifications", {
      businessAccountId: args.businessAccountId,
      eventType: args.eventType,
      resourceId: args.resourceId,
      timestamp: args.timestamp,
      occurredAt,
      dedupeKey: args.dedupeKey,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    return notificationId;
  },
});

/**
 * Process a single notification (fetch full data and upsert)
 */
export const processNotification = internalAction({
  args: {
    notificationId: v.id("bricklinkNotifications"),
  },
  handler: async (ctx, args) => {
    // Get notification
    const notification = await ctx.runQuery(
      internal.marketplaces.bricklink.notifications.getNotification,
      {
        notificationId: args.notificationId,
      },
    );

    if (!notification) {
      console.error(`[Notifications] Notification ${args.notificationId} not found`);
      return;
    }

    // Skip if already completed
    if (notification.status === "completed") {
      return;
    }

    // Skip if max attempts reached
    if (notification.attempts >= MAX_PROCESSING_ATTEMPTS) {
      await ctx.runMutation(
        internal.marketplaces.bricklink.notifications.updateNotificationStatus,
        {
          notificationId: args.notificationId,
          status: "dead_letter",
          lastError: "Max processing attempts reached",
        },
      );
      return;
    }

    // Mark as processing
    await ctx.runMutation(internal.marketplaces.bricklink.notifications.updateNotificationStatus, {
      notificationId: args.notificationId,
      status: "processing",
      attempts: notification.attempts + 1,
    });

    try {
      // Process based on event type
      if (notification.eventType === "Order") {
        await processOrderNotification(
          ctx,
          notification.businessAccountId,
          notification.resourceId,
        );
      } else if (notification.eventType === "Message") {
        // TODO: Process message notifications (optional for v1)
        console.log(
          `[Notifications] Message notification ${notification.resourceId} - not implemented`,
        );
      } else if (notification.eventType === "Feedback") {
        // TODO: Process feedback notifications (optional for v1)
        console.log(
          `[Notifications] Feedback notification ${notification.resourceId} - not implemented`,
        );
      }

      // Mark as completed
      await ctx.runMutation(
        internal.marketplaces.bricklink.notifications.updateNotificationStatus,
        {
          notificationId: args.notificationId,
          status: "completed",
          processedAt: Date.now(),
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[Notifications] Error processing notification ${args.notificationId}:`,
        errorMessage,
      );

      // Mark as failed (will be retried)
      await ctx.runMutation(
        internal.marketplaces.bricklink.notifications.updateNotificationStatus,
        {
          notificationId: args.notificationId,
          status: "failed",
          lastError: errorMessage,
        },
      );

      // Schedule retry with exponential backoff
      const retryDelay = RETRY_DELAY_MS * Math.pow(2, notification.attempts);
      await ctx.scheduler.runAfter(
        retryDelay,
        internal.marketplaces.bricklink.notifications.processNotification,
        {
          notificationId: args.notificationId,
        },
      );
    }
  },
});

/**
 * Process order notification: fetch full order data and upsert
 */
async function processOrderNotification(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  orderId: number,
) {
  // Create store client
  const client = await createBricklinkStoreClient(ctx, businessAccountId);

  // Fetch full order data
  const orderData = await client.getOrder(orderId);
  const orderItemsData = await client.getOrderItems(orderId);

  // Upsert order and items
  await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
    businessAccountId,
    provider: "bricklink",
    orderData,
    orderItemsData,
  });
}

/**
 * Process mock order notification: use provided mock data instead of API calls
 * Development only - bypasses BrickLink API calls
 * Internal mutation (not action) since it doesn't need to make external API calls
 */
export const processMockOrderNotification = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    orderData: v.any(), // BricklinkOrderResponse
    orderItemsData: v.any(), // BricklinkOrderItemResponse[][]
  },
  handler: async (ctx, args) => {
    // Validate development mode
    const deploymentName = process.env.CONVEX_DEPLOYMENT;
    const isDevelopment =
      !deploymentName ||
      deploymentName.startsWith("dev:") ||
      deploymentName.includes("development");

    if (!isDevelopment) {
      throw new Error(
        "Mock webhook notifications can only be processed in development environments",
      );
    }

    // Type assertions for mock data
    const orderData = args.orderData as BricklinkOrderResponse;
    const orderItemsData = args.orderItemsData as BricklinkOrderItemResponse[][];

    // Upsert order and items using the same mutation as real orders
    await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
      businessAccountId: args.businessAccountId,
      provider: args.provider,
      orderData,
      orderItemsData,
    });
  },
});

/**
 * Get notification by ID (internal query)
 */
export const getNotification = internalQuery({
  args: {
    notificationId: v.id("bricklinkNotifications"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notificationId);
  },
});

/**
 * Update notification status (internal mutation)
 */
export const updateNotificationStatus = internalMutation({
  args: {
    notificationId: v.id("bricklinkNotifications"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("dead_letter"),
    ),
    attempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const update: {
      status: typeof args.status;
      attempts?: number;
      lastError?: string;
      processedAt?: number;
      updatedAt: number;
    } = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.attempts !== undefined) {
      update.attempts = args.attempts;
    }
    if (args.lastError !== undefined) {
      update.lastError = args.lastError;
    }
    if (args.processedAt !== undefined) {
      update.processedAt = args.processedAt;
    }

    await ctx.db.patch(args.notificationId, update);
  },
});

/**
 * Poll notifications for a business account (internal action)
 */
export const pollNotificationsForBusiness = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    // Create store client
    const client = await createBricklinkStoreClient(ctx, args.businessAccountId);

    try {
      // Fetch unread notifications
      const notifications = await client.getNotifications();

      console.log(
        `[Notifications] Polled ${notifications.length} notifications for business ${args.businessAccountId}`,
      );

      // Process each notification
      for (const notification of notifications) {
        const dedupeKey = `${args.businessAccountId}:${notification.event_type}:${notification.resource_id}:${notification.timestamp}`;

        // Upsert notification
        const notificationId = await ctx.runMutation(
          internal.marketplaces.bricklink.notifications.upsertNotification,
          {
            businessAccountId: args.businessAccountId,
            eventType: notification.event_type,
            resourceId: notification.resource_id,
            timestamp: notification.timestamp,
            dedupeKey,
          },
        );

        // Enqueue processing
        await ctx.scheduler.runAfter(
          0,
          internal.marketplaces.bricklink.notifications.processNotification,
          {
            notificationId,
          },
        );
      }

      // Update last polled timestamp
      await ctx.runMutation(internal.marketplaces.bricklink.notifications.updateLastPolled, {
        businessAccountId: args.businessAccountId,
      });
    } catch (error) {
      console.error(
        `[Notifications] Error polling notifications for business ${args.businessAccountId}:`,
        error,
      );
      throw error;
    }
  },
});

/**
 * Update last polled timestamp (internal mutation)
 */
export const updateLastPolled = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    if (credential) {
      await ctx.db.patch(credential._id, {
        lastCentralPolledAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Poll notifications for all active BrickLink stores (cron action)
 */
export const pollAllNotifications = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all active BrickLink credentials
    const credentials = await ctx.runQuery(
      internal.marketplaces.bricklink.notifications.getAllActiveCredentials,
    );

    console.log(`[Notifications] Polling ${credentials.length} active BrickLink stores`);

    // Poll each store (in parallel for efficiency)
    const results = await Promise.allSettled(
      credentials.map((cred: { businessAccountId: Id<"businessAccounts"> }) =>
        ctx.runAction(internal.marketplaces.bricklink.notifications.pollNotificationsForBusiness, {
          businessAccountId: cred.businessAccountId,
        }),
      ),
    );

    // Log results
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed > 0) {
      console.error(`[Notifications] Failed to poll ${failed} stores`);
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `[Notifications] Store ${credentials[index].businessAccountId} poll failed:`,
            result.reason,
          );
        }
      });
    }

    console.log(`[Notifications] Polling complete: ${succeeded} succeeded, ${failed} failed`);
  },
});

/**
 * Get all active BrickLink credentials (internal query)
 */
export const getAllActiveCredentials = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Use index to get only active BrickLink credentials
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_provider_active", (q) => q.eq("provider", "bricklink").eq("isActive", true))
      .collect();

    return credentials.map((cred) => ({
      businessAccountId: cred.businessAccountId,
      webhookToken: cred.webhookToken,
      webhookStatus: cred.webhookStatus,
      webhookEndpoint: cred.webhookEndpoint,
      webhookRegisteredAt: cred.webhookRegisteredAt,
      webhookLastCheckedAt: cred.webhookLastCheckedAt,
    }));
  },
});
