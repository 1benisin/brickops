// Small helper functions used by the marketplace rate limit tracking mutations.
import type { Doc, Id } from "../../_generated/dataModel";
import { getRateLimitConfig } from "../../ratelimiter/rateLimitConfig";

type Provider = Doc<"marketplaceRateLimits">["provider"];

export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

export function buildInitialRateLimitRecord(
  businessAccountId: Id<"businessAccounts">,
  provider: Provider,
  now: number,
) {
  // Load the default rate limit numbers for this provider and create a fresh record.
  const config = getRateLimitConfig(provider);

  return {
    businessAccountId,
    provider,
    windowStart: now,
    requestCount: 0,
    capacity: config.capacity,
    windowDurationMs: config.windowDurationMs,
    alertThreshold: config.alertThreshold,
    alertEmitted: false,
    consecutiveFailures: 0,
    circuitBreakerOpenUntil: undefined as number | undefined,
    lastRequestAt: now,
    lastResetAt: now,
    updatedAt: now,
  };
}

export function shouldResetWindow(rateLimit: Doc<"marketplaceRateLimits">, now: number): boolean {
  // If the configured time window has passed, start a new window at the current time.
  return now - rateLimit.windowStart >= rateLimit.windowDurationMs;
}

export function shouldEmitAlert(
  newCount: number,
  capacity: number,
  alertThreshold: number,
  alreadyEmitted: boolean,
): boolean {
  // Only emit once per window, and only when the usage crosses the configured percentage.
  if (alreadyEmitted) {
    return false;
  }

  const percentage = newCount / capacity;
  return percentage >= alertThreshold;
}

export function determineCircuitBreakerOpenUntil(
  consecutiveFailures: number,
  now: number,
): number | undefined {
  // After too many consecutive failures, pause requests for a few minutes.
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    return now + 5 * 60 * 1000; // 5 minutes
  }

  return undefined;
}
