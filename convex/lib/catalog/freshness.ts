import { ConvexError } from "convex/values";

export type FreshnessState = "fresh" | "stale" | "background" | "expired";

const DAY_MS = 24 * 60 * 60 * 1000;
export const FRESH_WINDOW_MS = 30 * DAY_MS;
export const BACKGROUND_WINDOW_MS = 60 * DAY_MS;

export function computeFreshness(
  lastFetchedAt: number | null | undefined,
  now: number = Date.now(),
): FreshnessState {
  if (!lastFetchedAt) {
    return "expired";
  }

  const age = now - lastFetchedAt;

  if (age < 0) {
    throw new ConvexError("Invalid lastFetchedAt timestamp");
  }

  if (age <= FRESH_WINDOW_MS) {
    return "fresh";
  }

  if (age <= BACKGROUND_WINDOW_MS) {
    return "stale";
  }

  return "expired";
}

export function computeNextRefreshSuggestion(
  state: FreshnessState,
  lastFetchedAt: number | null | undefined,
  now: number = Date.now(),
) {
  if (!lastFetchedAt) {
    return {
      nextRefreshAt: now,
      windowMs: 0,
      reason: "never-fetched",
    } as const;
  }

  switch (state) {
    case "fresh": {
      const nextRefreshAt = lastFetchedAt + FRESH_WINDOW_MS;
      return {
        nextRefreshAt,
        windowMs: Math.max(0, nextRefreshAt - now),
        reason: "fresh-window",
      } as const;
    }
    case "stale": {
      const nextRefreshAt = lastFetchedAt + BACKGROUND_WINDOW_MS;
      return {
        nextRefreshAt,
        windowMs: Math.max(0, nextRefreshAt - now),
        reason: "stale-window",
      } as const;
    }
    case "background": {
      return {
        nextRefreshAt: now + 5 * 60 * 1000,
        windowMs: 5 * 60 * 1000,
        reason: "background-refresh",
      } as const;
    }
    case "expired":
    default:
      return {
        nextRefreshAt: now,
        windowMs: 0,
        reason: "expired",
      } as const;
  }
}

export function applyBackgroundState(state: FreshnessState): FreshnessState {
  if (state === "stale" || state === "expired") {
    return "background";
  }
  return state;
}

export function isExpired(state: FreshnessState): boolean {
  return state === "expired";
}

export function isStaleOrWorse(state: FreshnessState): boolean {
  return state === "stale" || state === "background" || state === "expired";
}
