"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CatalogDetailDrawer } from "@/components/catalog/catalog-detail-drawer";
import { CatalogResultCard } from "@/components/catalog/catalog-result-card";
import { CatalogSearchBar } from "@/components/catalog/catalog-search-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchStore } from "@/hooks/useSearchStore";
import type { CatalogPart, CatalogPartDetails } from "@/types/catalog";

const initialPaginationState = () => ({
  page: 1,
  currentCursor: null as string | null,
  cursorMap: new Map<number, string | null>([[1, null]]),
});

// removed: sortNumericValues (no longer needed with simplified search fields)

type PaginationState = ReturnType<typeof initialPaginationState>;

type SearchArgs = {
  query: string;
  gridBin?: string;
  partId?: string;
  partTitle?: string;
  pageSize?: number;
  cursor?: string;
};

export default function CatalogPage() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id as Id<"businessAccounts"> | undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    type UrlUpdates = Partial<
      Pick<
        ReturnType<typeof useSearchStore.getState>,
        "gridBin" | "partTitle" | "partId" | "pageSize" | "sort"
      >
    >;
    const updates: UrlUpdates = {};

    const binParam = params.get("bin");
    if (binParam !== null) {
      updates.gridBin = binParam;
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
        if (field === "name" || field === "marketPrice" || field === "lastUpdated") {
          updates.sort = { field, direction } as typeof updates.sort;
        }
      }
    }

    // Freshness is no longer a user-facing filter; ignore any URL param

    if (Object.keys(updates).length > 0) {
      useSearchStore.getState().setFilters(updates);
    }
  }, []);

  const {
    gridBin,
    partTitle,
    partId,
    pageSize,
    setGridBin,
    setPartTitle,
    setPartId,
    setPageSize,
    resetFilters,
  } = useSearchStore((state) => ({
    gridBin: state.gridBin,
    partTitle: state.partTitle,
    partId: state.partId,
    pageSize: state.pageSize,
    setGridBin: state.setGridBin,
    setPartTitle: state.setPartTitle,
    setPartId: state.setPartId,
    setPageSize: state.setPageSize,
    resetFilters: state.resetFilters,
  }));
  const [pagination, setPagination] = useState<PaginationState>(initialPaginationState);

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        gridBin,
        partTitle,
        partId,
        pageSize,
      }),
    [gridBin, partTitle, partId, pageSize],
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
      query: "",
      gridBin: gridBin?.trim() || undefined,
      partId: partId?.trim() || undefined,
      partTitle: partTitle?.trim() || undefined,
      pageSize,
      cursor: pagination.currentCursor ?? undefined,
    };
  }, [businessAccountId, gridBin, partId, partTitle, pageSize, pagination.currentCursor]);

  const searchResult = useQuery(api.functions.catalog.searchParts, searchArgs);
  const searchLoading = Boolean(businessAccountId) && searchResult === undefined;

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

  const refreshCatalog = useMutation(api.functions.scriptOps.refreshCatalogEntries);

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
    if (gridBin) params.set("bin", gridBin);
    if (partTitle) params.set("name", partTitle);
    if (partId) params.set("partId", partId);
    if (pageSize !== 25) params.set("pageSize", String(pageSize));
    if (pagination.page > 1) params.set("page", String(pagination.page));

    const search = params.toString();
    const desiredSearch = search ? `?${search}` : "";
    const currentSearch = window.location.search;
    if (currentSearch !== desiredSearch) {
      const nextUrl = desiredSearch
        ? `${window.location.pathname}${desiredSearch}`
        : window.location.pathname;
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [gridBin, partTitle, partId, pageSize, pagination.page]);

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
          gridBin={gridBin}
          partTitle={partTitle}
          partId={partId}
          onGridBinChange={setGridBin}
          onPartTitleChange={setPartTitle}
          onPartIdChange={setPartId}
          onSubmit={() => undefined}
          onClear={() => {
            resetFilters();
            setPagination(initialPaginationState());
          }}
          isLoading={searchLoading}
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

            {searchLoading && parts.length === 0 ? (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
                className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
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
