"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { createColumns, type MarketplaceSyncConfig } from "./columns";
import type { InventoryItem } from "@/types/inventory";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DataTableColumnManager } from "./data-table-column-manager";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditInventoryItemDialog } from "@/components/inventory/dialogs/EditInventoryItemDialog";

interface DataTableProps<TData> {
  data: TData[];
  syncConfig: MarketplaceSyncConfig;
}

interface TableState {
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  columnOrder: ColumnOrderState;
}

export function DataTable<TData>({ data, syncConfig }: DataTableProps<TData>) {
  const [editingItem, setEditingItem] = React.useState<InventoryItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);

  const handleEditItem = React.useCallback((item: InventoryItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  }, []);

  const handleEditDialogClose = React.useCallback(() => {
    setIsEditDialogOpen(false);
    setEditingItem(null);
  }, []);

  const columns = React.useMemo(
    () => createColumns(syncConfig, handleEditItem),
    [syncConfig, handleEditItem],
  );

  // Use localStorage hook for persistent state - initialize with empty columnOrder
  const [tableState, setTableState, removeTableState] = useLocalStorage<TableState>(
    "inventory-table-state",
    {
      columnVisibility: {},
      columnSizing: {},
      columnOrder: [], // Start empty; we will initialize from leaf columns below
    },
  );

  // Column pin policy
  const pinnedStart = React.useMemo(() => ["select"], []);
  const pinnedEnd = React.useMemo(() => ["actions"], []);

  // Helper: sanitize order against canonical leaf IDs and pin policy
  const sanitizeOrder = React.useCallback(
    (saved: string[], canonical: string[]): string[] => {
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
    },
    [pinnedStart, pinnedEnd],
  );

  // Update individual state properties
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

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<TData>[],
    getCoreRowModel: getCoreRowModel(),

    // Column visibility, sizing, and ordering
    state: {
      columnVisibility: tableState.columnVisibility,
      columnSizing: tableState.columnSizing,
      columnOrder: tableState.columnOrder,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,

    // Column sizing configuration
    enableColumnResizing: false, // We'll control this manually in the dropdown
    columnResizeMode: "onChange",
  });

  // Initialize/sanitize column order based on canonical leaf IDs
  React.useEffect(() => {
    const leafIds = table.getAllLeafColumns().map((c) => c.id);
    if (tableState.columnOrder.length === 0) {
      const initial = sanitizeOrder(leafIds, leafIds);
      setTableState((prev) => ({ ...prev, columnOrder: initial }));
      return;
    }
    const sanitized = sanitizeOrder(tableState.columnOrder, leafIds);
    // Only update if changed to avoid loops
    if (
      sanitized.length !== tableState.columnOrder.length ||
      sanitized.some((id, i) => id !== tableState.columnOrder[i])
    ) {
      setTableState((prev) => ({ ...prev, columnOrder: sanitized }));
    }
  }, [table, tableState.columnOrder, sanitizeOrder, setTableState]);

  return (
    <>
      <div className="w-full h-full flex flex-col">
        {/* Column Management Dropdown */}
        <div className="flex justify-end">
          <DataTableColumnManager table={table} onResetAll={removeTableState} />
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto rounded-md border">
          <Table className="w-auto min-w-max table-fixed">
            <TableHeader className="sticky top-0 bg-background z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        className="whitespace-nowrap"
                        style={{
                          width: header.getSize(),
                          minWidth: header.column.columnDef.minSize,
                          maxWidth: header.column.columnDef.maxSize,
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditInventoryItemDialog
        open={isEditDialogOpen}
        onOpenChange={handleEditDialogClose}
        item={editingItem}
      />
    </>
  );
}
