/**
 * Rate Limit Configuration for API Providers
 * Single source of truth for API rate limit values
 */

import type { Provider } from "./schema";
import type { RateLimitConfig } from "./schema";

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
