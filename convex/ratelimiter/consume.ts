/**
 * Rate Limiter - Token Consumption and State Management
 *
 * Provides database-backed rate limiting with:
 * - Token bucket algorithm for request throttling
 * - Circuit breaker pattern for failure handling
 * - Alerting when usage exceeds threshold
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getRateLimitConfig } from "./rateLimitConfig";
import {
  providerValidator,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
} from "./schema";

// ============================================================================
// Query: Get Rate Limit State
// ============================================================================

const getRateLimitStateArgs = v.object({
  bucket: v.string(),
  provider: providerValidator,
});

/**
 * Query the current rate limit state for a bucket.
 * Returns defaults if no record exists yet.
 */
export const getRateLimitState = internalQuery({
  args: getRateLimitStateArgs,
  handler: async (ctx, { bucket, provider }) => {
    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    if (!rate) {
      // Return defaults if no record exists
      const config = getRateLimitConfig(provider);
      const now = Date.now();
      return {
        bucket,
        provider,
        capacity: config.capacity,
        windowMs: config.windowDurationMs,
        remaining: config.capacity,
        resetAt: now + config.windowDurationMs,
        requestCount: 0,
        windowStart: now,
        alertThreshold: config.alertThreshold,
        alertEmitted: false,
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined,
        lastRequestAt: now,
        lastResetAt: now,
      };
    }

    return {
      bucket: rate.bucket,
      provider: rate.provider,
      capacity: rate.capacity,
      windowMs: rate.windowMs,
      remaining: rate.remaining,
      resetAt: rate.resetAt,
      requestCount: rate.requestCount,
      windowStart: rate.windowStart,
      alertThreshold: rate.alertThreshold,
      alertEmitted: rate.alertEmitted,
      consecutiveFailures: rate.consecutiveFailures,
      circuitBreakerOpenUntil: rate.circuitBreakerOpenUntil,
      lastRequestAt: rate.lastRequestAt,
      lastResetAt: rate.lastResetAt,
    };
  },
});

// ============================================================================
// Mutation: Consume Token
// ============================================================================

const consumeTokenArgs = v.object({
  bucket: v.string(), // e.g. "bricklink:account:{id}" or "rebrickable:global"
  provider: providerValidator,
});

/**
 * Attempt to consume a rate limit token from a bucket.
 *
 * Returns:
 * - ok: true if token was granted, false if rate limited or circuit breaker open
 * - retryAfter: ms to wait before retrying (0 if granted)
 * - remaining: tokens remaining in current window
 * - resetAt: epoch ms when window resets
 * - circuitBreakerOpen: true if circuit breaker is currently open
 * - alertTriggered: true if this request crossed the alert threshold
 */
export const consumeToken = internalMutation({
  args: consumeTokenArgs,
  handler: async (ctx, { provider, bucket }) => {
    const now = Date.now();
    const config = getRateLimitConfig(provider);
    const { capacity, windowDurationMs: windowMs, alertThreshold } = config;

    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    const isNew = !rate;
    const isExpired = !!rate && now >= rate.resetAt;

    // Check circuit breaker first
    if (rate?.circuitBreakerOpenUntil && now < rate.circuitBreakerOpenUntil) {
      console.debug(
        `Rate limit blocked (circuit breaker open): ${bucket}, reopens at ${new Date(rate.circuitBreakerOpenUntil).toISOString()}`,
      );
      return {
        ok: false,
        retryAfter: rate.circuitBreakerOpenUntil - now,
        remaining: rate.remaining,
        resetAt: rate.resetAt,
        circuitBreakerOpen: true,
        alertTriggered: false,
      } as const;
    }

    let granted: boolean;
    let remaining: number;
    let resetAt: number;
    let requestCount: number;
    let windowStart: number;
    let alertEmitted: boolean;
    let alertTriggered = false;

    if (isNew || isExpired) {
      // New window - reset everything
      granted = true;
      remaining = capacity - 1;
      resetAt = now + windowMs;
      requestCount = 1;
      windowStart = now;
      alertEmitted = false;
    } else if (rate!.remaining > 0) {
      // Same window, token available
      granted = true;
      remaining = rate!.remaining - 1;
      resetAt = rate!.resetAt;
      requestCount = rate!.requestCount + 1;
      windowStart = rate!.windowStart;
      alertEmitted = rate!.alertEmitted;
    } else {
      // Same window, bucket empty
      granted = false;
      remaining = 0;
      resetAt = rate!.resetAt;
      requestCount = rate!.requestCount;
      windowStart = rate!.windowStart;
      alertEmitted = rate!.alertEmitted;
    }

    // Check if we should emit an alert
    if (granted && !alertEmitted) {
      const usagePercent = requestCount / capacity;
      if (usagePercent >= alertThreshold) {
        alertEmitted = true;
        alertTriggered = true;
        console.warn(
          `Rate limit alert: ${bucket} at ${(usagePercent * 100).toFixed(1)}% capacity (${requestCount}/${capacity})`,
        );
      }
    }

    const payload = {
      bucket,
      capacity,
      windowMs,
      remaining,
      resetAt,
      requestCount,
      windowStart,
      alertThreshold,
      alertEmitted,
      consecutiveFailures: isNew || isExpired ? 0 : rate?.consecutiveFailures ?? 0,
      circuitBreakerOpenUntil:
        isNew || isExpired ? undefined : rate?.circuitBreakerOpenUntil ?? undefined,
      lastRequestAt: granted ? now : rate?.lastRequestAt ?? now,
      lastResetAt: isNew || isExpired ? now : rate?.lastResetAt ?? now,
      updatedAt: now,
    };

    if (isNew) {
      await ctx.db.insert("rateLimits", {
        ...payload,
        provider,
      });
    } else {
      await ctx.db.patch(rate!._id, payload);
    }

    if (granted) {
      console.debug(
        `Rate limit granted: ${bucket}, remaining: ${remaining}/${capacity}, requests: ${requestCount}`,
      );
    } else {
      console.debug(`Rate limit denied: ${bucket}, retry after ${resetAt - now}ms`);
    }

    return {
      ok: granted,
      retryAfter: granted ? 0 : Math.max(0, resetAt - now),
      remaining,
      resetAt,
      circuitBreakerOpen: false,
      alertTriggered,
    } as const;
  },
});

