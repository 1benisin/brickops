"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CatalogDetailDrawer } from "@/components/catalog/catalog-detail-drawer";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { CatalogResultCard } from "@/components/catalog/catalog-result-card";
import { CatalogSearchBar, type FreshnessFilter } from "@/components/catalog/catalog-search-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchStore } from "@/hooks/useSearchStore";
import type { CatalogPart, CatalogPartDetails } from "@/lib/services/catalog-service";

const initialPaginationState = () => ({
  page: 1,
  currentCursor: null as string | null,
  cursorMap: new Map<number, string | null>([[1, null]]),
});

const sortNumericValues = (values: number[]) => [...values].sort((a, b) => a - b);

type PaginationState = ReturnType<typeof initialPaginationState>;

type SearchArgs = {
  query: string;
  colors?: number[];
  categories?: number[];
  pageSize?: number;
  cursor?: string;
  sort?: { field: "name" | "marketPrice" | "lastUpdated"; direction: "asc" | "desc" };
  includeMetadata?: boolean;
  freshness?: FreshnessFilter;
};

export default function CatalogPage() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id as Id<"businessAccounts"> | undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const updates: Partial<
      Pick<
        ReturnType<typeof useSearchStore.getState>,
        "query" | "selectedColors" | "selectedCategories" | "pageSize" | "sort" | "freshness"
      >
    > = {};

    const qParam = params.get("q");
    if (qParam !== null) {
      updates.query = qParam;
    }

    const colorsParam = params.get("colors");
    if (colorsParam) {
      const parsed = colorsParam
        .split(",")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => !Number.isNaN(value));
      if (parsed.length) {
        updates.selectedColors = parsed;
      }
    }

    const categoriesParam = params.get("categories");
    if (categoriesParam) {
      const parsed = categoriesParam
        .split(",")
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => !Number.isNaN(value));
      if (parsed.length) {
        updates.selectedCategories = parsed;
      }
    }

    const pageSizeParam = params.get("pageSize");
    if (pageSizeParam) {
      const parsed = Number.parseInt(pageSizeParam, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        updates.pageSize = parsed;
      }
    }

    const sortParam = params.get("sort");
    if (sortParam) {
      const [field, direction] = sortParam.split(":");
      if (field && direction && (direction === "asc" || direction === "desc")) {
        if (field === "name" || field === "marketPrice" || field === "lastUpdated") {
          updates.sort = { field, direction } as typeof updates.sort;
        }
      }
    }

    const freshnessParam = params.get("freshness");
    if (freshnessParam && ["all", "fresh", "stale", "expired"].includes(freshnessParam)) {
      updates.freshness = freshnessParam as FreshnessFilter;
    }

    if (Object.keys(updates).length > 0) {
      useSearchStore.getState().setFilters(updates);
    }
  }, []);

  const {
    query,
    selectedColors,
    selectedCategories,
    pageSize,
    sort,
    freshness,
    setQuery,
    toggleColor,
    toggleCategory,
    setPageSize,
    setSort,
    setFreshness,
    resetFilters,
  } = useSearchStore((state) => ({
    query: state.query,
    selectedColors: state.selectedColors,
    selectedCategories: state.selectedCategories,
    pageSize: state.pageSize,
    sort: state.sort,
    freshness: state.freshness,
    setQuery: state.setQuery,
    toggleColor: state.toggleColor,
    toggleCategory: state.toggleCategory,
    setPageSize: state.setPageSize,
    setSort: state.setSort,
    setFreshness: state.setFreshness,
    resetFilters: state.resetFilters,
  }));
  const [pagination, setPagination] = useState<PaginationState>(initialPaginationState);

  const sortField = sort?.field ?? null;
  const sortDirection = sort?.direction ?? null;

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        query,
        colors: sortNumericValues(selectedColors),
        categories: sortNumericValues(selectedCategories),
        pageSize,
        sortField,
        sortDirection,
        freshness,
      }),
    [query, selectedColors, selectedCategories, pageSize, sortField, sortDirection, freshness],
  );

  const previousFilterSignature = useRef<string | null>(null);

  useEffect(() => {
    if (previousFilterSignature.current === filterSignature) {
      return;
    }

    previousFilterSignature.current = filterSignature;
    setPagination(initialPaginationState());
  }, [filterSignature]);

  const searchArgs: SearchArgs | "skip" = useMemo(() => {
    if (!businessAccountId) return "skip";
    return {
      query,
      colors: selectedColors.length ? selectedColors : undefined,
      categories: selectedCategories.length ? selectedCategories : undefined,
      pageSize,
      cursor: pagination.currentCursor ?? undefined,
      sort: sort ?? undefined,
      includeMetadata: true,
      freshness,
    };
  }, [
    businessAccountId,
    query,
    selectedColors,
    selectedCategories,
    pageSize,
    pagination.currentCursor,
    sort,
    freshness,
  ]);

  const searchResult = useQuery(api.functions.catalog.searchParts, searchArgs);
  const searchLoading = Boolean(businessAccountId) && searchResult === undefined;

  const colors = searchResult?.metadata?.colors ?? [];
  const categories = searchResult?.metadata?.categories ?? [];
  const parts = searchResult?.parts ?? [];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<CatalogPart | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshingDetail, setRefreshingDetail] = useState(false);

  const detailArgs = useMemo(() => {
    if (!selectedPart || !drawerOpen) return "skip";
    return {
      partNumber: selectedPart.partNumber,
      fetchFromBricklink: false,
    };
  }, [selectedPart, drawerOpen]);

  const detailResult = useQuery(api.functions.catalog.getPartDetails, detailArgs);
  const detailLoading = drawerOpen && selectedPart !== null && detailResult === undefined;
  const detailData = (detailResult as CatalogPartDetails | undefined) ?? null;

  const refreshCatalog = useMutation(api.functions.catalog.refreshCatalogEntries);

  const handleSelectPart = (part: CatalogPart) => {
    setSelectedPart(part);
    setDrawerOpen(true);
    setDetailError(null);
  };

  const handleNextPage = () => {
    if (!searchResult?.pagination?.hasNextPage) return;
    const nextCursor = searchResult.pagination.cursor;
    if (!nextCursor) return;

    setPagination((prev) => {
      const nextPage = prev.page + 1;
      const nextMap = new Map(prev.cursorMap);
      nextMap.set(nextPage, nextCursor);

      return {
        page: nextPage,
        currentCursor: nextCursor,
        cursorMap: nextMap,
      };
    });
  };

  const handlePreviousPage = () => {
    if (pagination.page <= 1) return;
    setPagination((prev) => {
      const nextPage = Math.max(1, prev.page - 1);
      const nextCursor = prev.cursorMap.get(nextPage) ?? null;
      return {
        page: nextPage,
        currentCursor: nextCursor,
        cursorMap: prev.cursorMap,
      };
    });
  };

  const handleRefreshDetail = async () => {
    if (!selectedPart) return;
    try {
      setRefreshingDetail(true);
      await refreshCatalog({ partNumber: selectedPart.partNumber, limit: 1 });
      setDetailError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh part details";
      setDetailError(message);
    } finally {
      setRefreshingDetail(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedColors.length) params.set("colors", selectedColors.join(","));
    if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
    if (pageSize !== 25) params.set("pageSize", String(pageSize));
    if (sort) params.set("sort", `${sort.field}:${sort.direction}`);
    if (freshness !== "all") params.set("freshness", freshness);
    if (pagination.page > 1) params.set("page", String(pagination.page));

    const search = params.toString();
    const nextUrl = search ? `?${search}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [query, selectedColors, selectedCategories, pageSize, sort, freshness, pagination.page]);

  return (
    <div className="flex flex-col gap-6" data-testid="catalog-page">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Search the BrickOps catalog, refine by color or category, and inspect detailed Bricklink
            data.
          </p>
        </div>

        <CatalogSearchBar
          query={query}
          onQueryChange={setQuery}
          onSubmit={() => undefined}
          isLoading={searchLoading}
          freshness={freshness}
          onFreshnessChange={setFreshness}
        />

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <CatalogFilters
            colors={colors}
            categories={categories}
            loading={searchLoading && parts.length === 0}
            onToggleColor={toggleColor}
            onToggleCategory={toggleCategory}
            onReset={() => {
              resetFilters();
              setPagination(initialPaginationState());
            }}
          />

          <section className="space-y-4" data-testid="catalog-results">
            <header className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {searchResult?.metadata?.summary?.totalParts ?? 0} parts available
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="catalog-page-size" className="text-xs text-muted-foreground">
                  Page size
                </label>
                <select
                  id="catalog-page-size"
                  data-testid="catalog-page-size"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSort(
                      sort?.field === "marketPrice" && sort.direction === "desc"
                        ? null
                        : { field: "marketPrice", direction: "desc" },
                    )
                  }
                  data-testid="catalog-sort-price"
                >
                  Sort by price
                </Button>
              </div>
            </header>

            {searchLoading && parts.length === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-56 w-full rounded-lg" />
                ))}
              </div>
            ) : parts.length === 0 ? (
              <div
                className="rounded-md border border-border bg-muted/40 p-6 text-sm text-muted-foreground"
                data-testid="catalog-empty-state"
              >
                No results found. Try broadening your search or resetting filters.
              </div>
            ) : (
              <div
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                data-testid="catalog-results-grid"
              >
                {parts.map((part) => (
                  <CatalogResultCard key={part._id} part={part} onSelect={handleSelectPart} />
                ))}
              </div>
            )}

            <footer className="flex items-center justify-between border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={pagination.page <= 1 || searchLoading}
                data-testid="catalog-prev-page"
              >
                Previous
              </Button>
              <div className="text-xs text-muted-foreground">
                Page {pagination.page}
                {searchResult?.pagination?.isDone ? " · End of results" : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!searchResult?.pagination?.hasNextPage || searchLoading}
                data-testid="catalog-next-page"
              >
                Next
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <CatalogDetailDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedPart(null);
            setDetailError(null);
          }
        }}
        part={selectedPart}
        details={detailData}
        loading={detailLoading}
        onRefresh={handleRefreshDetail}
        refreshLoading={refreshingDetail}
        error={detailError}
      />
    </div>
  );
}
