/**
 * Catalog Type Definitions
 *
 * IMPORTANT FOR FUTURE DEVELOPERS:
 * ================================
 * Do NOT manually define types that match backend return values!
 *
 * Instead, use the Infer utility from convex/values to extract types directly
 * from the validated backend function returns. This ensures:
 * 1. Single source of truth (backend validators define the contract)
 * 2. Type safety guaranteed at runtime (not just compile time)
 * 3. No drift between frontend types and backend returns
 * 4. Automatic updates when backend changes
 *
 * Example:
 *   import { api } from "@/convex/_generated/api";
 *   import type { FunctionReturnType } from "convex/server";
 *
 *   // ✅ GOOD: Type derived from backend validator
 *   type SearchResult = FunctionReturnType<typeof api.catalog.searchParts>;
 *   type PartFromSearch = SearchResult["page"][0];
 *
 *   // ❌ BAD: Manually defined type that can drift
 *   type SearchResult = { page: Array<{...}>, isDone: boolean, ... };
 *
 * See convex/catalog.ts for the source validators.
 */

import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

// ============================================================================
// TYPES DERIVED FROM BACKEND VALIDATORS (Single Source of Truth)
// ============================================================================

// Search results type (from searchParts validator)
export type CatalogSearchResult = FunctionReturnType<typeof api.catalog.searchParts>;

// Individual part in search results
export type CatalogPart = CatalogSearchResult["page"][0];

// Part details type (from getPartDetails validator)
export type CatalogPartDetails = FunctionReturnType<typeof api.catalog.getPartDetails>;

// Overlay data type (from getPartOverlay validator)
export type CatalogPartOverlay = FunctionReturnType<typeof api.catalog.getPartOverlay>;

// Color data type (from getColors validator)
export type CatalogColor = FunctionReturnType<typeof api.catalog.getColors>[0];

// Category data type (from getCategories validator)
export type CatalogCategory = FunctionReturnType<typeof api.catalog.getCategories>[0];

// ============================================================================
// FRONTEND-ONLY TYPES (Not derived from backend)
// ============================================================================

export type CatalogSortField = "name" | "lastUpdated";
export type CatalogSortDirection = "asc" | "desc";

export type CatalogSortState = {
  field: CatalogSortField;
  direction: CatalogSortDirection;
};

export type RefreshResult = unknown;

export type BusinessAccountId = Id<"businessAccounts">;
