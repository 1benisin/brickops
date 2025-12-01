import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import type { BLNotificationStatus } from "./schema";
import type { BLNotificationEventType } from "./schema";

export type CredentialLookup = {
  businessAccountId: Id<"businessAccounts">;
} | null;

export type UpsertNotificationArgs = {
  businessAccountId: Id<"businessAccounts">;
  eventType: BLNotificationEventType;
  resourceId: number;
  timestamp: string;
  dedupeKey: string;
};

export type UpdateNotificationStatusArgs = {
  notificationId: Id<"bricklinkNotifications">;
  status: BLNotificationStatus;
  attempts?: number;
  lastError?: string;
  processedAt?: number;
};

export type ActiveCredential = Pick<
  Doc<"marketplaceCredentials">,
  | "businessAccountId"
  | "webhookToken"
  | "webhookStatus"
  | "webhookEndpoint"
  | "webhookRegisteredAt"
  | "webhookLastCheckedAt"
>;

export async function getCredentialByToken(
  ctx: QueryCtx,
  webhookToken: string,
): Promise<CredentialLookup> {
  const credential = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_webhookToken", (q) => q.eq("webhookToken", webhookToken))
    .first();

  if (!credential || !credential.isActive || credential.provider !== "bricklink") {
    return null;
  }

  return {
    businessAccountId: credential.businessAccountId,
  };
}

export async function upsertNotification(
  ctx: MutationCtx,
  args: UpsertNotificationArgs,
): Promise<Id<"bricklinkNotifications">> {
  const existing = await ctx.db
    .query("bricklinkNotifications")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
    .first();

  const now = Date.now();
  const occurredAt = new Date(args.timestamp).getTime();

  if (existing) {
    if (existing.status === "pending" || existing.status === "failed") {
      await ctx.db.patch(existing._id, {
        attempts: 0,
        lastError: undefined,
        updatedAt: now,
      });
    }
    return existing._id;
  }

  return await ctx.db.insert("bricklinkNotifications", {
    businessAccountId: args.businessAccountId,
    eventType: args.eventType,
    resourceId: args.resourceId,
    timestamp: args.timestamp,
    occurredAt,
    dedupeKey: args.dedupeKey,
    status: "pending",
    attempts: 0,
    updatedAt: now,
  });
}

export async function getNotification(ctx: QueryCtx, notificationId: Id<"bricklinkNotifications">) {
  return await ctx.db.get(notificationId);
}

export async function updateNotificationStatus(
  ctx: MutationCtx,
  args: UpdateNotificationStatusArgs,
): Promise<void> {
  const update: {
    status: BLNotificationStatus;
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
}

export async function updateLastPolled(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<void> {
  const credential = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", businessAccountId).eq("provider", "bricklink"),
    )
    .first();

  if (!credential) {
    return;
  }

  await ctx.db.patch(credential._id, {
    lastCentralPolledAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function getAllActiveCredentials(ctx: QueryCtx): Promise<ActiveCredential[]> {
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
}
