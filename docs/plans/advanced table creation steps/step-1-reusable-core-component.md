# Step 1: Create Reusable Core Component

**Status**: Implementation  
**Estimated Time**: ~1.5 days  
**Risk Level**: Low  
**Prerequisites**: Step 0 (Server-Side Infrastructure) must be complete

## Overview

Extract the generic table component from the inventory-specific implementation. This creates a **data-agnostic** table component that accepts server-side queries\*\* and can be reused for inventory, orders, catalog, or any other data type.

**Key Change**: Component moves from accepting a `data` prop to accepting a `queryFn` prop for 100% server-side data fetching.

## Goals

- Create generic `DataTable<TData>` component in `src/components/ui/data-table/`
- Create type-safe column configuration system
- Create server-side query hook (`use-server-table.ts`)
- Update inventory table to use new generic component
- Maintain backward compatibility during transition

## Prerequisites

- [x] Step 0 complete (server-side queries working)
- [ ] Current inventory table code backed up
- [ ] Understanding of TanStack Table v8
- [ ] Understanding of React hooks and TypeScript generics

## Step-by-Step Implementation

### 1. Create Directory Structure

Create the following directory structure:

```
src/components/ui/data-table/
├── data-table.tsx
├── column-definitions.ts
├── data-table-view-options.tsx
└── hooks/
    └── use-server-table.ts
```

**Action Items**:

- [ ] Create `src/components/ui/data-table/` directory
- [ ] Create `hooks/` subdirectory

### 2. Create Column Definitions Type System

**File**: `src/components/ui/data-table/column-definitions.ts`

```typescript
import { ColumnDef } from "@tanstack/react-table";

export type ColumnFilterType = "text" | "number" | "date" | "select" | "boolean" | "custom";

export interface EnhancedColumnMeta<TData, TValue = unknown> {
  label?: string;
  description?: string;
  filterType?: ColumnFilterType;
  filterPlaceholder?: string;
  filterOptions?: Array<{ label: string; value: string }>; // For select filters
  filterConfig?: {
    min?: number;
    max?: number;
    step?: number;
    currency?: boolean; // For number filters
  };
  [key: string]: unknown;
}

// Helper to create typed columns with enhanced metadata
export function createColumn<TData, TValue = unknown>(
  config: ColumnDef<TData, TValue> & {
    meta?: EnhancedColumnMeta<TData, TValue>;
  },
): ColumnDef<TData, TValue> {
  return config;
}

// Type guard for filter type
export function isValidFilterType(type: string): type is ColumnFilterType {
  return ["text", "number", "date", "select", "boolean", "custom"].includes(type);
}
```

**Action Items**:

- [ ] Create `column-definitions.ts`
- [ ] Export types and helpers

### 3. Create Server-Side Query Hook

**File**: `src/components/ui/data-table/hooks/use-server-table.ts`

This hook manages server-side state (pagination, filters, sorting) and calls the Convex query function:

```typescript
import { useState, useEffect, useCallback } from "react";
import { QuerySpec, QueryResult } from "@/convex/inventory/types"; // Adjust import path

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

  // Build QuerySpec from state
  const querySpec: QuerySpec = {
    filters,
    sort,
    pagination,
  };

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
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setIsLoading(false);
        setHasMore(false);
        setIsLoading(false);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryFn, JSON.stringify(querySpec)]); // JSON.stringify for deep comparison

  // Helper functions
  const updateFilters = useCallback((newFilters: QuerySpec["filters"]) => {
    setFilters(newFilters);
    // Reset to first page when filters change
    setPagination((prev) => ({ ...prev, cursor: undefined }));
  }, []);

  const updateSort = useCallback((newSort: QuerySpec["sort"]) => {
    setSort(newSort);
    // Reset to first page when sort changes
    setPagination((prev) => ({ ...prev, cursor: undefined }));
  }, []);

  const nextPage = useCallback(() => {
    setPagination((prev) => {
      if (prev.cursor || hasMore) {
        return { ...prev, cursor: data[data.length - 1]?._id };
      }
      return prev;
    });
  }, [data, hasMore]);

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
    nextPage,
    previousPage,
    setPageSize,
  };
}
```

**Action Items**:

- [ ] Create `use-server-table.ts` hook
- [ ] Import QuerySpec and QueryResult types from Convex
- [ ] Test hook with inventory query function

### 4. Create Generic DataTable Component

**File**: `src/components/ui/data-table/data-table.tsx`

Extract from current inventory table, making it generic:

