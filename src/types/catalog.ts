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
 *   type SearchResult = FunctionReturnType<typeof api.catalog.queries.searchParts>;
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
export type CatalogSearchResult = FunctionReturnType<typeof api.catalog.parts.searchParts>;

// Individual part in search results
export type CatalogPart = CatalogSearchResult["page"][0];

// Overlay data type (from getPartOverlay validator)
export type CatalogPartOverlay = FunctionReturnType<typeof api.catalog.parts.getPartOverlay>;

// Color data type (from getColors validator)
export type CatalogColor = FunctionReturnType<typeof api.catalog.colors.getColors>[0];

// Category data type (from getCategories validator)
export type CatalogCategory = FunctionReturnType<typeof api.catalog.categories.getCategories>[0];

// ============================================================================
// HOOK RESPONSE TYPES (Derived from status-aware queries)
// ============================================================================

// Part query response (from getPart query)
type PartQueryResponse = FunctionReturnType<typeof api.catalog.parts.getPart>;
export type Part = NonNullable<PartQueryResponse["data"]>;
export type ResourceStatus = PartQueryResponse["status"]; // All queries use the same status type

// Part colors query response (from getPartColors query)
type PartColorsQueryResponse = FunctionReturnType<typeof api.catalog.colors.getPartColors>;
export type PartColor = PartColorsQueryResponse["data"][0];

// Price guide query response (from getPriceGuide query)
type PriceGuideQueryResponse = FunctionReturnType<typeof api.catalog.prices.getPriceGuide>;
export type PriceGuide = NonNullable<PriceGuideQueryResponse["data"]>;

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
