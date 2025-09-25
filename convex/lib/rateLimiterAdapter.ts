// Minimal adapter interface so call sites can depend on a common surface
export interface KeyedRateLimiter {
  consume(args: { key: string; capacity: number; intervalMs: number }): void | Promise<void>;
}

// Adapter for the in-memory limiter (already matches the shape)
export {
  RateLimiter as InMemoryRateLimiter,
  sharedRateLimiter,
} from "./external/inMemoryRateLimiter";