```typescript
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
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DataTableViewOptions } from "./data-table-view-options";
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
  pinnedStartColumns?: string[];
  pinnedEndColumns?: string[];
  className?: string;
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
  pinnedStartColumns = [],
  pinnedEndColumns = [],
  className,
}: DataTableProps<TData>) {
  const [tableState, setTableState, removeTableState] = useLocalStorage<TableState>(
    storageKey,
    {
      columnVisibility: {},
      columnSizing: {},
      columnOrder: [],
    },
  );

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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility: enableColumnVisibility ? tableState.columnVisibility : undefined,
      columnSizing: enableColumnSizing ? tableState.columnSizing : undefined,
      columnOrder: enableColumnOrdering ? tableState.columnOrder : undefined,
    },
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
    onColumnSizingChange: enableColumnSizing ? setColumnSizing : undefined,
    onColumnOrderChange: enableColumnOrdering ? setColumnOrder : undefined,
    enableColumnResizing: enableColumnSizing,
    columnResizeMode: "onChange",
  });

  // Initialize column order
  React.useEffect(() => {
    const leafIds = table.getAllLeafColumns().map((c) => c.id);
    if (tableState.columnOrder.length === 0) {
      const sanitized = sanitizeOrder(leafIds, leafIds, pinnedStartColumns, pinnedEndColumns);
      setTableState((prev) => ({ ...prev, columnOrder: sanitized }));
      return;
    }
    const sanitized = sanitizeOrder(tableState.columnOrder, leafIds, pinnedStartColumns, pinnedEndColumns);
    if (
      sanitized.length !== tableState.columnOrder.length ||
      sanitized.some((id, i) => id !== tableState.columnOrder[i])
    ) {
      setTableState((prev) => ({ ...prev, columnOrder: sanitized }));
    }
  }, [table, tableState.columnOrder, pinnedStartColumns, pinnedEndColumns, setTableState]);

  return (
    <div className={className}>
      {enableColumnVisibility && (
        <div className="flex justify-end mb-2">
          <DataTableViewOptions table={table} onResetAll={removeTableState} />
        </div>
      )}
      <div className="flex-1 overflow-x-auto overflow-y-auto rounded-md border">
        <Table className="w-auto min-w-max table-fixed">
          <TableHeader className="sticky top-0 bg-background z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
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
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
```

**Action Items**:

- [ ] Create `data-table.tsx` with generic component
- [ ] Remove all inventory-specific logic
- [ ] Ensure it accepts `data` prop (will switch to `queryFn` in later steps)
- [ ] Test with sample data

### 5. Create View Options Component

**File**: `src/components/ui/data-table/data-table-view-options.tsx`

Extract column manager logic from current inventory table:

```typescript
"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableColumnItem } from "./sortable-column-item"; // Extract from current inventory table

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  onResetAll: () => void;
}

export function DataTableViewOptions<TData>({
  table,
  onResetAll,
}: DataTableViewOptionsProps<TData>) {
  const allLeafColumns = table.getAllLeafColumns();
  const hideableColumns = allLeafColumns.filter((column) => column.getCanHide());
  const currentColumnOrder = table.getState().columnOrder;

  // Drag and drop logic (extract from current implementation)
  const handleDragEnd = (event: DragEndEvent) => {
    // ... existing drag logic from inventory table
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto mb-2">
          <Settings2 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[350px]">
        {/* Column visibility toggles */}
        {/* Column ordering (drag and drop) */}
        {/* Extract from current inventory table implementation */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Action Items**:

- [ ] Extract column manager logic from current inventory table
- [ ] Make it generic (no inventory-specific references)
- [ ] Create `sortable-column-item.tsx` if needed

### 6. Create Inventory Columns Helper

**File**: `src/components/inventory/inventory-columns.tsx` (NEW - refactored from existing columns.tsx)

Update inventory columns to use new `createColumn` helper:

```typescript
import { createColumn } from "@/components/ui/data-table/column-definitions";
import type { ColumnDef } from "@tanstack/react-table";
import type { InventoryItem } from "@/types/inventory";
import type { MarketplaceSyncConfig } from "./types";

export const createInventoryColumns = (
  syncConfig: MarketplaceSyncConfig,
): ColumnDef<InventoryItem>[] => {
  return [
    createColumn({
      id: "select",
      // ... selection column config
    }),
    createColumn({
      id: "partNumber",
      accessorKey: "partNumber",
      header: "Part Number",
      meta: { label: "Part Number" },
      // ... rest of config from existing columns
    }),
    // ... other columns (extract from existing columns.tsx)
  ];
};
```

**Action Items**:

- [ ] Copy existing column definitions from `src/components/inventory/data-table/columns.tsx`
- [ ] Update to use `createColumn` helper
- [ ] Remove inventory-specific logic where possible
- [ ] Verify all columns still work

### 7. Create Inventory Table Wrapper

**File**: `src/components/inventory/inventory-table-wrapper.tsx` (NEW)

Create wrapper that connects server-side query to generic component:

```typescript
"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/ui/data-table/data-table";
import { createInventoryColumns } from "./inventory-columns";
import type { InventoryItem } from "@/types/inventory";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useServerTable } from "@/components/ui/data-table/hooks/use-server-table";

