/**
 * Timestamp staleness helper used by Bricklink catalog refresh orchestration.
 *
 * If `lastFetched` is missing/0, we treat the data as stale.
 */
export function isStale(lastFetched: number | undefined | null, thresholdMs: number): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > thresholdMs;
}
