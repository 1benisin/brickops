import { useState, useEffect, useCallback, useMemo } from "react";
import type { QuerySpec } from "@/convex/inventory/types";

// QueryResult type - what server returns
export interface QueryResult<TData> {
  items: TData[];
  cursor?: string;
  isDone: boolean;
}

interface UseServerTableOptions<TData> {
  queryFn: (spec: QuerySpec) => Promise<QueryResult<TData>>;
  defaultPageSize?: number;
  defaultSort?: QuerySpec["sort"];
}

export function useServerTable<TData>({
  queryFn,
  defaultPageSize = 25,
  defaultSort = [{ id: "createdAt", desc: true }],
}: UseServerTableOptions<TData>) {
  // Query state
  const [filters, setFilters] = useState<QuerySpec["filters"]>({});
  const [sort, setSort] = useState<QuerySpec["sort"]>(defaultSort);
  const [pagination, setPagination] = useState<QuerySpec["pagination"]>({
    cursor: undefined,
    pageSize: defaultPageSize,
  });

  // Data state
  const [data, setData] = useState<TData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  // Build QuerySpec from state
  const querySpec: QuerySpec = useMemo(
    () => ({
      filters,
      sort,
      pagination,
    }),
    [filters, sort, pagination],
  );

  // Fetch data when query spec changes
  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    queryFn(querySpec)
      .then((result) => {
        if (!cancelled) {
          setData(result.items);
          setHasMore(!result.isDone);
          setNextCursor(result.cursor);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setHasMore(false);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queryFn, querySpec]);

  // Helper functions
  const updateFilters = useCallback((newFilters: QuerySpec["filters"]) => {
    setFilters(newFilters);
    // Reset to first page when filters change
    setPagination((prev) => ({ ...prev, cursor: undefined }));
  }, []);

  const updateSort = useCallback(
    (newSort: QuerySpec["sort"]) => {
      setSort(newSort);
      // Reset to first page when sort changes
      setPagination((prev) => ({ ...prev, cursor: undefined }));
    },
    [],
  );

  // Add method to toggle column sort
  const toggleSort = useCallback(
    (columnId: string) => {
      setSort((prev) => {
        const currentSort = prev.find((s) => s.id === columnId);
        if (currentSort) {
          // Toggle direction: asc -> desc -> remove
          if (currentSort.desc) {
            // Remove from sort (default)
            return prev.filter((s) => s.id !== columnId);
          } else {
            // Change to desc
            return prev.map((s) => (s.id === columnId ? { ...s, desc: true } : s));
          }
        } else {
          // Add new sort (default to asc)
          return [{ id: columnId, desc: false }, ...prev];
        }
      });
      // Reset to first page
      setPagination((prev) => ({ ...prev, cursor: undefined }));
    },
    [],
  );

  const nextPage = useCallback(() => {
    setPagination((prev) => {
      if (nextCursor || hasMore) {
        return { ...prev, cursor: nextCursor };
      }
      return prev;
    });
  }, [nextCursor, hasMore]);

  const previousPage = useCallback(() => {
    // For cursor-based pagination, we'd need to track previous cursors
    // For now, reset to first page
    setPagination((prev) => ({ ...prev, cursor: undefined }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPagination((prev) => ({ ...prev, pageSize: size, cursor: undefined }));
  }, []);

  return {
    // Data
    data,
    isLoading,
    error,
    hasMore,

    // State
    filters,
    sort,
    pagination,

    // Actions
    updateFilters,
    updateSort,
    toggleSort,
    nextPage,
    previousPage,
    setPageSize,
  };
}
