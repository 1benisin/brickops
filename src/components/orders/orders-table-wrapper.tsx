"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { DataTable } from "@/components/ui/data-table/data-table";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { createOrdersColumns, type Order } from "./orders-columns";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { OrdersQuerySpec } from "@/convex/marketplace/queries";
import { useServerTableState } from "@/components/ui/data-table/hooks/use-server-table-state";

const ORDERS_COLUMNS = createOrdersColumns();

export function OrdersTableWrapper() {
  const columns = useMemo(() => ORDERS_COLUMNS, []);

  // Use the new server table state hook
  const {
    sorting,
    onSortingChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    querySpec: hookQuerySpec,
  } = useServerTableState({
    columns,
    defaultSort: [{ id: "dateOrdered", desc: true }],
    defaultPageSize: 25,
    textFilterDebounceMs: 500,
  });

  // Track cursor for pagination (cursor resets when filters/sort change)
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Reset cursor when filters or sort change
  useEffect(() => {
    setCursor(undefined);
  }, [hookQuerySpec.filters, hookQuerySpec.sort]);

  // Convert hook QuerySpec to OrdersQuerySpec format
  const ordersQuerySpec = useMemo<OrdersQuerySpec>(() => {
    const filters = hookQuerySpec.filters;

    // Convert QuerySpecFilters to OrdersQuerySpec filters format
    const ordersFilters: OrdersQuerySpec["filters"] = {};

    if (filters) {
      // Text contains filters
      if (
        filters.orderId &&
        (filters.orderId.kind === "contains" || filters.orderId.kind === "prefix")
      ) {
        ordersFilters.orderId = { kind: "contains", value: filters.orderId.value };
      }
      if (
        filters.buyerName &&
        (filters.buyerName.kind === "contains" || filters.buyerName.kind === "prefix")
      ) {
        ordersFilters.buyerName = { kind: "contains", value: filters.buyerName.value };
      }
      if (
        filters.paymentMethod &&
        (filters.paymentMethod.kind === "contains" || filters.paymentMethod.kind === "prefix")
      ) {
        ordersFilters.paymentMethod = { kind: "contains", value: filters.paymentMethod.value };
      }
      if (
        filters.shippingMethod &&
        (filters.shippingMethod.kind === "contains" || filters.shippingMethod.kind === "prefix")
      ) {
        ordersFilters.shippingMethod = { kind: "contains", value: filters.shippingMethod.value };
      }

      // Number range filters
      if (filters.costGrandTotal && filters.costGrandTotal.kind === "numberRange") {
        const range = filters.costGrandTotal;
        // Only include if at least min or max is defined
        if (range.min !== undefined || range.max !== undefined) {
          ordersFilters.costGrandTotal = {
            kind: "numberRange",
            min: range.min,
            max: range.max,
          };
        }
      }
      if (filters.totalCount && filters.totalCount.kind === "numberRange") {
        const range = filters.totalCount;
        // Only include if at least min or max is defined
        if (range.min !== undefined || range.max !== undefined) {
          ordersFilters.totalCount = {
            kind: "numberRange",
            min: range.min,
            max: range.max,
          };
        }
      }
      if (filters.lotCount && filters.lotCount.kind === "numberRange") {
        const range = filters.lotCount;
        if (range.min !== undefined || range.max !== undefined) {
          ordersFilters.lotCount = {
            kind: "numberRange",
            min: range.min,
            max: range.max,
          };
        }
      }
      if (filters.costSubtotal && filters.costSubtotal.kind === "numberRange") {
        const range = filters.costSubtotal;
        if (range.min !== undefined || range.max !== undefined) {
          ordersFilters.costSubtotal = {
            kind: "numberRange",
            min: range.min,
            max: range.max,
          };
        }
      }
      if (filters.costShipping && filters.costShipping.kind === "numberRange") {
        const range = filters.costShipping;
        if (range.min !== undefined || range.max !== undefined) {
          ordersFilters.costShipping = {
            kind: "numberRange",
            min: range.min,
            max: range.max,
          };
        }
      }

      // Date range filters
      if (filters.dateOrdered && filters.dateOrdered.kind === "dateRange") {
        ordersFilters.dateOrdered = {
          kind: "dateRange",
          start: filters.dateOrdered.start,
          end: filters.dateOrdered.end,
        };
      }
      if (filters.dateStatusChanged && filters.dateStatusChanged.kind === "dateRange") {
        ordersFilters.dateStatusChanged = {
          kind: "dateRange",
          start: filters.dateStatusChanged.start,
          end: filters.dateStatusChanged.end,
        };
      }

      // Enum filters
      if (filters.status && filters.status.kind === "enum") {
        ordersFilters.status = { kind: "enum", value: filters.status.value };
      }
      if (filters.paymentStatus && filters.paymentStatus.kind === "enum") {
        ordersFilters.paymentStatus = { kind: "enum", value: filters.paymentStatus.value };
      }
    }

    return {
      filters: Object.keys(ordersFilters).length > 0 ? ordersFilters : undefined,
      sort: hookQuerySpec.sort,
      pagination: {
        cursor, // Use tracked cursor (resets when filters/sort change)
        pageSize: hookQuerySpec.pagination.pageSize,
      },
    };
  }, [hookQuerySpec, cursor]);

  // Fetch data using Convex query (server-side only)
  // Convex queries return undefined while fetching; keep server-sorted data stable during refetches
  const result = useQuery(api.marketplace.queries.listOrdersFiltered, {
    querySpec: ordersQuerySpec,
  });

  // Cache the last successful server response so refetches don't blank the table
  const [lastResult, setLastResult] = useState<typeof result>(undefined);

  useEffect(() => {
    if (result) {
      setLastResult(result);
    }
  }, [result]);

  const currentResult = result ?? lastResult;

  // Use server-sorted and server-filtered data directly
  const tableData = useMemo(() => {
    return currentResult?.items ?? [];
  }, [currentResult?.items]);

  // Pagination handlers (cursor-based)
  const handlePageSizeChange = useCallback(
    (size: number) => {
      setCursor(undefined); // Reset cursor when page size changes
      onPaginationChange((prev) => ({ ...prev, pageSize: size, pageIndex: 0 }));
    },
    [onPaginationChange, setCursor],
  );

  const handleNextPage = useCallback(() => {
    const activeResult = result ?? lastResult;
    if (activeResult && !activeResult.isDone && activeResult.cursor) {
      // Set cursor for next page
      setCursor(activeResult.cursor);
      onPaginationChange((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
    }
  }, [result, lastResult, onPaginationChange, setCursor]);

  const handlePreviousPage = useCallback(() => {
    // For cursor-based pagination, we'd need to track previous cursors
    // For now, reset to first page
    setCursor(undefined);
    onPaginationChange((prev) => ({ ...prev, pageIndex: 0 }));
  }, [onPaginationChange, setCursor]);

  // Handle sort changes - convert to hook format
  const handleSortChange = useCallback(
    (sort: Array<{ id: string; desc: boolean }>) => {
      onSortingChange(sort.map((s) => ({ id: s.id, desc: s.desc })));
    },
    [onSortingChange],
  );

  // Get row ID function for selection persistence
  const getRowId = useCallback((row: Order) => {
    return row._id || row.orderId;
  }, []);

  // Loading state
  const isInitialLoading = currentResult === undefined;
  const isRefetching = !isInitialLoading && result === undefined;

  // Empty state
  const emptyState = (
    <div className="text-center text-muted-foreground py-8">
      <p>No orders found.</p>
    </div>
  );

  // Extract filter values for legacy columnFilters prop (for backward compatibility during migration)
  const legacyColumnFilters = useMemo(() => {
    const filters: Record<string, unknown> = {};
    for (const filter of columnFilters) {
      filters[filter.id] = filter.value;
    }
    return filters;
  }, [columnFilters]);

  return (
    <>
      <DataTable<Order>
        data={tableData}
        columns={columns}
        storageKey="orders-table-state"
        enableSorting={true}
        sorting={sorting}
        onSortChange={handleSortChange}
        enableFiltering={true}
        // Use new TanStack Table controlled state format
        columnFiltersState={columnFilters}
        onColumnFiltersChange={onColumnFiltersChange}
        paginationState={pagination}
        onPaginationChange={onPaginationChange}
        // Legacy props for backward compatibility (will be removed after migration)
        columnFilters={legacyColumnFilters}
        toolbarPlaceholder="Search order IDs..."
        enableColumnVisibility={true}
        enableColumnOrdering={true}
        enableColumnSizing={true}
        getRowId={getRowId}
        isLoading={isInitialLoading}
        loadingState={
          <div className="flex items-center justify-center h-48">
            <div className="text-muted-foreground">Loading orders...</div>
          </div>
        }
        emptyState={emptyState}
      />
      {isRefetching && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground py-2"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-flex h-2 w-2 animate-pulse rounded-full bg-muted-foreground"
            aria-hidden="true"
          />
          Updating results…
        </div>
      )}
      {currentResult && (
        <DataTablePagination
          pageSize={pagination.pageSize}
          hasMore={!currentResult.isDone}
          isLoading={isInitialLoading}
          onPageSizeChange={handlePageSizeChange}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
        />
      )}
    </>
  );
}
