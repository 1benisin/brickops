import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type CatalogSortField = "name" | "marketPrice" | "lastUpdated";
export type CatalogSortDirection = "asc" | "desc";

export type CatalogSortState = {
  field: CatalogSortField;
  direction: CatalogSortDirection;
};

export type CatalogSearchResult = FunctionReturnType<typeof api.functions.catalog.searchParts>;

export type CatalogPart = CatalogSearchResult["parts"][number];

export type CatalogPartDetails = FunctionReturnType<typeof api.functions.catalog.getPartDetails>;

export type RefreshResult = FunctionReturnType<
  typeof api.functions.scriptOps.refreshCatalogEntries
>;

export type BusinessAccountId = Id<"businessAccounts">;
