/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeToken } from "@/convex/ratelimiter/consume";
import { getRateLimitConfig } from "@/convex/ratelimiter/rateLimitConfig";
import type { RateLimitConfig } from "@/convex/ratelimiter/schema";
import { providerValidator, type Provider } from "@/convex/ratelimiter/schema";
import { createConvexTestContext } from "@/test-utils/convex-test-context";

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
      granted: true,
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
    expect(stored?.createdAt).toBeDefined();
  });

  it("consumes a token when bucket still has remaining capacity in the current window", async () => {
    const config = getRateLimitConfig(provider);
    const seededRemaining = 5;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          {
            _id: "rateLimits:1",
            bucket,
            provider,
            capacity: config.capacity,
            windowMs: config.windowDurationMs,
            remaining: seededRemaining,
            resetAt: now.getTime() + config.windowDurationMs,
            updatedAt: now.getTime() - 10_000,
            createdAt: now.getTime() - 20_000,
          },
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      granted: true,
      remaining: seededRemaining - 1,
      resetAt: now.getTime() + config.windowDurationMs,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: seededRemaining - 1,
      resetAt: now.getTime() + config.windowDurationMs,
      updatedAt: now.getTime(),
      createdAt: now.getTime() - 20_000,
    });
  });

  it("denies a token when the bucket is empty in the current window", async () => {
    const config = getRateLimitConfig(provider);
    const resetAt = now.getTime() + config.windowDurationMs;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          {
            _id: "rateLimits:1",
            bucket,
            provider,
            capacity: config.capacity,
            windowMs: config.windowDurationMs,
            remaining: 0,
            resetAt,
            updatedAt: now.getTime() - 10_000,
            createdAt: now.getTime() - 20_000,
          },
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toEqual({
      granted: false,
      remaining: 0,
      resetAt,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: 0,
      resetAt,
      updatedAt: now.getTime(),
      createdAt: now.getTime() - 20_000,
    });
  });

  it("resets the bucket when the current window has expired", async () => {
    const config = getRateLimitConfig(provider);
    const expiredResetAt = now.getTime() - 1_000;
    const ctx = createConvexTestContext({
      seed: {
        rateLimits: [
          {
            _id: "rateLimits:1",
            bucket,
            provider,
            capacity: config.capacity,
            windowMs: config.windowDurationMs,
            remaining: 0,
            resetAt: expiredResetAt,
            updatedAt: now.getTime() - 10_000,
            createdAt: now.getTime() - 20_000,
          },
        ],
      },
    });

    const result = await (consumeToken as any)._handler(ctx as any, { bucket, provider });

    expect(result).toMatchObject({
      granted: true,
      remaining: config.capacity - 1,
      resetAt: now.getTime() + config.windowDurationMs,
    });

    const stored = await ctx.db.get("rateLimits:1");
    expect(stored).toMatchObject({
      remaining: config.capacity - 1,
      resetAt: now.getTime() + config.windowDurationMs,
      updatedAt: now.getTime(),
      createdAt: now.getTime() - 20_000,
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
