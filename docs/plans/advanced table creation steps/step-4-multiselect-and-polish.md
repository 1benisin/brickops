# Step 4: Multiselect & Polish

**Status**: Implementation  
**Estimated Time**: ~1.5 days  
**Risk Level**: Low-Medium  
**Prerequisites**: Step 0, Step 1, Step 2, and Step 3 must be complete

## Overview

Add **functional row selection**, **bulk actions**, and final **polish features** including state persistence, accessibility improvements, and performance optimizations.

**Key Features**:

- Functional checkbox selection (individual and select all)
- Bulk actions component (shows when rows are selected)
- Selection state management across pages
- State persistence (sorting, filters, pagination, column preferences)
- Accessibility improvements (keyboard navigation, ARIA labels)
- Performance optimizations (memoization, virtual scrolling if needed)

## Goals

- Implement functional row selection with checkboxes
- Create bulk actions component slot
- Add selection state persistence across pagination
- Persist all table state to localStorage
- Improve accessibility (keyboard nav, screen readers)
- Optimize performance for large datasets
- Add loading and empty states

## Prerequisites

- [x] Step 0 complete (server-side infrastructure)
- [x] Step 1 complete (core component)
- [x] Step 2 complete (sorting & filtering)
- [x] Step 3 complete (advanced filtering & pagination)
- [ ] Understanding of React state management
- [ ] Understanding of accessibility best practices

## Step-by-Step Implementation

### 1. Add Row Selection to DataTable

**File**: `src/components/ui/data-table/data-table.tsx`

Add selection state management:

```typescript
import {
  RowSelectionState,
  getCoreRowModel,
  // ... other imports
} from "@tanstack/react-table";

interface DataTableProps<TData> {
  // ... existing props
  enableRowSelection?: boolean;
  onRowSelect?: (rows: TData[]) => void;
  bulkActions?: (props: { selectedRows: TData[] }) => React.ReactNode;
}

export function DataTable<TData>({
  // ... existing props
  enableRowSelection = false,
  onRowSelect,
  bulkActions,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // ... existing config
    enableRowSelection: enableRowSelection,
    onRowSelectionChange: setRowSelection,
    state: {
      // ... existing state
      rowSelection: enableRowSelection ? rowSelection : undefined,
    },
  });

  // Notify parent of selection changes
  React.useEffect(() => {
    if (onRowSelect) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onRowSelect(selectedRows);
    }
  }, [rowSelection, table, onRowSelect]);

  // ... rest of component
}
```

**Action Items**:

- [ ] Add row selection state
- [ ] Configure TanStack Table for row selection
- [ ] Add `onRowSelect` callback
- [ ] Test checkbox selection works

### 2. Create Selection Column

**File**: `src/components/inventory/inventory-columns.tsx`

Add select column:

```typescript
import { Checkbox } from "@/components/ui/checkbox";

export const createInventoryColumns = (
  syncConfig: MarketplaceSyncConfig,
): ColumnDef<InventoryItem>[] => {
  return [
    createColumn({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 50,
    }),
    // ... other columns
  ];
};
```

**Action Items**:

- [ ] Import Checkbox component
- [ ] Add select column as first column
- [ ] Add select all checkbox in header
- [ ] Add row checkbox in cells
- [ ] Test selection works

### 3. Create Bulk Actions Component

**File**: `src/components/ui/data-table/data-table-bulk-actions.tsx` (NEW)

Create component that shows when rows are selected:

```typescript
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DataTableBulkActionsProps<TData> {
  selectedCount: number;
  onClearSelection: () => void;
  children?: React.ReactNode;
}

export function DataTableBulkActions<TData>({
  selectedCount,
  onClearSelection,
  children,
}: DataTableBulkActionsProps<TData>) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded-md mb-2">
      <div className="text-sm text-muted-foreground">
        {selectedCount} row(s) selected
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4 mr-2" />
          Clear selection
        </Button>
      </div>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `data-table-bulk-actions.tsx`
- [ ] Style bulk actions bar
- [ ] Add clear selection button
- [ ] Test shows/hides based on selection

### 4. Integrate Bulk Actions into DataTable

**File**: `src/components/ui/data-table/data-table.tsx`

Add bulk actions slot:

```typescript
import { DataTableBulkActions } from "./data-table-bulk-actions";

