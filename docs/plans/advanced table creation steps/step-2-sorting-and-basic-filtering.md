# Step 2: Add Sorting & Basic Filtering

**Status**: Implementation  
**Estimated Time**: ~2 days  
**Risk Level**: Medium  
**Prerequisites**: Step 0 and Step 1 must be complete

## Overview

Add **server-side sorting** and **text-based filtering** to the generic table component. All sorting and filtering operations happen on the Convex server, ensuring scalability and performance.

**Key Features**:

- Clickable column headers with sort indicators (↑↓)
- Server-side sorting using Convex indexes
- Text prefix search for part numbers and names
- Debounced filter inputs (300ms delay)
- Filter state integrated with server queries
- Sort state integrated with server queries

## Goals

- Enable sorting on index-backed columns
- Add sort indicators to column headers
- Implement text filtering (prefix search)
- Create toolbar component with search input
- Integrate sorting and filtering with server-side queries
- Debounce filter inputs for performance
- Cancel in-flight requests when filters change

## Prerequisites

- [x] Step 0 complete (server-side queries with sorting/filtering support)
- [x] Step 1 complete (generic component created)
- [ ] Understanding of TanStack Table sorting API
- [ ] Understanding of Convex query filters

## Step-by-Step Implementation

### 1. Update Server Table Hook for Sorting

**File**: `src/components/ui/data-table/hooks/use-server-table.ts`

Add sorting state management:

```typescript
// Update existing hook to handle sorting changes
export function useServerTable<TData>({
  queryFn,
  defaultPageSize = 25,
  defaultSort = [{ id: "createdAt", desc: true }],
}: UseServerTableOptions<TData>) {
  // ... existing state

  const updateSort = useCallback((newSort: QuerySpec["sort"]) => {
    setSort(newSort);
    // Reset to first page when sort changes
    setPagination((prev) => ({ ...prev, cursor: undefined }));
  }, []);

  // Add method to toggle column sort
  const toggleSort = useCallback((columnId: string) => {
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
  }, []);

  return {
    // ... existing returns
    toggleSort, // Add this
  };
}
```

**Action Items**:

- [ ] Add `toggleSort` method to hook
- [ ] Update `updateSort` to reset pagination
- [ ] Test sorting state changes

### 2. Create Sortable Header Component

**File**: `src/components/ui/data-table/data-table-header.tsx` (NEW)

Create header component with sort indicators:

```typescript
"use client";

import { HeaderContext } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableHeaderProps<TData, TValue> {
  header: HeaderContext<TData, TValue>;
  enableSorting?: boolean;
  onSort?: (columnId: string) => void;
}

export function DataTableHeader<TData, TValue>({
  header,
  enableSorting = true,
  onSort,
}: DataTableHeaderProps<TData, TValue>) {
  const canSort = enableSorting && header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();

  if (!canSort) {
    return <>{typeof header.column.columnDef.header === "string"
      ? header.column.columnDef.header
      : flexRender(header.column.columnDef.header, header.getContext())}</>;
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-8 data-[state=open]:bg-accent -ml-3 hover:bg-accent",
        sortDirection && "bg-accent"
      )}
      onClick={() => {
        header.column.toggleSorting();
        onSort?.(header.column.id);
      }}
    >
      <span>
        {typeof header.column.columnDef.header === "string"
          ? header.column.columnDef.header
          : flexRender(header.column.columnDef.header, header.getContext())}
      </span>
      <span className="ml-2">
        {sortDirection === "asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : sortDirection === "desc" ? (
          <ArrowDown className="h-4 w-4" />
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </span>
    </Button>
  );
}
```

**Action Items**:

- [ ] Create `data-table-header.tsx`
- [ ] Add sort icons (ArrowUp, ArrowDown, ArrowUpDown from lucide-react)
- [ ] Style sort buttons appropriately
- [ ] Test header clicks toggle sort

### 3. Update DataTable Component for Sorting

**File**: `src/components/ui/data-table/data-table.tsx`

Add sorting support to the main component:

```typescript
import { DataTableHeader } from "./data-table-header";

interface DataTableProps<TData> {
  // ... existing props
  enableSorting?: boolean;
  onSortChange?: (sort: Array<{ id: string; desc: boolean }>) => void;
}

export function DataTable<TData>({
  // ... existing props
  enableSorting = true,
  onSortChange,
}: DataTableProps<TData>) {
  // ... existing code

  // Add sorting state (for UI indication only - actual sorting is server-side)
  const [sorting, setSorting] = React.useState<
    Array<{ id: string; desc: boolean }>
  >([]);

  const handleSort = React.useCallback(
    (columnId: string) => {
      setSorting((prev) => {
        const current = prev.find((s) => s.id === columnId);
        if (current) {
          if (current.desc) {
            // Remove sort
            const newSort = prev.filter((s) => s.id !== columnId);
            onSortChange?.(newSort);
            return newSort;
          } else {
            // Toggle to desc
            const newSort = prev.map((s) =>
              s.id === columnId ? { ...s, desc: true } : s
            );
            onSortChange?.(newSort);
            return newSort;
          }
        } else {
          // Add new sort (asc)
          const newSort = [{ id: columnId, desc: false }, ...prev];
          onSortChange?.(newSort);
          return newSort;
        }
      });
    },
    [onSortChange]
  );

  // Update table to show sortable headers
  return (
    <div className={className}>
      {/* ... existing code */}
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
                {enableSorting && header.column.getCanSort() ? (
                  <DataTableHeader
                    header={header}
                    enableSorting={enableSorting}
                    onSort={handleSort}
                  />
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      {/* ... rest of component */}
    </div>
  );
}
```

