/**
 * Rate Limit Configuration for Marketplace Providers
 * Single source of truth for API rate limit values
 */

export type MarketplaceProvider = "bricklink" | "brickowl";

export interface RateLimitConfig {
  capacity: number;
  windowDurationMs: number;
  alertThreshold: number;
}

export const RATE_LIMIT_CONFIGS: Record<MarketplaceProvider, RateLimitConfig> = {
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
};

export function getRateLimitConfig(provider: MarketplaceProvider): RateLimitConfig {
  return RATE_LIMIT_CONFIGS[provider];
}
