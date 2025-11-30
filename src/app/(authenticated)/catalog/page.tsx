"use client";

import { useEffect, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PartDetailDrawer } from "@/components/catalog/PartDetailDrawer";
import { CatalogResultCard } from "@/components/catalog/CatalogResultCard";
import { CatalogSearchBar } from "@/components/catalog/CatalogSearchBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchStore } from "@/hooks/useSearchStore";
import type { CatalogPart } from "@/types/catalog";

// Removed manual pagination state - now using usePaginatedQuery hook
// Removed sortNumericValues (no longer needed with simplified search fields)

export default function CatalogPage() {
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id as Id<"businessAccounts"> | undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    type UrlUpdates = Partial<
      Pick<
        ReturnType<typeof useSearchStore.getState>,
        "sortLocation" | "partTitle" | "partId" | "pageSize" | "sort"
      >
    >;
    const updates: UrlUpdates = {};

    const locationParam = params.get("location");
    if (locationParam !== null) {
      updates.sortLocation = locationParam;
    }

    const nameParam = params.get("name");
    if (nameParam !== null) {
      updates.partTitle = nameParam;
    }

    const partIdParam = params.get("partId");
    if (partIdParam !== null) {
      updates.partId = partIdParam;
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
        if (field === "name" || field === "lastUpdated") {
          updates.sort = { field, direction } as typeof updates.sort;
        }
      }
    }

    // Freshness is no longer a user-facing filter; ignore any URL param
    // Page parameter is no longer used with Convex pagination

    if (Object.keys(updates).length > 0) {
      useSearchStore.getState().setFilters(updates);
    }
  }, []);

  const {
    sortLocation,
    partTitle,
    partId,
    pageSize,
    setSortLocation,
    setPartTitle,
    setPartId,
    setPageSize,
  } = useSearchStore((state) => ({
    sortLocation: state.sortLocation,
    partTitle: state.partTitle,
    partId: state.partId,
    pageSize: state.pageSize,
    setSortLocation: state.setSortLocation,
    setPartTitle: state.setPartTitle,
    setPartId: state.setPartId,
    setPageSize: state.setPageSize,
    resetFilters: state.resetFilters,
  }));

  // Clear location search when preference is disabled
  useEffect(() => {
    const useLocations =
      currentUser?.user && "useSortLocations" in currentUser.user
        ? (currentUser.user as { useSortLocations?: boolean }).useSortLocations ?? false
        : false;
    if (!useLocations && sortLocation) {
      // User disabled locations but has active location search - clear it
      setSortLocation("");
    }
  }, [currentUser?.user, sortLocation, setSortLocation]);

  const searchArgs = useMemo(() => {
    if (!businessAccountId) return "skip";
    return {
      sortLocation: sortLocation?.trim() || undefined,
      partId: partId?.trim() || undefined,
      partTitle: partTitle?.trim() || undefined,
    };
  }, [businessAccountId, sortLocation, partId, partTitle]);

  const {
    results,
    status: paginationStatus,
    loadMore,
    isLoading: searchLoading,
  } = usePaginatedQuery(api.catalog.parts.searchParts, searchArgs, {
    initialNumItems: pageSize,
  });

  const parts = results ?? [];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPartNumber, setSelectedPartNumber] = useState<string | null>(null);

  const handleSelectPart = (part: CatalogPart) => {
    setSelectedPartNumber(part.partNumber);
    setDrawerOpen(true);
  };

  const handleLoadMore = () => {
    if (paginationStatus === "CanLoadMore") {
      loadMore(pageSize);
    }
  };

  const hasMoreResults = paginationStatus === "CanLoadMore";
  const isLoading = paginationStatus === "LoadingFirstPage" || paginationStatus === "LoadingMore";
  const isExhausted = paginationStatus === "Exhausted";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (sortLocation) params.set("location", sortLocation);
    if (partTitle) params.set("name", partTitle);
    if (partId) params.set("partId", partId);
    if (pageSize !== 25) params.set("pageSize", String(pageSize));

    const search = params.toString();
    const desiredSearch = search ? `?${search}` : "";
    const currentSearch = window.location.search;
    if (currentSearch !== desiredSearch) {
      const nextUrl = desiredSearch
        ? `${window.location.pathname}${desiredSearch}`
        : window.location.pathname;
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [sortLocation, partTitle, partId, pageSize]);

  return (
    <div className="flex flex-col gap-6" data-testid="catalog-page">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Search the BrickOps catalog and inspect detailed Bricklink data.
          </p>
        </div>

        <CatalogSearchBar
          sortLocation={sortLocation}
          partTitle={partTitle}
          partId={partId}
          onSortLocationChange={setSortLocation}
          onPartTitleChange={setPartTitle}
          onPartIdChange={setPartId}
          onSubmit={() => undefined}
          isLoading={searchLoading}
          showLocationSearch={
            currentUser?.user && "useSortLocations" in currentUser.user
              ? (currentUser.user as { useSortLocations?: boolean }).useSortLocations ?? false
              : false
          }
        />

        <div className="grid gap-6 lg:grid-cols-1">
          <section className="space-y-4" data-testid="catalog-results">
            <header className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Results</p>
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
              </div>
            </header>

            {isLoading && parts.length === 0 ? (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] xl:grid-cols-10">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-40 w-full rounded-lg" />
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
                className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] xl:grid-cols-10"
                data-testid="catalog-results-grid"
              >
                {parts.map((part) => (
                  <CatalogResultCard
                    key={part.partNumber}
                    part={part}
                    onSelect={handleSelectPart}
                  />
                ))}
              </div>
            )}

            <footer className="flex items-center justify-between border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {isLoading && "Loading..."}
                {hasMoreResults && "Load more results available"}
                {isExhausted && "End of results"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={!hasMoreResults || isLoading}
                data-testid="catalog-load-more"
              >
                Load More
              </Button>
            </footer>
          </section>
        </div>
      </div>

      <PartDetailDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedPartNumber(null);
          }
        }}
        partNumber={selectedPartNumber}
      />
    </div>
  );
}