export function InventoryTableWrapper() {
  const syncConfig = useQuery(api.marketplace.queries.getMarketplaceSyncConfig);

  const columns = useMemo(
    () => createInventoryColumns(syncConfig || {}),
    [syncConfig],
  );

  // Use server-side query hook
  const { data, isLoading } = useServerTable<InventoryItem>({
    queryFn: async (spec) => {
      // Call Convex query with QuerySpec
      const result = await fetch("/api/convex/query", {
        method: "POST",
        body: JSON.stringify({
          function: "inventory.queries.listInventoryItemsFiltered",
          args: { querySpec: spec },
        }),
      });
      return result.json();
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <DataTable<InventoryItem>
      data={data || []}
      columns={columns}
      storageKey="inventory-table-state"
      pinnedStartColumns={["select"]}
      pinnedEndColumns={["actions"]}
    />
  );
}
```

**Note**: The `queryFn` implementation above is a placeholder. You'll need to use the actual Convex React hook. See note below.

**Action Items**:

- [ ] Create wrapper component
- [ ] Integrate `useServerTable` hook
- [ ] Connect to `listInventoryItemsFiltered` query
- [ ] Test that data loads correctly

**Important**: For Convex React integration, you'll need to wrap the query function. Here's a better approach:

```typescript
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { QuerySpec } from "@/convex/inventory/types";

export function InventoryTableWrapper() {
  const syncConfig = useQuery(api.marketplace.queries.getMarketplaceSyncConfig);
  const [querySpec, setQuerySpec] = useState<QuerySpec>({
    filters: {},
    sort: [{ id: "createdAt", desc: true }],
    pagination: { pageSize: 25 },
  });

  const result = useQuery(api.inventory.queries.listInventoryItemsFiltered, {
    querySpec,
  });

  // Update querySpec when filters/sort/pagination change
  // ...

  const columns = useMemo(
    () => createInventoryColumns(syncConfig || {}),
    [syncConfig],
  );

  if (result === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <DataTable<InventoryItem>
      data={result.items || []}
      columns={columns}
      storageKey="inventory-table-state"
      pinnedStartColumns={["select"]}
      pinnedEndColumns={["actions"]}
    />
  );
}
```

### 8. Update Imports

Update any files that import the old inventory table to use the new wrapper:

**Action Items**:

- [ ] Find all imports of old inventory table
- [ ] Update to import `InventoryTableWrapper`
- [ ] Test that pages still render correctly

## Testing Checklist

### Component Creation

- [ ] Generic `DataTable` component renders
- [ ] Column definitions type system works
- [ ] `createColumn` helper works correctly

### Server-Side Hook

- [ ] `useServerTable` hook fetches data correctly
- [ ] Loading states work
- [ ] Error states work
- [ ] Pagination state updates correctly

### Column Management

- [ ] Column visibility controls work
- [ ] Column ordering (drag-to-reorder) works
- [ ] Column sizing works
- [ ] State persists to localStorage

### Inventory Integration

- [ ] Inventory table wrapper loads data
- [ ] All columns display correctly
- [ ] No regressions in existing functionality
- [ ] Column preferences persist

## Success Criteria

✅ **All of the following must be true:**

1. Generic `DataTable<TData>` component exists and is type-safe
2. Component accepts `data` prop and renders correctly
3. Column configuration system works with `createColumn` helper
4. Server-side query hook manages state correctly
5. Inventory table wrapper successfully uses generic component
6. All existing inventory table features still work (visibility, ordering, sizing)
7. No TypeScript errors
8. No runtime errors

## Common Issues & Solutions

### Issue: TypeScript errors with generics

**Solution**: Ensure `TData` is properly constrained. Use `extends Record<string, any>` if needed.

### Issue: Column visibility not persisting

**Solution**: Check that `storageKey` is unique and localStorage is working.

### Issue: Data not loading

**Solution**: Verify Convex query is being called correctly. Check network tab and Convex dashboard.

### Issue: Columns not rendering

**Solution**: Verify column definitions match expected format. Check that `accessorKey` or `accessorFn` is provided.

## Next Steps

Once this step is complete:

1. ✅ Verify all tests pass
2. ✅ Document any deviations from this plan
3. ✅ Proceed to **Step 2: Add Sorting & Basic Filtering**

---

**Remember**: This step creates the foundation. Focus on making the component truly generic and reusable!
