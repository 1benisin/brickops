"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
  SortingState,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DataTableViewOptions } from "./data-table-view-options";
import { DataTableHeader } from "./data-table-header";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableBulkActions } from "./data-table-bulk-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ColumnConfig<TData> = ColumnDef<TData>;

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnConfig<TData>[];
  storageKey?: string;
  enableColumnVisibility?: boolean;
  enableColumnOrdering?: boolean;
  enableColumnSizing?: boolean;
  enableSorting?: boolean;
  sorting?: SortingState;
  onSortChange?: (sort: Array<{ id: string; desc: boolean }>) => void;
  enableToolbar?: boolean;
  toolbarPlaceholder?: string;
  onGlobalFilterChange?: (value: string) => void;
  enableFiltering?: boolean;
  onColumnFilterChange?: (columnId: string, value: any) => void;
  columnFilters?: Record<string, any>;
  pinnedStartColumns?: string[];
  pinnedEndColumns?: string[];
  className?: string;
  // Row selection props
  enableRowSelection?: boolean;
  onRowSelect?: (rows: TData[]) => void;
  bulkActions?: (props: { selectedRows: TData[] }) => React.ReactNode;
  // State persistence flags
  persistSelection?: boolean;
  // Loading and empty states
  isLoading?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  // Get row ID function (for server-side pagination persistence)
  getRowId?: (row: TData) => string;
}

interface TableState {
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  columnOrder: ColumnOrderState;
}