export function DataTable<TData>({
  // ... existing props
  bulkActions,
}: DataTableProps<TData>) {
  // ... existing code

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className={className}>
      {/* Toolbar */}
      {enableToolbar && (
        <DataTableToolbar
          // ... props
        />
      )}

      {/* Bulk Actions */}
      {enableRowSelection && (
        <DataTableBulkActions
          selectedCount={selectedCount}
          onClearSelection={() => table.resetRowSelection()}
        >
          {bulkActions && bulkActions({
            selectedRows: table
              .getFilteredSelectedRowModel()
              .rows
              .map((row) => row.original),
          })}
        </DataTableBulkActions>
      )}

      {/* Column visibility options */}
      {/* ... existing code */}

      {/* Table */}
      {/* ... existing code */}
    </div>
  );
}
```

**Action Items**:

- [ ] Import bulk actions component
- [ ] Add bulk actions slot above table
- [ ] Pass selected rows to bulk actions
- [ ] Test bulk actions show/hide correctly

### 5. Add Selection State Persistence

**File**: `src/components/ui/data-table/data-table.tsx`

Persist selection across page changes:

```typescript
const [rowSelection, setRowSelection] = useLocalStorage<RowSelectionState>(
  `${storageKey}-selection`,
  {},
);

// For server-side tables, we need to track selected IDs (not row indices)
// because row indices change between pages
const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

// Update selected IDs when selection changes
React.useEffect(() => {
  const newSelectedIds = new Set<string>();
  table.getFilteredSelectedRowModel().rows.forEach((row) => {
    // Assuming rows have an _id field (adjust based on your data type)
    const id = (row.original as any)._id;
    if (id) {
      newSelectedIds.add(id);
    }
  });
  setSelectedIds(newSelectedIds);
}, [rowSelection, table]);

// Restore selection from IDs when data changes (e.g., new page)
React.useEffect(() => {
  const newSelection: RowSelectionState = {};
  table.getRowModel().rows.forEach((row, index) => {
    const id = (row.original as any)._id;
    if (id && selectedIds.has(id)) {
      newSelection[index.toString()] = true;
    }
  });
  setRowSelection(newSelection);
}, [data, selectedIds]);
```

**Action Items**:

- [ ] Store selection by row ID (not index)
- [ ] Persist selected IDs across pages
- [ ] Restore selection when new data loads
- [ ] Test selection persists across pagination

### 6. Add State Persistence for All Features

**File**: `src/components/ui/data-table/data-table.tsx`

Persist all table state:

```typescript
interface DataTableProps<TData> {
  // ... existing props
  persistSorting?: boolean;
  persistFilters?: boolean;
  persistPagination?: boolean;
  persistColumnVisibility?: boolean;
  persistColumnOrder?: boolean;
  persistColumnSizing?: boolean;
  persistSelection?: boolean;
}