**Action Items**:

- [ ] Add sorting state to DataTable
- [ ] Add `handleSort` callback
- [ ] Update header rendering to use `DataTableHeader`
- [ ] Pass sort changes to parent component

### 4. Update Column Definitions for Sorting

**File**: `src/components/inventory/inventory-columns.tsx`

Mark sortable columns:

```typescript
export const createInventoryColumns = (
  syncConfig: MarketplaceSyncConfig,
): ColumnDef<InventoryItem>[] => {
  return [
    // ... existing columns

    createColumn({
      id: "partNumber",
      accessorKey: "partNumber",
      header: "Part Number",
      enableSorting: true, // ← Add this
      meta: {
        label: "Part Number",
        filterType: "text",
        filterPlaceholder: "Search part numbers...",
      },
      // ... rest of config
    }),

    createColumn({
      id: "quantityAvailable",
      accessorKey: "quantityAvailable",
      header: "Available",
      enableSorting: true, // ← Add this
      // ... rest of config
    }),

    createColumn({
      id: "price",
      accessorKey: "price",
      header: "Unit Price",
      enableSorting: true, // ← Add this
      // ... rest of config
    }),

    createColumn({
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Date Created",
      enableSorting: true, // ← Add this
      // ... rest of config
    }),

    // ... other columns
  ];
};
```

**Action Items**:

- [ ] Add `enableSorting: true` to sortable columns
- [ ] Verify only index-backed columns are sortable
- [ ] Test that non-sortable columns don't show sort UI

### 5. Create Toolbar Component with Search

**File**: `src/components/ui/data-table/data-table-toolbar.tsx` (NEW)

Create toolbar with global search:

```typescript
"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";

interface DataTableToolbarProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  placeholder?: string;
}

export function DataTableToolbar({
  globalFilter = "",
  onGlobalFilterChange,
  placeholder = "Search...",
}: DataTableToolbarProps) {
  const [value, setValue] = React.useState(globalFilter);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  // Debounce filter input (300ms)
  React.useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onGlobalFilterChange?.(value);
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, onGlobalFilterChange]);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex flex-1 items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-8"
          />
        </div>
        {value && (
          <Button
            variant="ghost"
            onClick={() => {
              setValue("");
              onGlobalFilterChange?.("");
            }}
            className="h-8 px-2 lg:px-3"
          >
            Clear
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `data-table-toolbar.tsx`
- [ ] Implement debounced search input
- [ ] Add clear button when filter is active
- [ ] Style toolbar appropriately

### 6. Integrate Toolbar with DataTable

**File**: `src/components/ui/data-table/data-table.tsx`

Add toolbar to component:

```typescript
import { DataTableToolbar } from "./data-table-toolbar";

