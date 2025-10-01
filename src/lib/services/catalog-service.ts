import type { ConvexReactClient } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convexClient";

export type CatalogSortField = "name" | "marketPrice" | "lastUpdated";
export type CatalogSortDirection = "asc" | "desc";

export type CatalogSortState = {
  field: CatalogSortField;
  direction: CatalogSortDirection;
};

export type CatalogPart = {
  _id: Id<"legoPartCatalog">;
  partNumber: string;
  name: string;
  description?: string | null;
  category?: string | null;
  categoryPath: number[];
  categoryPathKey?: string;
  imageUrl?: string | null;
  dataSource: "brickops" | "bricklink" | "manual";
  lastUpdated: number;
  dataFreshness: "fresh" | "stale" | "expired";
  bricklinkPartId?: string | null;
  bricklinkCategoryId?: number | null;
  primaryColorId?: number | null;
  availableColorIds: number[];
  sortGrid?: string | null;
  sortBin?: string | null;
  marketPrice?: number | null;
  marketPriceCurrency?: string | null;
  marketPriceLastSyncedAt?: number | null;
};

export type CatalogFilterColor = {
  id: number;
  name: string;
  rgb?: string | null;
  colorType?: string | null;
  isTransparent: boolean;
  count: number;
  active: boolean;
};

export type CatalogFilterCategory = {
  id: number;
  name: string;
  parentCategoryId?: number;
  path: number[];
  count: number;
  active: boolean;
};

export type CatalogFilterMetadata = {
  colors: CatalogFilterColor[];
  categories: CatalogFilterCategory[];
  summary: {
    totalParts: number;
    totalColors: number;
    totalCategories: number;
  };
};

export type CatalogSearchArgs = {
  businessAccountId: Id<"businessAccounts">;
  query: string;
  colors?: number[];
  categories?: number[];
  pageSize?: number;
  cursor?: string | null;
  sort?: CatalogSortState | null;
  includeMetadata?: boolean;
  freshness?: "fresh" | "stale" | "expired" | "all";
};

export type CatalogSearchResult = {
  parts: CatalogPart[];
  source: "local" | "hybrid";
  searchDurationMs: number;
  pagination: {
    cursor: string | null;
    hasNextPage: boolean;
    pageSize: number;
    fetched: number;
    isDone: boolean;
  };
  metadata?: CatalogFilterMetadata;
};

export type CatalogPartDetails = CatalogPart & {
  source: "local" | "bricklink";
  bricklinkStatus: "skipped" | "refreshed" | "error";
  colorAvailability: Array<{
    colorId: number;
    elementIds: string[];
    isLegacy: boolean;
    color: {
      name: string;
      rgb?: string | null;
      colorType?: string | null;
      isTransparent: boolean;
    } | null;
  }>;
  elementReferences: Array<{
    elementId: string;
    colorId: number;
    designId?: string;
    bricklinkPartId?: string;
  }>;
  marketPricing: {
    amount: number;
    currency: string;
    lastSyncedAt: number | null;
  } | null;
  bricklinkSnapshot?: Record<string, unknown>;
};

export type RefreshResult = {
  refreshed: number;
  errors: string[];
};

export class CatalogService {
  private readonly client: ConvexReactClient;

  constructor(client: ConvexReactClient = getConvexClient()) {
    this.client = client;
  }

  async searchParts(args: CatalogSearchArgs): Promise<CatalogSearchResult> {
    return this.client.query(api.functions.catalog.searchParts, {
      query: args.query,
      colors: args.colors,
      categories: args.categories,
      pageSize: args.pageSize,
      cursor: args.cursor ?? undefined,
      sort: args.sort ?? undefined,
      includeMetadata: args.includeMetadata,
      freshness: args.freshness,
    });
  }

  async getFilters(
    businessAccountId: Id<"businessAccounts">,
    state: {
      selectedColors?: number[];
      selectedCategories?: number[];
    },
  ): Promise<CatalogFilterMetadata> {
    return this.client.query(api.functions.catalog.getCatalogFilters, {
      selectedColors: state.selectedColors,
      selectedCategories: state.selectedCategories,
    });
  }

  async getPartDetails(
    partNumber: string,
    options: { fetchFromBricklink?: boolean } = {},
  ): Promise<CatalogPartDetails> {
    return this.client.query(api.functions.catalog.getPartDetails, {
      partNumber,
      fetchFromBricklink: options.fetchFromBricklink,
    });
  }

  async refresh(limit?: number): Promise<RefreshResult> {
    return this.client.mutation(api.functions.catalog.refreshCatalogEntries, {
      limit,
    });
  }
}
