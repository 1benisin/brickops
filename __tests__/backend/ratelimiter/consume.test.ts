/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeToken, recordFailure, resetFailures } from "@/convex/ratelimiter/consume";
import { getRateLimitConfig } from "@/convex/ratelimiter/rateLimitConfig";
import type { RateLimitConfig } from "@/convex/ratelimiter/schema";
import {
  providerValidator,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  type Provider,
} from "@/convex/ratelimiter/schema";
import { createConvexTestContext } from "@/test-utils/convex-test-context";

// Helper to create a complete rate limit record with all required fields
function createRateLimitRecord(
  overrides: Partial<{
    _id: string;
    bucket: string;
    provider: Provider;
    capacity: number;
    windowMs: number;
    remaining: number;
    resetAt: number;
    requestCount: number;
    windowStart: number;
    alertThreshold: number;
    alertEmitted: boolean;
    consecutiveFailures: number;
    circuitBreakerOpenUntil: number | undefined;
    lastRequestAt: number;
    lastResetAt: number;
    updatedAt: number;
  }>,
) {
  const now = Date.now();
  const config = getRateLimitConfig((overrides.provider ?? "bricklink") as Provider);

  return {
    _id: "rateLimits:1",
    bucket: "businessAccounts:1",
    provider: "bricklink" as Provider,
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
    updatedAt: now,
    ...overrides,
  };
}

describe("consumeToken", () => {
  const bucket = "businessAccounts:1";
  const provider = "bricklink" as const;
  const now = new Date("2025-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("creates a new rate limit window when no record exists", async () => {
    const ctx = createConvexTestContext();

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });
    const config = getRateLimitConfig(provider);

    expect(result).toMatchObject({
      ok: true,
      retryAfter: 0,
      remaining: config.capacity - 1,
      resetAt: now.getTime() + config.windowDurationMs,
      circuitBreakerOpen: false,
      alertTriggered: false,
    });

    const stored = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    expect(stored).toMatchObject({
      provider,
      bucket,
      capacity: config.capacity,
      windowMs: config.windowDurationMs,
      remaining: config.capacity - 1,
      resetAt: now.getTime() + config.windowDurationMs,
      requestCount: 1,
      windowStart: now.getTime(),
      alertThreshold: config.alertThreshold,
      alertEmitted: false,
      consecutiveFailures: 0,
      updatedAt: now.getTime(),
    });
  });

  it("consumes a token when bucket still has remaining capacity in the current window", async () => {
    const config = getRateLimitConfig(provider);
    const seededRemaining = 5;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            remaining: seededRemaining,
            requestCount: config.capacity - seededRemaining,
            resetAt: now.getTime() + config.windowDurationMs,
            windowStart: now.getTime() - 10_000,
            updatedAt: now.getTime() - 10_000,
          }),
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      ok: true,
      retryAfter: 0,
      remaining: seededRemaining - 1,
      resetAt: now.getTime() + config.windowDurationMs,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: seededRemaining - 1,
      requestCount: config.capacity - seededRemaining + 1,
      resetAt: now.getTime() + config.windowDurationMs,
      updatedAt: now.getTime(),
    });
  });

  it("denies a token when the bucket is empty in the current window", async () => {
    const config = getRateLimitConfig(provider);
    const resetAt = now.getTime() + config.windowDurationMs;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            remaining: 0,
            requestCount: config.capacity,
            resetAt,
            windowStart: now.getTime() - 10_000,
            updatedAt: now.getTime() - 10_000,
          }),
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      ok: false,
      retryAfter: config.windowDurationMs,
      remaining: 0,
      resetAt,
      circuitBreakerOpen: false,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: 0,
      resetAt,
      updatedAt: now.getTime(),
    });
  });

  it("resets the bucket when the current window has expired", async () => {
    const config = getRateLimitConfig(provider);
    const expiredResetAt = now.getTime() - 1_000;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            remaining: 0,
            requestCount: config.capacity,
            resetAt: expiredResetAt,
            windowStart: expiredResetAt - config.windowDurationMs,
            updatedAt: now.getTime() - 10_000,
          }),
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      ok: true,
      retryAfter: 0,
      remaining: config.capacity - 1,
      resetAt: now.getTime() + config.windowDurationMs,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: config.capacity - 1,
      requestCount: 1,
      resetAt: now.getTime() + config.windowDurationMs,
      windowStart: now.getTime(),
      alertEmitted: false,
      consecutiveFailures: 0,
      updatedAt: now.getTime(),
    });
  });

  it("blocks requests when circuit breaker is open", async () => {
    const config = getRateLimitConfig(provider);
    const circuitBreakerOpenUntil = now.getTime() + 5 * 60 * 1000; // 5 minutes from now
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            remaining: config.capacity,
            consecutiveFailures: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            circuitBreakerOpenUntil,
          }),
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      ok: false,
      retryAfter: circuitBreakerOpenUntil - now.getTime(),
      circuitBreakerOpen: true,
    });
  });

  it("triggers alert when usage crosses threshold", async () => {
    const config = getRateLimitConfig(provider);
    // Set remaining so that after consuming, we cross the 80% threshold
    const remaining = Math.ceil(config.capacity * 0.21); // Just above 20% remaining
    const requestCount = config.capacity - remaining;

    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            remaining,
            requestCount,
            alertEmitted: false,
          }),
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result.ok).toBe(true);
    expect(result.alertTriggered).toBe(true);

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored?.alertEmitted).toBe(true);
  });
});