export function DataTable<TData>({
  // ... existing props
  persistSorting = true,
  persistFilters = true,
  persistPagination = true,
  persistColumnVisibility = true,
  persistColumnOrder = true,
  persistColumnSizing = true,
  persistSelection = true,
}: DataTableProps<TData>) {
  // Update existing localStorage hooks to respect persistence flags
  const [tableState, setTableState] = useLocalStorage<TableState>(
    persistColumnVisibility || persistColumnOrder || persistColumnSizing ? storageKey : null, // Don't persist if all disabled
    {
      columnVisibility: {},
      columnSizing: {},
      columnOrder: [],
    },
  );

  // Add separate persistence for sorting, filters, pagination
  // These will be managed by the parent component (inventory wrapper)
  // since they affect server queries
}
```

**Note**: For server-side tables, sorting/filtering/pagination state should be managed by the wrapper component, not the table itself, since they affect server queries.

**Action Items**:

- [ ] Add persistence flags to props
- [ ] Update localStorage hooks to respect flags
- [ ] Document which state is persisted where

### 7. Add Loading and Empty States

**File**: `src/components/ui/data-table/data-table.tsx`

Improve loading and empty states:

```typescript
interface DataTableProps<TData> {
  // ... existing props
  isLoading?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export function DataTable<TData>({
  // ... existing props
  isLoading = false,
  loadingState,
  emptyState,
}: DataTableProps<TData>) {
  // ... existing code

  return (
    <div className={className}>
      {/* ... toolbar, bulk actions, view options */}

      {isLoading ? (
        loadingState || (
          <div className="flex items-center justify-center h-48">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        )
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto rounded-md border">
          <Table className="w-auto min-w-max table-fixed">
            {/* ... headers */}
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  // ... row rendering
                ))
              ) : (
                <TableRow>
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
```

**Action Items**:

- [ ] Add loading state prop
- [ ] Add empty state prop
- [ ] Show loading UI when `isLoading` is true
- [ ] Show empty state when no rows
- [ ] Test loading and empty states

### 8. Add Accessibility Improvements

**File**: `src/components/ui/data-table/data-table.tsx`

Add ARIA labels and keyboard navigation:

```typescript
return (
  <div className={className} role="table" aria-label="Data table">
    {/* ... toolbar */}

    <div className="flex-1 overflow-x-auto overflow-y-auto rounded-md border">
      <Table className="w-auto min-w-max table-fixed">
        <TableHeader className="sticky top-0 bg-background z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} role="row">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  role="columnheader"
                  aria-sort={
                    header.column.getIsSorted() === "asc"
                      ? "ascending"
                      : header.column.getIsSorted() === "desc"
                      ? "descending"
                      : "none"
                  }
                  // ... existing props
                >
                  {/* ... header content */}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                role="row"
                aria-selected={row.getIsSelected()}
                // Add keyboard navigation
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    // Handle row action (e.g., open details)
                  }
                }}
                tabIndex={0}
              >
                {/* ... cells */}
              </TableRow>
            ))
          ) : (
            // ... empty state
          )}
        </TableBody>
      </Table>
    </div>
  </div>
);
```

**Action Items**:

- [ ] Add ARIA labels and roles
- [ ] Add `aria-sort` to sortable headers
- [ ] Add `aria-selected` to rows
- [ ] Add keyboard navigation (Enter/Space for row actions)
- [ ] Add `tabIndex` for keyboard focus
- [ ] Test with screen reader

### 9. Add Performance Optimizations

**File**: `src/components/ui/data-table/data-table.tsx`

Add memoization and optimizations:

```typescript
// Memoize columns
const memoizedColumns = React.useMemo(() => columns, [columns]);

// Memoize table instance
const table = useReactTable({
  data,
  columns: memoizedColumns,
  // ... rest of config
});

