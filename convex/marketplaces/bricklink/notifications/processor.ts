import type { ActionCtx, MutationCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { internal } from "../../../_generated/api";
import {
  MAX_PROCESSING_ATTEMPTS,
  RETRY_DELAY_MS,
  buildNotificationDedupeKey,
  listNotifications,
  processOrderNotification,
} from "./utilities";
import type { BLOrderItemResponse, BLOrderResponse } from "../orders/schema";

export async function processNotification(
  ctx: ActionCtx,
  notificationId: Id<"bricklinkNotifications">,
): Promise<void> {
  const notification = await ctx.runQuery(
    internal.marketplaces.bricklink.notifications.actions.getNotification,
    {
      notificationId,
    },
  );

  if (!notification) {
    console.error(`[Notifications] Notification ${notificationId} not found`);
    return;
  }

  if (notification.status === "completed") {
    return;
  }

  if (notification.attempts >= MAX_PROCESSING_ATTEMPTS) {
    await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.actions.updateNotificationStatus,
      {
        notificationId,
        status: "dead_letter",
        lastError: "Max processing attempts reached",
      },
    );
    return;
  }

  await ctx.runMutation(
    internal.marketplaces.bricklink.notifications.actions.updateNotificationStatus,
    {
      notificationId,
      status: "processing",
      attempts: notification.attempts + 1,
    },
  );

  try {
    if (notification.eventType === "Order") {
      await processOrderNotification(ctx, notification.businessAccountId, notification.resourceId);
    } else if (notification.eventType === "Message") {
      console.log(
        `[Notifications] Message notification ${notification.resourceId} - not implemented`,
      );
    } else if (notification.eventType === "Feedback") {
      console.log(
        `[Notifications] Feedback notification ${notification.resourceId} - not implemented`,
      );
    }

    await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.actions.updateNotificationStatus,
      {
        notificationId,
        status: "completed",
        processedAt: Date.now(),
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Notifications] Error processing notification ${notificationId}:`, errorMessage);

    await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.actions.updateNotificationStatus,
      {
        notificationId,
        status: "failed",
        lastError: errorMessage,
      },
    );

    const retryDelay = RETRY_DELAY_MS * Math.pow(2, notification.attempts);
    await ctx.scheduler.runAfter(
      retryDelay,
      internal.marketplaces.bricklink.notifications.actions.processNotification,
      {
        notificationId,
      },
    );
  }
}

export async function pollNotificationsForBusiness(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<void> {
  const notifications = await listNotifications(ctx, businessAccountId);

  console.log(
    `[Notifications] Polled ${notifications.length} notifications for business ${businessAccountId}`,
  );

  for (const notification of notifications) {
    const dedupeKey = buildNotificationDedupeKey(
      businessAccountId,
      notification.event_type,
      notification.resource_id,
      notification.timestamp,
    );

    const notificationId = await ctx.runMutation(
      internal.marketplaces.bricklink.notifications.actions.upsertNotification,
      {
        businessAccountId,
        eventType: notification.event_type,
        resourceId: notification.resource_id,
        timestamp: notification.timestamp,
        dedupeKey,
      },
    );

    await ctx.runAction(internal.marketplaces.bricklink.notifications.actions.processNotification, {
      notificationId,
    });
  }
}

export async function pollAllNotifications(ctx: ActionCtx): Promise<void> {
  const credentials = await ctx.runQuery(
    internal.marketplaces.bricklink.notifications.actions.getAllActiveCredentials,
    {},
  );

  console.log(`[Notifications] Polling ${credentials.length} active BrickLink stores`);

  const results = await Promise.allSettled(
    credentials.map((cred: { businessAccountId: Id<"businessAccounts"> }) =>
      ctx.runAction(
        internal.marketplaces.bricklink.notifications.actions.pollNotificationsForBusiness,
        {
          businessAccountId: cred.businessAccountId,
        },
      ),
    ),
  );

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
}

export type ProcessMockOrderNotificationArgs = {
  businessAccountId: Id<"businessAccounts">;
  provider: "bricklink" | "brickowl";
  orderData: BLOrderResponse;
  orderItemsData: BLOrderItemResponse[][];
};

export async function processMockOrderNotification(
  ctx: MutationCtx,
  args: ProcessMockOrderNotificationArgs,
): Promise<void> {
  const deploymentName = process.env.CONVEX_DEPLOYMENT;
  const isDevelopment =
    !deploymentName || deploymentName.startsWith("dev:") || deploymentName.includes("development");

  if (!isDevelopment) {
    throw new Error("Mock webhook notifications can only be processed in development environments");
  }

  await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
    businessAccountId: args.businessAccountId,
    provider: args.provider,
    orderData: args.orderData,
    orderItemsData: args.orderItemsData,
  });
}
