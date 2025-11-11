import type { Doc, Id } from "../../_generated/dataModel";
import { getRateLimitConfig } from "../../ratelimiter/rateLimitConfig";

type Provider = Doc<"marketplaceRateLimits">["provider"];

export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

export function buildInitialRateLimitRecord(
  businessAccountId: Id<"businessAccounts">,
  provider: Provider,
  now: number,
) {
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
    createdAt: now,
    updatedAt: now,
  };
}

export function shouldResetWindow(rateLimit: Doc<"marketplaceRateLimits">, now: number): boolean {
  return now - rateLimit.windowStart >= rateLimit.windowDurationMs;
}

export function shouldEmitAlert(
  newCount: number,
  capacity: number,
  alertThreshold: number,
  alreadyEmitted: boolean,
): boolean {
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
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    return now + 5 * 60 * 1000; // 5 minutes
  }

  return undefined;
}
