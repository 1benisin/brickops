// Plain TypeScript interface describing the shape of rate limit state returned from queries.
export interface RateLimitState {
  capacity: number;
  windowMs: number;
  remaining: number;
  resetAt: number;
}
