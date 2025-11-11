const DAY_MS = 24 * 60 * 60 * 1000;

export const THIRTY_DAYS_MS = 30 * DAY_MS;

export function isStale(lastFetched: number | undefined, maxAgeMs = THIRTY_DAYS_MS): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > maxAgeMs;
}