describe("recordFailure", () => {
  const bucket = "businessAccounts:1";
  const provider = "bricklink" as const;
  const now = new Date("2025-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("increments consecutive failures", async () => {
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            consecutiveFailures: 2,
          }),
        ],
      },
    });

    const result = await (recordFailure as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      consecutiveFailures: 3,
      circuitBreakerOpen: false,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored?.consecutiveFailures).toBe(3);
  });

  it("opens circuit breaker after threshold failures", async () => {
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            consecutiveFailures: CIRCUIT_BREAKER_FAILURE_THRESHOLD - 1,
          }),
        ],
      },
    });

    const result = await (recordFailure as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      consecutiveFailures: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      circuitBreakerOpen: true,
    });
    expect(result.circuitBreakerOpenUntil).toBeGreaterThan(now.getTime());

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored?.circuitBreakerOpenUntil).toBeDefined();
  });

  it("creates record if none exists", async () => {
    const ctx = createConvexTestContext();

    const result = await (recordFailure as any)._handler(ctx as any, { bucket, provider });

    expect(result.consecutiveFailures).toBe(1);

    const stored = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    expect(stored).toBeDefined();
    expect(stored?.consecutiveFailures).toBe(1);
  });
});

describe("resetFailures", () => {
  const bucket = "businessAccounts:1";
  const provider = "bricklink" as const;
  const now = new Date("2025-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("resets consecutive failures to zero", async () => {
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            consecutiveFailures: 3,
          }),
        ],
      },
    });

    const result = await (resetFailures as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      reset: true,
      circuitBreakerWasOpen: false,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored?.consecutiveFailures).toBe(0);
  });

  it("closes circuit breaker", async () => {
    const circuitBreakerOpenUntil = now.getTime() + 5 * 60 * 1000;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          createRateLimitRecord({
            _id: "rateLimits:1",
            bucket,
            provider,
            consecutiveFailures: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            circuitBreakerOpenUntil,
          }),
        ],
      },
    });

    const result = await (resetFailures as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      reset: true,
      circuitBreakerWasOpen: true,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored?.consecutiveFailures).toBe(0);
    expect(stored?.circuitBreakerOpenUntil).toBeUndefined();
  });

  it("returns reset: false if no record exists", async () => {
    const ctx = createConvexTestContext();

    const result = await (resetFailures as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      reset: false,
    });
  });
});

describe("getRateLimitConfig", () => {
  const expectedConfigs: Record<Provider, RateLimitConfig> = {
    bricklink: {
      capacity: 210,
      windowDurationMs: 60 * 60 * 1000,
      alertThreshold: 0.8,
    },
    brickowl: {
      capacity: 200,
      windowDurationMs: 60 * 1000,
      alertThreshold: 0.8,
    },
    rebrickable: {
      capacity: 60,
      windowDurationMs: 60 * 1000,
      alertThreshold: 0.8,
    },
  };

  for (const provider of Object.keys(expectedConfigs) as Provider[]) {
    it(`returns the documented config for ${provider}`, () => {
      expect(getRateLimitConfig(provider)).toEqual(expectedConfigs[provider]);
    });
  }
});

describe("providerValidator", () => {
  const extractProviders = () =>
    new Set(providerValidator.members.map((member) => (member as { value: string }).value));

  it("lists the supported providers in the union", () => {
    const allowed = extractProviders();
    expect(allowed).toEqual(new Set(["bricklink", "brickowl", "rebrickable"]));
  });

  it("does not include unsupported providers", () => {
    const allowed = extractProviders();
    expect(allowed.has("unsupported")).toBe(false);
  });
});