interface DataTableProps<TData> {
  // ... existing props
  enableToolbar?: boolean;
  toolbarPlaceholder?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export function DataTable<TData>({
  // ... existing props
  enableToolbar = true,
  toolbarPlaceholder,
  onGlobalFilterChange,
}: DataTableProps<TData>) {
  // ... existing code

  return (
    <div className={className}>
      {enableToolbar && (
        <DataTableToolbar
          globalFilter={""} // Will be managed by parent
          onGlobalFilterChange={onGlobalFilterChange}
          placeholder={toolbarPlaceholder}
        />
      )}
      {enableColumnVisibility && (
        <div className="flex justify-end mb-2">
          <DataTableViewOptions table={table} onResetAll={removeTableState} />
        </div>
      )}
      {/* ... rest of component */}
    </div>
  );
}
```

**Action Items**:

- [ ] Import and add `DataTableToolbar`
- [ ] Add toolbar props to component interface
- [ ] Position toolbar above table

### 7. Update Inventory Wrapper to Handle Sorting & Filtering

**File**: `src/components/inventory/inventory-table-wrapper.tsx`

Connect sorting and filtering to server queries:

```typescript
"use client";

import { useMemo, useState, useCallback } from "react";
import { DataTable } from "@/components/ui/data-table/data-table";
import { createInventoryColumns } from "./inventory-columns";
import type { InventoryItem } from "@/types/inventory";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { QuerySpec } from "@/convex/inventory/types";

export function InventoryTableWrapper() {
  const syncConfig = useQuery(api.marketplace.queries.getMarketplaceSyncConfig);

  // Query state
  const [querySpec, setQuerySpec] = useState<QuerySpec>({
    filters: {},
    sort: [{ id: "createdAt", desc: true }],
    pagination: { pageSize: 25 },
  });

  // Fetch data using Convex query
  const result = useQuery(api.inventory.queries.listInventoryItemsFiltered, {
    querySpec,
  });

  const columns = useMemo(
    () => createInventoryColumns(syncConfig || {}),
    [syncConfig],
  );

  // Handle sort changes
  const handleSortChange = useCallback(
    (sort: Array<{ id: string; desc: boolean }>) => {
      setQuerySpec((prev) => ({
        ...prev,
        sort,
        pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
      }));
    },
    []
  );

  // Handle filter changes (text prefix search for part number)
  const handleFilterChange = useCallback(
    (value: string) => {
      setQuerySpec((prev) => ({
        ...prev,
        filters: {
          ...prev.filters,
          partNumber: value
            ? { kind: "prefix", value }
            : undefined,
        },
        pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
      }));
    },
    []
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
      enableSorting={true}
      onSortChange={handleSortChange}
      onGlobalFilterChange={handleFilterChange}
      toolbarPlaceholder="Search part numbers..."
    />
  );
}
```

**Action Items**:

- [ ] Add `querySpec` state management
- [ ] Connect to `listInventoryItemsFiltered` query
- [ ] Implement `handleSortChange` callback
- [ ] Implement `handleFilterChange` callback (maps to partNumber prefix filter)
- [ ] Test that sorting and filtering work

### 8. Add Request Cancellation (Optional but Recommended)

**File**: `src/components/inventory/inventory-table-wrapper.tsx`

Add AbortController to cancel in-flight requests:

```typescript
const [abortController, setAbortController] = useState<AbortController | null>(null);

// In handleSortChange and handleFilterChange:
const handleSortChange = useCallback(
  (sort: Array<{ id: string; desc: boolean }>) => {
    // Cancel previous request
    if (abortController) {
      abortController.abort();
    }

    const newController = new AbortController();
    setAbortController(newController);

    setQuerySpec((prev) => ({
      ...prev,
      sort,
      pagination: { ...prev.pagination, cursor: undefined },
    }));
  },
  [abortController],
);
```

**Note**: Convex queries don't support cancellation directly. This is more for future-proofing if you switch to REST API calls.

**Action Items**:

- [ ] Add AbortController for request cancellation (if using REST)
- [ ] Or skip if using Convex React hooks (they handle this automatically)

## Testing Checklist

### Sorting

- [ ] Clicking column header toggles sort direction (none → asc → desc → none)
- [ ] Sort indicator shows correct direction (↑ for asc, ↓ for desc)
- [ ] Non-sortable columns don't show sort UI
- [ ] Sorting triggers server query with correct sort parameter
- [ ] Results are sorted correctly on server
- [ ] Pagination resets to first page when sort changes
- [ ] Sort state persists if configured

### Filtering

- [ ] Typing in search box triggers filter after 300ms delay (debounce)
- [ ] Clear button appears when filter is active
- [ ] Clear button resets filter
- [ ] Filter triggers server query with correct filter parameter
- [ ] Results are filtered correctly on server (prefix search works)
- [ ] Pagination resets to first page when filter changes
- [ ] Filter state persists if configured

### Integration

- [ ] Sorting and filtering work together
- [ ] Changing filter doesn't break sort
- [ ] Changing sort doesn't break filter
- [ ] Multiple sort/filter operations don't create duplicate requests
- [ ] Loading states work correctly during queries

## Success Criteria

✅ **All of the following must be true:**

1. Column headers are clickable and show sort indicators
2. Clicking header toggles sort correctly (asc → desc → none)
3. Sort indicators display correct direction
4. Server receives correct sort parameters
5. Results are sorted correctly on server
6. Search input debounces correctly (300ms)
7. Filter triggers server query with partNumber prefix
8. Results are filtered correctly on server
9. Sorting and filtering work together
10. No duplicate requests when rapidly changing sort/filter

## Common Issues & Solutions

### Issue: Sort doesn't trigger server query

**Solution**: Verify `onSortChange` is connected to `setQuerySpec` in wrapper component

### Issue: Filter doesn't work

**Solution**: Check that filter value is being sent correctly. Verify Convex query accepts `partNumber.prefix` filter.

### Issue: Debounce not working

**Solution**: Check timeout clearing logic. Ensure `useEffect` cleanup function is correct.

### Issue: Multiple requests firing

**Solution**: Add request cancellation or debounce state updates more aggressively.

### Issue: Sort indicator not showing

**Solution**: Verify `enableSorting` is true on column definition and `getCanSort()` returns true.

## Next Steps

Once this step is complete:

1. ✅ Verify all tests pass
2. ✅ Test with large datasets (1000+ items)
3. ✅ Document any deviations from this plan
4. ✅ Proceed to **Step 3: Advanced Filtering & Pagination UI**

---

**Remember**: This step integrates UI controls with server-side queries. Focus on ensuring the server receives correct parameters!
