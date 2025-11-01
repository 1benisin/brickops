/**
 * BrickLink Notifications Processing
 * Handles notification ingestion and processing (both webhook and polling)
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createBricklinkStoreClient } from "../marketplace/helpers";
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
    const notification = await ctx.runQuery(internal.bricklink.notifications.getNotification, {
      notificationId: args.notificationId,
    });

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
      await ctx.runMutation(internal.bricklink.notifications.updateNotificationStatus, {
        notificationId: args.notificationId,
        status: "dead_letter",
        lastError: "Max processing attempts reached",
      });
      return;
    }

    // Mark as processing
    await ctx.runMutation(internal.bricklink.notifications.updateNotificationStatus, {
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
      await ctx.runMutation(internal.bricklink.notifications.updateNotificationStatus, {
        notificationId: args.notificationId,
        status: "completed",
        processedAt: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[Notifications] Error processing notification ${args.notificationId}:`,
        errorMessage,
      );

      // Mark as failed (will be retried)
      await ctx.runMutation(internal.bricklink.notifications.updateNotificationStatus, {
        notificationId: args.notificationId,
        status: "failed",
        lastError: errorMessage,
      });

      // Schedule retry with exponential backoff
      const retryDelay = RETRY_DELAY_MS * Math.pow(2, notification.attempts);
      await ctx.scheduler.runAfter(
        retryDelay,
        internal.bricklink.notifications.processNotification,
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
  await ctx.runMutation(internal.bricklink.notifications.upsertOrder, {
    businessAccountId,
    orderData,
    orderItemsData,
  });
}

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
 * Upsert order and order items (internal mutation)
 */
export const upsertOrder = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    orderData: v.any(), // BricklinkOrderResponse
    orderItemsData: v.any(), // BricklinkOrderItemResponse[][]
  },
  handler: async (ctx, args) => {
    const order = args.orderData as BricklinkOrderResponse;
    const items = args.orderItemsData as BricklinkOrderItemResponse[][];

    const now = Date.now();

    // Parse timestamps
    const dateOrdered = new Date(order.date_ordered).getTime();
    const dateStatusChanged = new Date(order.date_status_changed).getTime();
    const paymentDatePaid = order.payment?.date_paid
      ? new Date(order.payment.date_paid).getTime()
      : undefined;
    const shippingDateShipped = order.shipping?.date_shipped
      ? new Date(order.shipping.date_shipped).getTime()
      : undefined;

    // Check if order exists
    const existing = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("orderId", order.order_id),
      )
      .first();

    const orderData = {
      businessAccountId: args.businessAccountId,
      orderId: order.order_id,
      dateOrdered,
      dateStatusChanged,
      sellerName: order.seller_name,
      storeName: order.store_name,
      buyerName: order.buyer_name,
      buyerEmail: order.buyer_email,
      buyerOrderCount: order.buyer_order_count,
      requireInsurance: order.require_insurance,
      status: order.status,
      isInvoiced: order.is_invoiced,
      isFiled: order.is_filed,
      driveThruSent: order.drive_thru_sent,
      salesTaxCollectedByBl: order.salesTax_collected_by_bl,
      remarks: order.remarks,
      totalCount: order.total_count,
      uniqueCount: order.unique_count,
      totalWeight: order.total_weight ? parseFloat(order.total_weight) : undefined,
      paymentMethod: order.payment?.method,
      paymentCurrencyCode: order.payment?.currency_code,
      paymentDatePaid,
      paymentStatus: order.payment?.status,
      shippingMethod: order.shipping?.method,
      shippingMethodId: order.shipping?.method_id?.toString(),
      shippingTrackingNo: order.shipping?.tracking_no,
      shippingTrackingLink: order.shipping?.tracking_link,
      shippingDateShipped,
      shippingAddress: order.shipping?.address ? JSON.stringify(order.shipping.address) : undefined,
      costCurrencyCode: order.cost.currency_code,
      costSubtotal: parseFloat(order.cost.subtotal),
      costGrandTotal: parseFloat(order.cost.grand_total),
      costSalesTaxCollectedByBL: order.cost.salesTax_collected_by_BL
        ? parseFloat(order.cost.salesTax_collected_by_BL)
        : undefined,
      costFinalTotal: order.cost.final_total ? parseFloat(order.cost.final_total) : undefined,
      costEtc1: order.cost.etc1 ? parseFloat(order.cost.etc1) : undefined,
      costEtc2: order.cost.etc2 ? parseFloat(order.cost.etc2) : undefined,
      costInsurance: order.cost.insurance ? parseFloat(order.cost.insurance) : undefined,
      costShipping: order.cost.shipping ? parseFloat(order.cost.shipping) : undefined,
      costCredit: order.cost.credit ? parseFloat(order.cost.credit) : undefined,
      costCoupon: order.cost.coupon ? parseFloat(order.cost.coupon) : undefined,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, orderData);
    } else {
      await ctx.db.insert("bricklinkOrders", {
        ...orderData,
        createdAt: now,
      });
    }

    // Delete existing items (we'll re-insert all)
    const existingItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("orderId", order.order_id),
      )
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    // Insert order items (flatten nested arrays - batches)
    for (const batch of items) {
      for (const item of batch) {
        await ctx.db.insert("bricklinkOrderItems", {
          businessAccountId: args.businessAccountId,
          orderId: order.order_id,
          inventoryId: item.inventory_id,
          itemNo: item.item.no,
          itemName: item.item.name,
          itemType: item.item.type,
          itemCategoryId: item.item.category_id,
          colorId: item.color_id,
          colorName: item.color_name,
          quantity: item.quantity,
          newOrUsed: item.new_or_used,
          completeness: item.completeness,
          unitPrice: parseFloat(item.unit_price),
          unitPriceFinal: parseFloat(item.unit_price_final),
          currencyCode: item.currency_code,
          remarks: item.remarks,
          description: item.description,
          weight: item.weight ? parseFloat(item.weight) : undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
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
          internal.bricklink.notifications.upsertNotification,
          {
            businessAccountId: args.businessAccountId,
            eventType: notification.event_type,
            resourceId: notification.resource_id,
            timestamp: notification.timestamp,
            dedupeKey,
          },
        );

        // Enqueue processing
        await ctx.scheduler.runAfter(0, internal.bricklink.notifications.processNotification, {
          notificationId,
        });
      }

      // Update last polled timestamp
      await ctx.runMutation(internal.bricklink.notifications.updateLastPolled, {
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
      internal.bricklink.notifications.getAllActiveCredentials,
    );

    console.log(`[Notifications] Polling ${credentials.length} active BrickLink stores`);

    // Poll each store (in parallel for efficiency)
    const results = await Promise.allSettled(
      credentials.map((cred) =>
        ctx.runAction(internal.bricklink.notifications.pollNotificationsForBusiness, {
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
    }));
  },
});
