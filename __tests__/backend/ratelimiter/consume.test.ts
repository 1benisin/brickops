/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeToken } from "@/convex/ratelimiter/consume";
import { getRateLimitConfig } from "@/convex/ratelimiter/rateLimitConfig";
import type { RateLimitConfig, Provider } from "@/convex/ratelimiter/schema";
import { providerValidator } from "@/convex/ratelimiter/schema";
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
            resetAt: now.getTime() + config.windowDurationMs,
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
            resetAt,
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
            resetAt: expiredResetAt,
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
      resetAt: now.getTime() + config.windowDurationMs,
      updatedAt: now.getTime(),
    });
  });
});

describe("getRateLimitConfig", () => {
  const expectedConfigs: Record<Provider, RateLimitConfig> = {
    bricklink: {
      capacity: 210,
      windowDurationMs: 60 * 60 * 1000,
    },
    brickowl: {
      capacity: 200,
      windowDurationMs: 60 * 1000,
    },
    rebrickable: {
      capacity: 60,
      windowDurationMs: 60 * 1000,
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
