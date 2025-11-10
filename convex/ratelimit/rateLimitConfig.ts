/**
 * Rate Limit Configuration for Marketplace Providers
 * Single source of truth for API rate limit values
 */

import { Infer, v } from "convex/values";

export const providerValidator = v.union(
  v.literal("bricklink"),
  v.literal("brickowl"),
  v.literal("rebrickable"),
);
export type Provider = Infer<typeof providerValidator>;

export interface RateLimitConfig {
  capacity: number;
  windowDurationMs: number;
  alertThreshold: number;
}

export const RATE_LIMIT_CONFIGS: Record<Provider, RateLimitConfig> = {
  bricklink: {
    capacity: 210, // requests per hour
    windowDurationMs: 60 * 60 * 1000, // 1 hour
    alertThreshold: 0.8,
  },
  brickowl: {
    capacity: 200, // requests per minute
    windowDurationMs: 60 * 1000, // 1 minute
    alertThreshold: 0.8,
  },
  rebrickable: {
    capacity: 60, // requests per minute (1 req/sec average)
    windowDurationMs: 60 * 1000, // 1 minute
    alertThreshold: 0.8,
  },
};

export function getRateLimitConfig(provider: Provider): RateLimitConfig {
  return RATE_LIMIT_CONFIGS[provider];
}
