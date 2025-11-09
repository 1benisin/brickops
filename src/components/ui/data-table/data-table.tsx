"use client";

import React, { ReactNode, useEffect, useState, useCallback, useMemo } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
  SortingState,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  Header,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useLocalStorage } from "@/hooks/use-local-storage";
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
import { cn } from "@/lib/utils";

type SortableDragHandle = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

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
  columnFilters?: Record<string, any>; // Legacy format (backward compatibility)
  // TanStack Table controlled states (for useServerTableState hook)
  columnFiltersState?: ColumnFiltersState;
  onColumnFiltersChange?: (
    updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState),
  ) => void;
  paginationState?: PaginationState;
  onPaginationChange?: (
    updater: PaginationState | ((old: PaginationState) => PaginationState),
  ) => void;
  pinnedStartColumns?: string[];
  pinnedEndColumns?: string[];
  className?: string;
  // Row selection props
  enableRowSelection?: boolean;
  onRowSelect?: (rows: TData[]) => void;
  bulkActions?: (props: { selectedRows: TData[] }) => ReactNode;
  // State persistence flags
  persistSelection?: boolean;
  // Loading and empty states
  isLoading?: boolean;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
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
  columnFilters = {}, // Legacy format
  columnFiltersState, // TanStack Table format (from useServerTableState)
  onColumnFiltersChange, // TanStack Table handler (from useServerTableState)
  paginationState, // TanStack Table format (from useServerTableState)
  onPaginationChange, // TanStack Table handler (from useServerTableState)
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
  const [sorting, setSorting] = useState<SortingState>(sortingProp || []);

  // Sync external sorting prop to internal state
  useEffect(() => {
    if (sortingProp !== undefined) {
      setSorting(sortingProp);
    }
  }, [sortingProp]);

  const handleSort = useCallback(
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
  const [tableState, setTableState] = useLocalStorage<TableState>(storageKey, {
    columnVisibility: {},
    columnSizing: {},
    columnOrder: [],
  });

  // State setters with localStorage persistence
  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setTableState((prev) => ({
        ...prev,
        columnVisibility: typeof updater === "function" ? updater(prev.columnVisibility) : updater,
      }));
    },
    [setTableState],
  );

  const setColumnSizing = useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setTableState((prev) => ({
        ...prev,
        columnSizing: typeof updater === "function" ? updater(prev.columnSizing) : updater,
      }));
    },
    [setTableState],
  );

  const setColumnOrder = useCallback(
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
  const memoizedColumns = useMemo(() => columns, [columns]);

  // Row selection state management
  // For server-side tables, we track selected IDs (not row indices)
  // because row indices change between pages
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Row selection state (by row ID for current page)
  // Always call both hooks unconditionally (React rules)
  const [rowSelectionStorage, setRowSelectionStorage] = useLocalStorage<RowSelectionState>(
    `${storageKey}-selection`,
    {},
  );
  const [rowSelectionState, setRowSelectionState] = useState<RowSelectionState>({});

  // Choose which state to use based on persistence setting
  const [rowSelection, setRowSelection] =
    persistSelection && enableRowSelection
      ? [rowSelectionStorage, setRowSelectionStorage]
      : [rowSelectionState, setRowSelectionState];

  // Get row ID helper function
  const getRowIdFn = useCallback(
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

  // Support controlled columnFilters state (from useServerTableState)
  // Convert legacy Record format to ColumnFiltersState if needed
  const internalColumnFilters = useMemo<ColumnFiltersState>(() => {
    if (columnFiltersState !== undefined) {
      // Use TanStack Table format if provided
      return columnFiltersState;
    }
    // Convert legacy Record format to ColumnFiltersState
    return Object.entries(columnFilters).map(([id, value]) => ({ id, value }));
  }, [columnFilters, columnFiltersState]);

  // Create adapter to convert legacy onColumnFilterChange to TanStack format
  const handleColumnFiltersChangeAdapter = useCallback(
    (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      if (onColumnFiltersChange) {
        // Use new TanStack handler if provided
        onColumnFiltersChange(updater);
      } else if (onColumnFilterChange) {
        // Convert to legacy format for backward compatibility
        const newFilters = typeof updater === "function" ? updater(internalColumnFilters) : updater;
        // Update each filter using legacy callback
        const currentFilterMap = new Map(internalColumnFilters.map((f) => [f.id, f.value]));
        const newFilterMap = new Map(newFilters.map((f) => [f.id, f.value]));

        // Find changed filters and call legacy callback
        for (const [id, value] of Array.from(newFilterMap.entries())) {
          if (currentFilterMap.get(id) !== value) {
            onColumnFilterChange(id, value);
          }
        }
        // Find removed filters
        for (const [id] of Array.from(currentFilterMap.entries())) {
          if (!newFilterMap.has(id)) {
            onColumnFilterChange(id, undefined);
          }
        }
      }
    },
    [onColumnFiltersChange, onColumnFilterChange, internalColumnFilters],
  );

  // Internal pagination state (fallback if not controlled)
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  // Use controlled pagination if provided, otherwise use internal
  const effectivePagination = paginationState ?? internalPagination;
  const handlePaginationChange = onPaginationChange ?? setInternalPagination;

  const table = useReactTable({
    data,
    columns: memoizedColumns,
    getCoreRowModel: getCoreRowModel(),
    // NOTE: No getSortedRowModel(), getFilteredRowModel(), or getPaginationRowModel()
    // because we use manual modes - data comes pre-processed from server
    enableSorting: enableSorting, // Enable sorting so getCanSort() works
    enableColumnFilters: enableFiltering, // Enable column filtering so getCanFilter() works
    enableMultiSort: false, // Only allow single column sorting at a time
    manualSorting: true, // Server-side sorting - data must be pre-sorted
    manualFiltering: true, // Server-side filtering - data must be pre-filtered
    manualPagination: true, // Server-side pagination - data must be pre-paginated
    getRowId: getRowIdFn,
    enableRowSelection: enableRowSelection,
    onRowSelectionChange: setRowSelection,
    state: {
      columnVisibility: enableColumnVisibility ? tableState.columnVisibility : undefined,
      columnSizing: enableColumnSizing ? tableState.columnSizing : undefined,
      columnOrder: enableColumnOrdering ? tableState.columnOrder : undefined,
      sorting: enableSorting ? sorting : undefined,
      columnFilters: enableFiltering ? internalColumnFilters : undefined,
      pagination: effectivePagination,
      rowSelection: enableRowSelection ? rowSelection : undefined,
    },
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
    onColumnSizingChange: enableColumnSizing ? setColumnSizing : undefined,
    onColumnOrderChange: enableColumnOrdering ? setColumnOrder : undefined,
    onSortingChange: enableSorting ? setSorting : undefined,
    onColumnFiltersChange: enableFiltering ? handleColumnFiltersChangeAdapter : undefined,
    onPaginationChange: handlePaginationChange,
    enableColumnResizing: enableColumnSizing,
    columnResizeMode: "onChange",
  });

  // Update selected IDs when selection changes (for server-side pagination)
  useEffect(() => {
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
  useEffect(() => {
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
  useEffect(() => {
    if (onRowSelect && enableRowSelection) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onRowSelect(selectedRows);
    }
  }, [rowSelection, table, onRowSelect, enableRowSelection]);

  const selectedCount = enableRowSelection ? table.getFilteredSelectedRowModel().rows.length : 0;

  // Initialize column order
  useEffect(() => {
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

  const pinnedStartSet = useMemo(() => new Set(pinnedStartColumns), [pinnedStartColumns]);
  const pinnedEndSet = useMemo(() => new Set(pinnedEndColumns), [pinnedEndColumns]);

  const isColumnPinned = useCallback(
    (columnId: string) => pinnedStartSet.has(columnId) || pinnedEndSet.has(columnId),
    [pinnedStartSet, pinnedEndSet],
  );

  const isColumnDraggable = useCallback(
    (columnId: string) => {
      if (!enableColumnOrdering || isColumnPinned(columnId)) {
        return false;
      }
      const column = table.getColumn(columnId);
      if (!column) {
        return false;
      }
      const columnMeta = column.columnDef.meta as { disableReorder?: boolean } | undefined;
      if (columnMeta?.disableReorder) {
        return false;
      }
      return true;
    },
    [enableColumnOrdering, isColumnPinned, table],
  );

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const currentOrder =
        table.getState().columnOrder && table.getState().columnOrder.length > 0
          ? table.getState().columnOrder
          : table.getAllLeafColumns().map((col) => col.id);

      const movableOrder = currentOrder.filter(
        (columnId) => !pinnedStartSet.has(columnId) && !pinnedEndSet.has(columnId),
      );

      const activeIndex = movableOrder.indexOf(active.id as string);
      const overIndex = movableOrder.indexOf(over.id as string);

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      const reorderedMovable = arrayMove(movableOrder, activeIndex, overIndex);

      const newOrder = [
        ...pinnedStartColumns.filter((id) => currentOrder.includes(id)),
        ...reorderedMovable,
        ...pinnedEndColumns.filter((id) => currentOrder.includes(id)),
      ];

      table.setColumnOrder(newOrder);
    },
    [table, pinnedStartColumns, pinnedEndColumns, pinnedStartSet, pinnedEndSet],
  );

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const sensors = useSensors(pointerSensor);

  // Memoize row rendering for performance
  const renderRow = useCallback(
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
        <DataTableBulkActions selectedCount={selectedCount}>
          {bulkActions &&
            bulkActions({
              selectedRows: table.getFilteredSelectedRowModel().rows.map((row) => row.original),
            })}
        </DataTableBulkActions>
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
            {enableColumnOrdering ? (
              <DndContext sensors={sensors} onDragEnd={handleColumnDragEnd}>
                <TableHeader className="sticky top-0 bg-background z-10" role="rowgroup">
                  {table.getHeaderGroups().map((headerGroup) => {
                    const sortableIds = headerGroup.headers
                      .filter(
                        (header) =>
                          header &&
                          header.column &&
                          !header.isPlaceholder &&
                          isColumnDraggable(header.column.id),
                      )
                      .map((header) => header.column.id);

                    return (
                      <SortableContext
                        key={headerGroup.id}
                        items={sortableIds}
                        strategy={horizontalListSortingStrategy}
                      >
                        <TableRow role="row" key={headerGroup.id}>
                          {headerGroup.headers.map((header) => {
                            if (!header || !header.column) {
                              return null;
                            }

                            const headerStyle = {
                              width: header.getSize(),
                              minWidth: header.column.columnDef.minSize,
                              maxWidth: header.column.columnDef.maxSize,
                            };

                            if (header.isPlaceholder) {
                              return (
                                <TableHead
                                  key={header.id}
                                  className="whitespace-nowrap"
                                  style={headerStyle}
                                  aria-hidden="true"
                                />
                              );
                            }

                            const filterValue =
                              columnFiltersState !== undefined
                                ? internalColumnFilters.find((f) => f.id === header.column.id)
                                    ?.value
                                : columnFilters[header.column.id];

                            const headerContent = (
                              <DataTableHeader
                                header={header}
                                table={table}
                                enableSorting={enableSorting}
                                enableFiltering={enableFiltering}
                                onSort={handleSort}
                                onFilterChange={onColumnFilterChange}
                                filterValue={filterValue}
                              />
                            );

                            const canResize = enableColumnSizing && header.column.getCanResize();
                            const resizeHandler = header.getResizeHandler();

                            const renderHeaderInner = (dragHandle?: SortableDragHandle) => {
                              return (
                                <div
                                  className={cn(
                                    "relative flex h-full w-full items-center",
                                    canResize ? "pr-3" : undefined,
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "flex-1",
                                      dragHandle &&
                                        "cursor-grab select-none active:cursor-grabbing",
                                    )}
                                    {...(dragHandle?.attributes ?? {})}
                                    {...(dragHandle?.listeners ?? {})}
                                  >
                                    {headerContent}
                                  </div>
                                  {canResize && (
                                    <div
                                      role="separator"
                                      aria-orientation="vertical"
                                      className="absolute top-0 right-0 flex h-full w-3 cursor-col-resize select-none items-center justify-center transition-colors"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        resizeHandler(event);
                                      }}
                                      onTouchStart={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        resizeHandler(event);
                                      }}
                                      onDoubleClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        header.column.resetSize();
                                      }}
                                    >
                                      <span className="h-1/2 w-px bg-border group-hover:bg-foreground" />
                                    </div>
                                  )}
                                </div>
                              );
                            };

                            return isColumnDraggable(header.column.id) ? (
                              <DraggableHeaderCell
                                key={header.id}
                                header={header}
                                style={headerStyle}
                                enableSorting={enableSorting}
                              >
                                {(dragHandle) => renderHeaderInner(dragHandle)}
                              </DraggableHeaderCell>
                            ) : (
                              <TableHead
                                key={header.id}
                                className="relative whitespace-nowrap group"
                                aria-sort={
                                  enableSorting && header.column.getCanSort()
                                    ? header.column.getIsSorted() === "asc"
                                      ? "ascending"
                                      : header.column.getIsSorted() === "desc"
                                        ? "descending"
                                        : "none"
                                    : undefined
                                }
                                style={headerStyle}
                              >
                                {renderHeaderInner()}
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </SortableContext>
                    );
                  })}
                </TableHeader>
              </DndContext>
            ) : (
              <TableHeader className="sticky top-0 bg-background z-10" role="rowgroup">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} role="row">
                    {headerGroup.headers.map((header) => {
                      if (!header || !header.column) {
                        return null;
                      }

                      const headerStyle = {
                        width: header.getSize(),
                        minWidth: header.column.columnDef.minSize,
                        maxWidth: header.column.columnDef.maxSize,
                      };

                      if (header.isPlaceholder) {
                        return (
                          <TableHead
                            key={header.id}
                            className="whitespace-nowrap"
                            style={headerStyle}
                            aria-hidden="true"
                          />
                        );
                      }

                      const filterValue =
                        columnFiltersState !== undefined
                          ? internalColumnFilters.find((f) => f.id === header.column.id)?.value
                          : columnFilters[header.column.id];

                      const headerContent = (
                        <DataTableHeader
                          header={header}
                          table={table}
                          enableSorting={enableSorting}
                          enableFiltering={enableFiltering}
                          onSort={handleSort}
                          onFilterChange={onColumnFilterChange}
                          filterValue={filterValue}
                        />
                      );

                      const canResize = enableColumnSizing && header.column.getCanResize();
                      const resizeHandler = header.getResizeHandler();

                      const renderHeaderInner = () => (
                        <div
                          className={cn(
                            "relative flex h-full w-full items-center",
                            canResize ? "pr-3" : undefined,
                          )}
                        >
                          <div className="flex-1">{headerContent}</div>
                          {canResize && (
                            <div
                              role="separator"
                              aria-orientation="vertical"
                              className="absolute top-0 right-0 flex h-full w-3 cursor-col-resize select-none items-center justify-center transition-colors"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                resizeHandler(event);
                              }}
                              onTouchStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                resizeHandler(event);
                              }}
                              onDoubleClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                header.column.resetSize();
                              }}
                            >
                              <span className="h-1/2 w-px bg-border group-hover:bg-foreground" />
                            </div>
                          )}
                        </div>
                      );

                      return (
                        <TableHead
                          key={header.id}
                          className="relative whitespace-nowrap group"
                          aria-sort={
                            enableSorting && header.column.getCanSort()
                              ? header.column.getIsSorted() === "asc"
                                ? "ascending"
                                : header.column.getIsSorted() === "desc"
                                  ? "descending"
                                  : "none"
                              : undefined
                          }
                          style={headerStyle}
                        >
                          {renderHeaderInner()}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
            )}
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

interface DraggableHeaderCellProps<TData, TValue> {
  header: Header<TData, TValue>;
  style: React.CSSProperties;
  className?: string;
  children: (dragHandle: SortableDragHandle) => React.ReactNode;
  enableSorting?: boolean;
}

function DraggableHeaderCell<TData, TValue>({
  header,
  style,
  className,
  children,
  enableSorting = true,
}: DraggableHeaderCellProps<TData, TValue>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
  });

  const draggableStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ariaSort =
    enableSorting && header.column.getCanSort()
      ? header.column.getIsSorted() === "asc"
        ? "ascending"
        : header.column.getIsSorted() === "desc"
          ? "descending"
          : "none"
      : undefined;

  return (
    <TableHead
      ref={setNodeRef}
      className={cn(
        "relative whitespace-nowrap select-none touch-none group",
        isDragging && "opacity-60",
        className,
      )}
      aria-sort={ariaSort}
      style={draggableStyle}
    >
      {children({ attributes, listeners })}
    </TableHead>
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
