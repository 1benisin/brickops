// Internal mutations and queries that track per-business API rate limits for marketplaces.
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

// Look up the current rate limit state, or fall back to the defaults if none exists yet.
export const getRateLimitState = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Read the rate limit entry for this business and provider.
    const quota = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!quota) {
      // If nothing exists yet, seed a fake record using default values.
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

// Shared helper that inserts a new rate limit record with optional overrides.
async function insertInitialRateLimit(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  provider: Provider,
  now: number,
  overrides: Partial<ReturnType<typeof buildInitialRateLimitRecord>> = {},
) {
  // Build default fields and layer on any overrides supplied by the caller.
  const record = buildInitialRateLimitRecord(businessAccountId, provider, now);
  await ctx.db.insert("marketplaceRateLimits", {
    ...record,
    ...overrides,
  });
}

// Increment the request counter for a business and enforce rolling windows.
export const incrementRateLimitUsage = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Try to load the existing rate limit row for this provider.
    const now = Date.now();
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      // First ever request: create the row with a starting count of one.
      await insertInitialRateLimit(ctx, args.businessAccountId, args.provider, now, {
        requestCount: 1,
      });
      return;
    }

    if (shouldResetWindow(existing, now)) {
      // We rolled into a new window. Reset counts and timestamps for a fresh start.
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

    // Staying in the same window, so bump the count and mark alerts if needed.
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

// Record when an outbound marketplace request failed, so we can trip a circuit breaker.
export const recordRateLimitFailure = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Load the matching rate limit record for this business account.
    const now = Date.now();
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      // First failure seen: create a record so future calls can update it.
      await insertInitialRateLimit(ctx, args.businessAccountId, args.provider, now, {
        requestCount: 0,
        consecutiveFailures: 1,
      });
      return;
    }

    // Add one to the consecutive failure counter and compute a new circuit breaker window.
    const consecutiveFailures = existing.consecutiveFailures + 1;
    const circuitBreakerOpenUntil = determineCircuitBreakerOpenUntil(consecutiveFailures, now);

    await ctx.db.patch(existing._id, {
      consecutiveFailures,
      circuitBreakerOpenUntil,
      updatedAt: now,
    });
  },
});

// Clear out failure counters after a successful marketplace request.
export const resetRateLimitFailures = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Check whether the record exists and the failure counter is non-zero.
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (existing && existing.consecutiveFailures > 0) {
      // Reset the failure count and close the circuit breaker if it was open.
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});
