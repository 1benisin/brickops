// Plain TypeScript interface describing the shape of rate limit state returned from queries.
export interface RateLimitState {
  windowStart: number;
  requestCount: number;
  capacity: number;
  windowDurationMs: number;
  alertThreshold: number;
  alertEmitted: boolean;
  consecutiveFailures: number;
  circuitBreakerOpenUntil?: number;
}
