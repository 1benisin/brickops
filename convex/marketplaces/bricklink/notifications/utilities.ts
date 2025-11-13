import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { internal } from "../../../_generated/api";
import { withBlClient, type BLApiResponse } from "../transport";
import { getOrder, getOrderItems } from "../orders/actions";
import { blNotificationSchema, type BLNotification, type BLNotificationEventType } from "./schema";

export const MAX_PROCESSING_ATTEMPTS = 5;
export const RETRY_DELAY_MS = 60_000; // 1 minute
export const NOTIFICATION_REPLAY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function buildNotificationDedupeKey(
  businessAccountId: Id<"businessAccounts">,
  eventType: BLNotificationEventType,
  resourceId: number,
  timestamp: string,
  ...extraParts: Array<string | number>
): string {
  return [businessAccountId, eventType, resourceId, timestamp, ...extraParts]
    .map((part) => String(part))
    .join(":");
}

export async function listNotifications(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BLNotification[]> {
  return await withBlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const response = await client.request<BLApiResponse<BLNotification[]>>({
        path: "/notifications",
        method: "GET",
      });

      const data = response.data.data ?? [];
      return data.map((notification) => blNotificationSchema.parse(notification));
    },
  });
}

export async function processOrderNotification(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  orderId: number,
) {
  const orderData = await getOrder(ctx, { businessAccountId, orderId });
  const orderItemsData = await getOrderItems(ctx, { businessAccountId, orderId });

  await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
    businessAccountId,
    provider: "bricklink",
    orderData,
    orderItemsData,
  });
}

export function isNotificationReplay(
  timestamp: string,
  now: number = Date.now(),
  windowMs: number = NOTIFICATION_REPLAY_WINDOW_MS,
): boolean {
  const notificationTime = new Date(timestamp).getTime();
  return Number.isFinite(notificationTime) && notificationTime < now - windowMs;
}
