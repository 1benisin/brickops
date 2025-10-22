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

/**
 * Rate limit configurations per provider
 *
 * BrickLink: 5,000 requests/day documented limit
 *   - Converted to hourly: 210 requests/hour (5,040/day with buffer)
 *
 * BrickOwl: No published global limit, using conservative estimate
 *   - Bulk endpoint limit: 200 requests/minute (strictest documented)
 *   - Applied to all endpoints for safety
 */
export const RATE_LIMIT_CONFIGS: Record<MarketplaceProvider, RateLimitConfig> = {
  bricklink: {
    capacity: 210, // requests per hour
    windowDurationMs: 60 * 60 * 1000, // 1 hour
    alertThreshold: 0.8, // Alert at 80% (168 requests)
  },
  brickowl: {
    capacity: 200, // requests per minute
    windowDurationMs: 60 * 1000, // 1 minute
    alertThreshold: 0.8, // Alert at 80% (160 requests)
  },
};

/**
 * Get rate limit config for a specific provider
 */
export function getRateLimitConfig(provider: MarketplaceProvider): RateLimitConfig {
  return RATE_LIMIT_CONFIGS[provider];
}
