import {
  requireActiveUser as requireActiveUserInternal,
  type RequireUserReturn,
} from "../users/authorization";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type { RequireUserReturn };

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
