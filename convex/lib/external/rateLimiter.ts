type RateKey = string;

type RateLimit = {
  key: RateKey;
  capacity: number;
  intervalMs: number;
};

export class RateLimiter {
  private readonly buckets = new Map<RateKey, number[]>();

  consume(limit: RateLimit) {
    const now = Date.now();
    const entries = this.buckets.get(limit.key) ?? [];
    const windowStart = now - limit.intervalMs;
    const activeEntries = entries.filter((timestamp) => timestamp > windowStart);

    if (activeEntries.length >= limit.capacity) {
      throw new Error(`Rate limit exceeded for key ${limit.key}`);
    }

    activeEntries.push(now);
    this.buckets.set(limit.key, activeEntries);
  }
}

export const sharedRateLimiter = new RateLimiter();
