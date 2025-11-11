import { internalMutation, internalQuery, MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import {
  buildInitialRateLimitRecord,
  determineCircuitBreakerOpenUntil,
  shouldEmitAlert,
  shouldResetWindow,
} from "./rateLimitHelpers";

type Provider = Parameters<typeof buildInitialRateLimitRecord>[1];

export const getRateLimitState = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const quota = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!quota) {
      const now = Date.now();
      const defaults = buildInitialRateLimitRecord(args.businessAccountId, args.provider, now);

      return {
        windowStart: defaults.windowStart,
        requestCount: defaults.requestCount,
        capacity: defaults.capacity,
        windowDurationMs: defaults.windowDurationMs,
        alertThreshold: defaults.alertThreshold,
        alertEmitted: defaults.alertEmitted,
        consecutiveFailures: defaults.consecutiveFailures,
        circuitBreakerOpenUntil: defaults.circuitBreakerOpenUntil,
      };
    }

    return {
      windowStart: quota.windowStart,
      requestCount: quota.requestCount,
      capacity: quota.capacity,
      windowDurationMs: quota.windowDurationMs,
      alertThreshold: quota.alertThreshold,
      alertEmitted: quota.alertEmitted,
      consecutiveFailures: quota.consecutiveFailures,
      circuitBreakerOpenUntil: quota.circuitBreakerOpenUntil,
    };
  },
});

async function insertInitialRateLimit(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  provider: Provider,
  now: number,
  overrides: Partial<ReturnType<typeof buildInitialRateLimitRecord>> = {},
) {
  const record = buildInitialRateLimitRecord(businessAccountId, provider, now);
  await ctx.db.insert("marketplaceRateLimits", {
    ...record,
    ...overrides,
  });
}

export const incrementRateLimitUsage = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      await insertInitialRateLimit(ctx, args.businessAccountId, args.provider, now, {
        requestCount: 1,
      });
      return;
    }

    if (shouldResetWindow(existing, now)) {
      await ctx.db.patch(existing._id, {
        windowStart: now,
        requestCount: 1,
        alertEmitted: false,
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined,
        lastRequestAt: now,
        lastResetAt: now,
        updatedAt: now,
      });
      return;
    }

    const newCount = existing.requestCount + 1;
    const alertTriggered = shouldEmitAlert(
      newCount,
      existing.capacity,
      existing.alertThreshold,
      existing.alertEmitted,
    );

    await ctx.db.patch(existing._id, {
      requestCount: newCount,
      alertEmitted: alertTriggered ? true : existing.alertEmitted,
      lastRequestAt: now,
      updatedAt: now,
    });
  },
});

export const recordRateLimitFailure = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      await insertInitialRateLimit(ctx, args.businessAccountId, args.provider, now, {
        requestCount: 0,
        consecutiveFailures: 1,
      });
      return;
    }

    const consecutiveFailures = existing.consecutiveFailures + 1;
    const circuitBreakerOpenUntil = determineCircuitBreakerOpenUntil(consecutiveFailures, now);

    await ctx.db.patch(existing._id, {
      consecutiveFailures,
      circuitBreakerOpenUntil,
      updatedAt: now,
    });
  },
});

export const resetRateLimitFailures = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (existing && existing.consecutiveFailures > 0) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});
