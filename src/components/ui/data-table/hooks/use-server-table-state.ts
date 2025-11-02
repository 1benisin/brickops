/**
 * useServerTableState Hook
 * 
 * Manages server-side table state (sorting, filtering, pagination) with:
 * - Debouncing for text filters (500ms)
 * - Immediate updates for non-text filters
 * - Conversion between TanStack Table format and QuerySpec format
 * - Automatic pagination reset on filter/sort changes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef, SortingState, ColumnFiltersState, PaginationState } from "@tanstack/react-table";
import { columnFiltersToQuerySpec, querySpecToColumnFilters, shouldDebounceFilter, type QuerySpecFilters } from "../utils/filter-state";
import type { EnhancedColumnMeta } from "../column-definitions";

/**
 * Generic QuerySpec structure
 * Compatible with both OrdersQuerySpec and Inventory QuerySpec
 */
export interface ServerTableQuerySpec {
  filters?: QuerySpecFilters;
  sort: Array<{ id: string; desc: boolean }>;
  pagination: {
    cursor?: string;
    pageSize: number;
  };
}

/**
 * Options for useServerTableState hook
 */
export interface UseServerTableStateOptions<TData> {
  /** Column definitions to determine filter types */
  columns: ColumnDef<TData>[];
  /** Initial sort state */
  defaultSort?: Array<{ id: string; desc: boolean }>;
  /** Default page size */
  defaultPageSize?: number;
  /** Debounce delay for text filters in milliseconds (default: 500) */
  textFilterDebounceMs?: number;
  /** Optional callback when QuerySpec changes (for external tracking) */
  onQuerySpecChange?: (querySpec: ServerTableQuerySpec) => void;
}

/**
 * Return type of useServerTableState hook
 */
export interface UseServerTableStateReturn {
  /** TanStack Table sorting state */
  sorting: SortingState;
  /** Handler for sorting changes */
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
  /** TanStack Table column filters state (for immediate UI updates) */
  columnFilters: ColumnFiltersState;
  /** Handler for column filter changes */
  onColumnFiltersChange: (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => void;
  /** TanStack Table pagination state */
  pagination: PaginationState;
  /** Handler for pagination changes */
  onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
  /** Built QuerySpec ready for server query */
  querySpec: ServerTableQuerySpec;
  /** Current filter values for UI display (record format) */
  filterValues: Record<string, unknown>;
}

/**
 * Hook for managing server-side table state with debouncing
 */
export function useServerTableState<TData>({
  columns,
  defaultSort = [{ id: "createdAt", desc: true }],
  defaultPageSize = 25,
  textFilterDebounceMs = 500,
  onQuerySpecChange,
}: UseServerTableStateOptions<TData>): UseServerTableStateReturn {
  // TanStack Table state (for UI)
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort.map((s) => ({ id: s.id, desc: s.desc })),
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // Debounced filter state (for server queries)
  const [debouncedFilters, setDebouncedFilters] = useState<QuerySpecFilters>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create column map for filter type lookup
  const columnMap = useMemo(() => {
    const map = new Map<string, ColumnDef<TData>>();
    columns.forEach((col) => {
      if (col.id) {
        map.set(col.id, col);
      }
    });
    return map;
  }, [columns]);

  // Handle column filter changes with debouncing
  const handleColumnFiltersChange = useCallback(
    (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      // Update UI state immediately (for responsive feel)
      const newFilters = typeof updater === "function" ? updater(columnFilters) : updater;
      setColumnFilters(newFilters);

      // Check if any text filters changed (need debouncing)
      const hasTextFilters = newFilters.some((filter) => {
        const columnDef = columnMap.get(filter.id);
        if (!columnDef) return false;
        const meta = (columnDef.meta as EnhancedColumnMeta<TData>) || {};
        return shouldDebounceFilter(meta.filterType);
      });

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce text filters, immediately update others
      if (hasTextFilters) {
        // Debounce text filters
        debounceTimerRef.current = setTimeout(() => {
          const querySpecFilters = columnFiltersToQuerySpec(newFilters, columns);
          setDebouncedFilters(querySpecFilters);
        }, textFilterDebounceMs);
      } else {
        // Immediately update non-text filters
        const querySpecFilters = columnFiltersToQuerySpec(newFilters, columns);
        setDebouncedFilters(querySpecFilters);
      }

      // Reset pagination to first page when filters change
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [columnFilters, columnMap, columns, textFilterDebounceMs],
  );

  // Handle sorting changes
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      // Reset pagination to first page when sorting changes
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [sorting],
  );

  // Handle pagination changes
  const handlePaginationChange = useCallback(
    (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
      const newPagination = typeof updater === "function" ? updater(pagination) : updater;
      setPagination(newPagination);
    },
    [pagination],
  );

  // Build QuerySpec from state
  const querySpec = useMemo<ServerTableQuerySpec>(() => {
    return {
      filters: Object.keys(debouncedFilters).length > 0 ? debouncedFilters : undefined,
      sort: sorting.map((s) => ({ id: s.id, desc: s.desc })),
      pagination: {
        // Convert pageIndex to cursor (for now, we'll reset cursor to undefined on page changes)
        // This assumes the backend handles pageSize and cursor-based pagination
        cursor: undefined, // Will be set by pagination handlers in wrapper components
        pageSize: pagination.pageSize,
      },
    };
  }, [debouncedFilters, sorting, pagination.pageSize]);

  // Extract filter values for UI display (record format)
  const filterValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const filter of columnFilters) {
      values[filter.id] = filter.value;
    }
    return values;
  }, [columnFilters]);

  // Notify when QuerySpec changes (for external tracking)
  useEffect(() => {
    onQuerySpecChange?.(querySpec);
  }, [querySpec, onQuerySpecChange]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    sorting,
    onSortingChange: handleSortingChange,
    columnFilters,
    onColumnFiltersChange: handleColumnFiltersChange,
    pagination,
    onPaginationChange: handlePaginationChange,
    querySpec,
    filterValues,
  };
}