// Memoize row rendering
const renderRow = React.useCallback((row: Row<TData>) => {
  return (
    <TableRow key={row.id}>
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}, []);
```

**Action Items**:

- [ ] Memoize columns definition
- [ ] Memoize expensive computations
- [ ] Optimize re-renders with React.memo if needed
- [ ] Test performance with large datasets (1000+ rows)

### 10. Create Inventory-Specific Bulk Actions

**File**: `src/components/inventory/inventory-bulk-actions.tsx` (NEW)

Create inventory-specific bulk actions:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Archive } from "lucide-react";
import type { InventoryItem } from "@/types/inventory";

interface InventoryBulkActionsProps {
  selectedRows: InventoryItem[];
}

export function InventoryBulkActions({ selectedRows }: InventoryBulkActionsProps) {
  const handleDelete = () => {
    // Implement delete action
    console.log("Delete", selectedRows);
  };

  const handleArchive = () => {
    // Implement archive action
    console.log("Archive", selectedRows);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleArchive}
      >
        <Archive className="mr-2 h-4 w-4" />
        Archive ({selectedRows.length})
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete ({selectedRows.length})
      </Button>
    </>
  );
}
```

**Action Items**:

- [ ] Create inventory bulk actions component
- [ ] Add archive action
- [ ] Add delete action
- [ ] Integrate with inventory table wrapper

### 11. Integrate Everything in Inventory Wrapper

**File**: `src/components/inventory/inventory-table-wrapper.tsx`

Complete integration:

```typescript
import { InventoryBulkActions } from "./inventory-bulk-actions";

export function InventoryTableWrapper() {
  // ... existing state and queries

  const [selectedRows, setSelectedRows] = useState<InventoryItem[]>([]);

  return (
    <>
      <DataTable<InventoryItem>
        data={result.items || []}
        columns={columns}
        storageKey="inventory-table-state"
        pinnedStartColumns={["select"]}
        pinnedEndColumns={["actions"]}
        enableSorting={true}
        enableFiltering={true}
        enableRowSelection={true}
        enableToolbar={true}
        isLoading={result === undefined}
        onSortChange={handleSortChange}
        onGlobalFilterChange={handleFilterChange}
        onColumnFilterChange={handleColumnFilterChange}
        columnFilters={querySpec.filters || {}}
        onRowSelect={setSelectedRows}
        bulkActions={(props) => <InventoryBulkActions selectedRows={props.selectedRows} />}
        toolbarPlaceholder="Search part numbers..."
      />
      <DataTablePagination
        pageSize={querySpec.pagination.pageSize}
        hasMore={result ? !result.isDone : false}
        isLoading={result === undefined}
        onPageSizeChange={handlePageSizeChange}
        onNextPage={handleNextPage}
        onPreviousPage={handlePreviousPage}
      />
    </>
  );
}
```

**Action Items**:

- [ ] Add selection state management
- [ ] Pass all props to DataTable
- [ ] Add bulk actions component
- [ ] Test complete integration

## Testing Checklist

### Row Selection

- [ ] Individual row selection works
- [ ] Select all checkbox works
- [ ] Selection persists across pages (by ID, not index)
- [ ] Clear selection button works
- [ ] Selection count displays correctly

### Bulk Actions

- [ ] Bulk actions show when rows selected
- [ ] Bulk actions hide when no selection
- [ ] Custom bulk actions render correctly
- [ ] Bulk action buttons work (archive, delete, etc.)

### State Persistence

- [ ] Column visibility persists
- [ ] Column order persists
- [ ] Column sizing persists
- [ ] Selection persists (if enabled)
- [ ] Sorting/filtering/pagination state managed correctly

### Accessibility

- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] ARIA labels are present
- [ ] Focus management works

### Performance

- [ ] Table renders smoothly with 1000+ rows
- [ ] No unnecessary re-renders
- [ ] Memoization works correctly

## Success Criteria

✅ **All of the following must be true:**

1. Row selection works (individual and select all)
2. Selection persists across pagination (by ID)
3. Bulk actions component shows/hides correctly
4. Custom bulk actions work (archive, delete, etc.)
5. All table state persists correctly
6. Loading states show during queries
7. Empty states show when no data
8. Accessibility features work (keyboard nav, screen readers)
9. Performance is acceptable (no lag with large datasets)
10. No TypeScript or runtime errors

## Common Issues & Solutions

### Issue: Selection doesn't persist across pages

**Solution**: Use row IDs (like `_id`) instead of row indices. Store selected IDs in state.

### Issue: Bulk actions not showing

**Solution**: Verify `enableRowSelection` is true and `bulkActions` prop is provided.

### Issue: State not persisting

**Solution**: Check localStorage keys are unique. Verify persistence flags are enabled.

### Issue: Performance issues with large datasets

**Solution**: Add memoization. Consider virtual scrolling if needed (future enhancement).

### Issue: Accessibility not working

**Solution**: Verify ARIA labels are present. Test with screen reader. Check keyboard event handlers.

## Next Steps

Once this step is complete:

1. ✅ Verify all tests pass
2. ✅ Test with real inventory data
3. ✅ Test accessibility with screen reader
4. ✅ Performance test with large datasets
5. ✅ Document any deviations from this plan
6. ✅ **CONGRATULATIONS! The refactor is complete!** 🎉

---

## Final Checklist

Before considering this refactor complete, verify:

- [ ] All 4 steps are complete
- [ ] Inventory table uses new generic component
- [ ] All features work (sorting, filtering, pagination, selection)
- [ ] Server-side queries are efficient (check Convex dashboard)
- [ ] No regressions in existing functionality
- [ ] Code is clean and well-documented
- [ ] TypeScript types are correct
- [ ] Performance is acceptable
- [ ] Accessibility is improved
- [ ] Component is reusable for other data types

**Remember**: This is a significant refactor. Take time to test thoroughly and ensure everything works correctly!
