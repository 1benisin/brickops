/**
 * Freshness Utilities for Bricklink Catalog Data
 *
 * This module provides utilities for checking data freshness and determining
 * when catalog data needs to be refreshed from BrickLink.
 *
 * Note: Catalog data refreshing is handled by the self-scheduling
 * ensureCatalogPart pattern in convex/catalog/ensure.ts
 *
 * The actual persistence mutations for catalog data are in catalog/mutations.ts
 * following the module isolation pattern where marketplace modules only handle
 * API communication and response transformation.
 */

export { isStale } from "../freshness";

// ============================================================================
// CONSTANTS
// ============================================================================

// Refresh priorities (lower number = higher priority)
export const REFRESH_PRIORITY = {
  HIGH: 1, // Parts (user is viewing)
  MEDIUM: 2, // Colors, categories
  LOW: 3, // Prices, bulk updates
} as const;
