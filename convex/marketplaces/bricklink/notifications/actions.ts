/**
 * BrickLink notification ingestion: action entrypoints.
 */
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
} from "../../../_generated/server";
import { v } from "convex/values";
import { blNotificationEventTypeValidator, blNotificationStatusValidator } from "./schema";
import * as store from "./store";
import * as processor from "./processor";
import * as webhook from "./webhook";
import type { BLOrderItemResponse, BLOrderResponse } from "../orders/schema";

export const getCredentialByToken = internalQuery({
  args: {
    webhookToken: v.string(),
  },
  handler: (ctx, args) => store.getCredentialByToken(ctx, args.webhookToken),
});

export const upsertNotification = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    eventType: blNotificationEventTypeValidator,
    resourceId: v.number(),
    timestamp: v.string(),
    dedupeKey: v.string(),
  },
  handler: (ctx, args) => store.upsertNotification(ctx, args),
});

export const processNotification = internalAction({
  args: {
    notificationId: v.id("bricklinkNotifications"),
  },
  handler: (ctx, args) => processor.processNotification(ctx, args.notificationId),
});

export const processMockOrderNotification = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    orderData: v.any(),
    orderItemsData: v.any(),
  },
  handler: (ctx, args) =>
    processor.processMockOrderNotification(ctx, {
      businessAccountId: args.businessAccountId,
      provider: args.provider,
      orderData: args.orderData as BLOrderResponse,
      orderItemsData: args.orderItemsData as BLOrderItemResponse[][],
    }),
});

export const getNotification = internalQuery({
  args: {
    notificationId: v.id("bricklinkNotifications"),
  },
  handler: (ctx, args) => store.getNotification(ctx, args.notificationId),
});

export const updateNotificationStatus = internalMutation({
  args: {
    notificationId: v.id("bricklinkNotifications"),
    status: blNotificationStatusValidator,
    attempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  },
  handler: (ctx, args) => store.updateNotificationStatus(ctx, args),
});

export const pollNotificationsForBusiness = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: (ctx, args) => processor.pollNotificationsForBusiness(ctx, args.businessAccountId),
});

export const updateLastPolled = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: (ctx, args) => store.updateLastPolled(ctx, args.businessAccountId),
});

export const pollAllNotifications = internalAction({
  args: {},
  handler: (ctx) => processor.pollAllNotifications(ctx),
});

export const getAllActiveCredentials = internalQuery({
  args: {},
  handler: (ctx) => store.getAllActiveCredentials(ctx),
});

export const bricklinkWebhook = httpAction((ctx, request) =>
  webhook.handleWebhookRequest(ctx, request),
);

export const registerWebhook = action({
  args: {
    overrideBaseUrl: v.optional(v.string()),
  },
  handler: (ctx, args) => webhook.registerWebhook(ctx, args.overrideBaseUrl),
});

export const unregisterWebhook = action({
  args: {},
  handler: (ctx) => webhook.unregisterWebhook(ctx),
});

export const ensureWebhooks = internalAction({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: (ctx, args) => webhook.ensureWebhooks(ctx, args.force),
});
