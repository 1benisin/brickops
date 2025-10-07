import type { Id } from "@/convex/_generated/dataModel";
import type {
  SearchPartsResult,
  Part as ValidatorPart,
  PartDetailsResult,
} from "@/convex/validators/catalog";

export type CatalogSortField = "name" | "lastUpdated";
export type CatalogSortDirection = "asc" | "desc";

export type CatalogSortState = {
  field: CatalogSortField;
  direction: CatalogSortDirection;
};

// Prefer inferred types from shared validators
export type CatalogSearchResult = SearchPartsResult;
export type CatalogPart = ValidatorPart;
export type CatalogPartDetails = PartDetailsResult;

export type RefreshResult = unknown;

export type BusinessAccountId = Id<"businessAccounts">;
