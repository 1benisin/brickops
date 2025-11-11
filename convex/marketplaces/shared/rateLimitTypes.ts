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