export function DataTable<TData>({
  data,
  columns,
  storageKey = "data-table-state",
  enableColumnVisibility = true,
  enableColumnOrdering = true,
  enableColumnSizing = true,
  enableSorting = true,
  sorting: sortingProp,
  onSortChange,
  enableToolbar = true,
  toolbarPlaceholder,
  onGlobalFilterChange,
  enableFiltering = true,
  onColumnFilterChange,
  columnFilters = {},
  pinnedStartColumns = [],
  pinnedEndColumns = [],
  className,
  enableRowSelection = false,
  onRowSelect,
  bulkActions,
  persistSelection = true,
  isLoading = false,
  loadingState,
  emptyState,
  getRowId,
}: DataTableProps<TData>) {
  // Add sorting state (for UI indication only - actual sorting is server-side)
  const [sorting, setSorting] = React.useState<SortingState>(sortingProp || []);

  // Sync external sorting prop to internal state
  React.useEffect(() => {
    if (sortingProp !== undefined) {
      setSorting(sortingProp);
    }
  }, [sortingProp]);

  const handleSort = React.useCallback(
    (columnId: string) => {
      setSorting((prev) => {
        const current = prev.find((s) => s.id === columnId);
        if (current) {
          if (current.desc) {
            // Remove sort - clear all sorts
            const newSort: SortingState = [];
            onSortChange?.(newSort);
            return newSort;
          } else {
            // Toggle to desc - keep only this column sorted
            const newSort: SortingState = [{ id: columnId, desc: true }];
            onSortChange?.(newSort);
            return newSort;
          }
        } else {
          // Add new sort (asc) - clear previous sorts, only sort by this column
          const newSort: SortingState = [{ id: columnId, desc: false }];
          onSortChange?.(newSort);
          return newSort;
        }
      });
    },
    [onSortChange],
  );
  const [tableState, setTableState, removeTableState] = useLocalStorage<TableState>(storageKey, {
    columnVisibility: {},
    columnSizing: {},
    columnOrder: [],
  });

  // State setters with localStorage persistence
  const setColumnVisibility = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setTableState((prev) => ({
        ...prev,
        columnVisibility: typeof updater === "function" ? updater(prev.columnVisibility) : updater,
      }));
    },
    [setTableState],
  );

  const setColumnSizing = React.useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setTableState((prev) => ({
        ...prev,
        columnSizing: typeof updater === "function" ? updater(prev.columnSizing) : updater,
      }));
    },
    [setTableState],
  );

  const setColumnOrder = React.useCallback(
    (updater: ColumnOrderState | ((old: ColumnOrderState) => ColumnOrderState)) => {
      setTableState((prev) => {
        const currentOrder = prev.columnOrder;
        const newOrder = typeof updater === "function" ? updater(currentOrder) : updater;
        return {
          ...prev,
          columnOrder: newOrder,
        };
      });
    },
    [setTableState],
  );

  // Memoize columns for performance
  const memoizedColumns = React.useMemo(() => columns, [columns]);

  // Row selection state management
  // For server-side tables, we track selected IDs (not row indices)
  // because row indices change between pages
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Row selection state (by row ID for current page)
  // Always call both hooks unconditionally (React rules)
  const [rowSelectionStorage, setRowSelectionStorage] = useLocalStorage<RowSelectionState>(
    `${storageKey}-selection`,
    {},
  );
  const [rowSelectionState, setRowSelectionState] = React.useState<RowSelectionState>({});

  // Choose which state to use based on persistence setting
  const [rowSelection, setRowSelection] =
    persistSelection && enableRowSelection
      ? [rowSelectionStorage, setRowSelectionStorage]
      : [rowSelectionState, setRowSelectionState];

  // Get row ID helper function
  const getRowIdFn = React.useCallback(
    (row: TData) => {
      if (getRowId) {
        return getRowId(row);
      }
      // Fallback: try common ID fields
      const anyRow = row as any;
      return anyRow._id || anyRow.id || anyRow.partNumber || String(JSON.stringify(row));
    },
    [getRowId],
  );

  const table = useReactTable({
    data,
    columns: memoizedColumns,
    getCoreRowModel: getCoreRowModel(),
    // NOTE: getSortedRowModel() is NOT used because manualSorting: true
    // Data comes pre-sorted from server - TanStack Table only handles UI state
    enableSorting: enableSorting, // Enable sorting so getCanSort() works
    enableMultiSort: false, // Only allow single column sorting at a time
    manualSorting: true, // Server-side sorting - data must be pre-sorted
    getRowId: getRowIdFn,
    enableRowSelection: enableRowSelection,
    onRowSelectionChange: setRowSelection,
    state: {
      columnVisibility: enableColumnVisibility ? tableState.columnVisibility : undefined,
      columnSizing: enableColumnSizing ? tableState.columnSizing : undefined,
      columnOrder: enableColumnOrdering ? tableState.columnOrder : undefined,
      sorting: enableSorting ? sorting : undefined,
      rowSelection: enableRowSelection ? rowSelection : undefined,
    },
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
    onColumnSizingChange: enableColumnSizing ? setColumnSizing : undefined,
    onColumnOrderChange: enableColumnOrdering ? setColumnOrder : undefined,
    onSortingChange: enableSorting ? setSorting : undefined,
    enableColumnResizing: enableColumnSizing,
    columnResizeMode: "onChange",
  });

  // Update selected IDs when selection changes (for server-side pagination)
  React.useEffect(() => {
    if (!enableRowSelection || !getRowIdFn) return;

    const newSelectedIds = new Set<string>();
    table.getFilteredSelectedRowModel().rows.forEach((row) => {
      const id = getRowIdFn(row.original);
      if (id) {
        newSelectedIds.add(id);
      }
    });
    setSelectedIds(newSelectedIds);
  }, [rowSelection, table, enableRowSelection, getRowIdFn]);

  // Restore selection from IDs when data changes (e.g., new page)
  // Note: We intentionally don't include rowSelection in deps to avoid loops
  React.useEffect(() => {
    if (!enableRowSelection || !getRowIdFn || selectedIds.size === 0) return;

    const newSelection: RowSelectionState = {};
    table.getRowModel().rows.forEach((row) => {
      const id = getRowIdFn(row.original);
      if (id && selectedIds.has(id)) {
        newSelection[row.id] = true;
      }
    });

    // Only update if there's a meaningful change to avoid infinite loops
    const currentSelectedRowIds = new Set(
      Object.keys(rowSelection).filter((key) => rowSelection[key]),
    );
    const newSelectedRowIds = new Set(Object.keys(newSelection));

    // Check if the sets are different
    if (
      currentSelectedRowIds.size !== newSelectedRowIds.size ||
      !Array.from(newSelectedRowIds).every((id) => currentSelectedRowIds.has(id))
    ) {
      setRowSelection(newSelection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedIds, enableRowSelection, getRowIdFn, table]);

  // Notify parent of selection changes
  React.useEffect(() => {
    if (onRowSelect && enableRowSelection) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onRowSelect(selectedRows);
    }
  }, [rowSelection, table, onRowSelect, enableRowSelection]);

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  // Initialize column order
  React.useEffect(() => {
    const leafIds = table.getAllLeafColumns().map((c) => c.id);
    if (tableState.columnOrder.length === 0) {
      const sanitized = sanitizeOrder(leafIds, leafIds, pinnedStartColumns, pinnedEndColumns);
      setTableState((prev) => ({ ...prev, columnOrder: sanitized }));
      return;
    }
    const sanitized = sanitizeOrder(
      tableState.columnOrder,
      leafIds,
      pinnedStartColumns,
      pinnedEndColumns,
    );
    if (
      sanitized.length !== tableState.columnOrder.length ||
      sanitized.some((id, i) => id !== tableState.columnOrder[i])
    ) {
      setTableState((prev) => ({ ...prev, columnOrder: sanitized }));
    }
  }, [table, tableState.columnOrder, pinnedStartColumns, pinnedEndColumns, setTableState]);

  // Memoize row rendering for performance
  const renderRow = React.useCallback(
    (row: ReturnType<typeof table.getRowModel>["rows"][number]) => {
      return (
        <TableRow
          key={row.id}
          role="row"
          aria-selected={enableRowSelection ? row.getIsSelected() : undefined}
          data-state={enableRowSelection && row.getIsSelected() ? "selected" : undefined}
          tabIndex={0}
          onKeyDown={(e) => {
            if (enableRowSelection && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              row.toggleSelected();
            }
          }}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              className="whitespace-nowrap"
              style={{
                width: cell.column.getSize(),
                minWidth: cell.column.columnDef.minSize,
                maxWidth: cell.column.columnDef.maxSize,
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      );
    },
    [enableRowSelection, table],
  );

  return (
    <div className={className} role="region" aria-label="Data table">
      {enableToolbar && (
        <DataTableToolbar
          globalFilter={""}
          onGlobalFilterChange={onGlobalFilterChange}
          placeholder={toolbarPlaceholder}
        />
      )}

      {/* Bulk Actions */}
      {enableRowSelection && (
        <DataTableBulkActions
          selectedCount={selectedCount}
          onClearSelection={() => table.resetRowSelection()}
        >
          {bulkActions &&
            bulkActions({
              selectedRows: table.getFilteredSelectedRowModel().rows.map((row) => row.original),
            })}
        </DataTableBulkActions>
      )}

      {enableColumnVisibility && (
        <div className="flex justify-end mb-2">
          <DataTableViewOptions table={table} onResetAll={removeTableState} />
        </div>
      )}

      {isLoading ? (
        loadingState || (
          <div className="flex items-center justify-center h-48">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        )
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto rounded-md border">
          <Table className="w-auto min-w-max table-fixed" role="table">
            <TableHeader className="sticky top-0 bg-background z-10" role="rowgroup">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} role="row">
                  {headerGroup.headers.map((header) => {
                    // Defensive check: ensure header and column are valid
                    if (!header || !header.column) {
                      return null;
                    }
                    return (
                      <TableHead
                        key={header.id}
                        className="whitespace-nowrap"
                        role="columnheader"
                        aria-sort={
                          enableSorting && header.column.getCanSort()
                            ? header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                        style={{
                          width: header.getSize(),
                          minWidth: header.column.columnDef.minSize,
                          maxWidth: header.column.columnDef.maxSize,
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <DataTableHeader
                            header={header}
                            table={table}
                            enableSorting={enableSorting}
                            enableFiltering={enableFiltering}
                            onSort={handleSort}
                            onFilterChange={onColumnFilterChange}
                            filterValue={columnFilters[header.column.id]}
                          />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody role="rowgroup">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(renderRow)
              ) : (
                <TableRow role="row">
                  <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                    {emptyState || "No results."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function sanitizeOrder(
  saved: string[],
  canonical: string[],
  pinnedStart: string[],
  pinnedEnd: string[],
): string[] {
  const canonicalSet = new Set(canonical);
  const filtered = saved.filter((id) => canonicalSet.has(id));
  const withoutPinned = filtered.filter(
    (id) => !pinnedStart.includes(id) && !pinnedEnd.includes(id),
  );
  const missing = canonical.filter(
    (id) => !filtered.includes(id) && !pinnedStart.includes(id) && !pinnedEnd.includes(id),
  );
  const middle = [...withoutPinned, ...missing];
  const start = pinnedStart.filter((id) => canonicalSet.has(id));
  const end = pinnedEnd.filter((id) => canonicalSet.has(id));
  return [...start, ...middle, ...end];
}
