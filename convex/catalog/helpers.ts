import {
  requireActiveUser as requireActiveUserInternal,
  type RequireUserReturn,
} from "../users/authorization";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type { RequireUserReturn };

// ============================================================================
// FRESHNESS CONSTANTS
// ============================================================================

/** Default freshness threshold in milliseconds (30 days) */
export const DEFAULT_FRESHNESS_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// FRESHNESS HELPERS
// ============================================================================

/**
 * Check if a timestamp is within the freshness window.
 * Returns true if data is fresh, false if stale or missing.
 *
 * @param lastFetched - Timestamp when data was last fetched (epoch ms)
 * @param thresholdMs - Freshness threshold in milliseconds (default: 30 days)
 */
export function isFresh(
  lastFetched: number | undefined,
  thresholdMs: number = DEFAULT_FRESHNESS_THRESHOLD_MS,
): boolean {
  if (lastFetched === undefined || lastFetched === 0) {
    return false;
  }
  return Date.now() - lastFetched < thresholdMs;
}

/**
 * Check if a global color entry is complete with BrickOwl mapping.
 * Returns true if:
 * - Color exists in the colors table
 * - Color data is fresh
 * - brickowlColorId is defined (not undefined) - can be null if checked but not found
 *
 * @param color - The color document from the colors table (can be null if not found)
 * @param thresholdMs - Freshness threshold in milliseconds (default: 30 days)
 */
export function isColorComplete(
  color: { lastFetched: number; brickowlColorId?: number | null } | null,
  thresholdMs: number = DEFAULT_FRESHNESS_THRESHOLD_MS,
): boolean {
  if (!color) {
    return false;
  }
  // brickowlColorId must be defined (can be null = "checked but not found", which is complete)
  // undefined means we haven't attempted to look it up yet
  if (color.brickowlColorId === undefined) {
    return false;
  }
  return isFresh(color.lastFetched, thresholdMs);
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Ensures user is authenticated, active, and linked to a business account
 * Helper function - not a Convex function
 */
export async function requireActiveUser(...args: Parameters<typeof requireActiveUserInternal>) {
  return requireActiveUserInternal(...args);
}

// ============================================================================
// URL HELPERS
// ============================================================================

/**
 * Convert protocol-relative URLs (starting with //) to absolute HTTPS URLs
 * This is required for Next.js Image component compatibility
 * Helper function - not a Convex function
 */
export function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== "string") {
    return undefined;
  }

  // Convert protocol-relative URLs to HTTPS
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  return url;
}