// ============================================================================
// Mutation: Record Failure
// ============================================================================

const recordFailureArgs = v.object({
  bucket: v.string(),
  provider: providerValidator,
});

/**
 * Record a failed request to the rate limit bucket.
 * Increments consecutive failure count and opens circuit breaker if threshold is reached.
 */
export const recordFailure = internalMutation({
  args: recordFailureArgs,
  handler: async (ctx, { provider, bucket }) => {
    const now = Date.now();
    const config = getRateLimitConfig(provider);

    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    const newFailureCount = (rate?.consecutiveFailures ?? 0) + 1;
    const shouldOpenCircuitBreaker = newFailureCount >= CIRCUIT_BREAKER_FAILURE_THRESHOLD;

    const circuitBreakerOpenUntil = shouldOpenCircuitBreaker
      ? now + CIRCUIT_BREAKER_OPEN_DURATION_MS
      : rate?.circuitBreakerOpenUntil;

    if (shouldOpenCircuitBreaker) {
      console.warn(
        `Circuit breaker opened: ${bucket} after ${newFailureCount} consecutive failures, closes at ${new Date(circuitBreakerOpenUntil!).toISOString()}`,
      );
    }

    if (!rate) {
      // First failure - create record
      await ctx.db.insert("rateLimits", {
        bucket,
        provider,
        capacity: config.capacity,
        windowMs: config.windowDurationMs,
        remaining: config.capacity,
        resetAt: now + config.windowDurationMs,
        requestCount: 0,
        windowStart: now,
        alertThreshold: config.alertThreshold,
        alertEmitted: false,
        consecutiveFailures: newFailureCount,
        circuitBreakerOpenUntil,
        lastRequestAt: now,
        lastResetAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(rate._id, {
        consecutiveFailures: newFailureCount,
        circuitBreakerOpenUntil,
        updatedAt: now,
      });
    }

    return {
      consecutiveFailures: newFailureCount,
      circuitBreakerOpen: shouldOpenCircuitBreaker,
      circuitBreakerOpenUntil,
    } as const;
  },
});

// ============================================================================
// Mutation: Reset Failures
// ============================================================================

const resetFailuresArgs = v.object({
  bucket: v.string(),
  provider: providerValidator,
});

/**
 * Reset consecutive failure count after a successful request.
 * Closes the circuit breaker if it was open.
 */
export const resetFailures = internalMutation({
  args: resetFailuresArgs,
  handler: async (ctx, { bucket }) => {
    const now = Date.now();

    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    if (!rate) {
      // No record to reset
      return { reset: false } as const;
    }

    if (rate.consecutiveFailures === 0 && !rate.circuitBreakerOpenUntil) {
      // Already at zero failures and no circuit breaker
      return { reset: false } as const;
    }

    const wasCircuitBreakerOpen = !!rate.circuitBreakerOpenUntil;

    await ctx.db.patch(rate._id, {
      consecutiveFailures: 0,
      circuitBreakerOpenUntil: undefined,
      updatedAt: now,
    });

    if (wasCircuitBreakerOpen) {
      console.info(`Circuit breaker closed: ${bucket} after successful request`);
    }

    return {
      reset: true,
      circuitBreakerWasOpen: wasCircuitBreakerOpen,
    } as const;
  },
});
