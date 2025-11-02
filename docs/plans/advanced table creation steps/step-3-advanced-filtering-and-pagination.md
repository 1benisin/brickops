# Step 3: Advanced Filtering & Pagination UI

**Status**: Implementation  
**Estimated Time**: ~2 days  
**Risk Level**: Medium  
**Prerequisites**: Step 0, Step 1, and Step 2 must be complete

## Overview

Add **advanced filter components** (number ranges, date ranges, select dropdowns) and **pagination UI controls**. This completes the filtering system and adds user-friendly pagination navigation.

**Key Features**:

- Number range filters (min/max for price, quantity)
- Date range filters (calendar picker)
- Select/dropdown filters (for condition, location)
- Pagination controls (previous/next, page size selector)
- Filter popover components with apply/clear buttons
- Active filter indicators

## Goals

- Create reusable filter components for different data types
- Add pagination UI controls (previous/next, page size)
- Integrate advanced filters with server-side queries
- Add filter popovers in column headers
- Show active filter indicators
- Support multiple filters simultaneously

## Prerequisites

- [x] Step 0 complete (server-side infrastructure)
- [x] Step 1 complete (core component)
- [x] Step 2 complete (sorting & basic filtering)
- [ ] Understanding of React form inputs
- [ ] Date picker component available (shadcn/ui Calendar)

## Step-by-Step Implementation

### 1. Create Filter Popover Component

**File**: `src/components/ui/data-table/filters/filter-popover.tsx` (NEW)

Create reusable popover wrapper for filters:

```typescript
"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterPopoverProps {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onApply?: () => void;
  onClear?: () => void;
  hasValue?: boolean;
}

export function FilterPopover({
  label,
  active = false,
  children,
  onApply,
  onClear,
  hasValue = false,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleApply = () => {
    onApply?.();
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 border-dashed",
            active && "border-solid bg-accent"
          )}
        >
          <Filter className="mr-2 h-4 w-4" />
          {label}
          {hasValue && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Active
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Filter by {label}</h4>
            {children}
          </div>
          <div className="flex items-center justify-end space-x-2">
            {hasValue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Action Items**:

- [ ] Create `filters/` directory
- [ ] Create `filter-popover.tsx`
- [ ] Style filter button with active indicator
- [ ] Test popover open/close behavior

### 2. Create Number Range Filter

**File**: `src/components/ui/data-table/filters/number-range-filter.tsx` (NEW)

Create filter for numeric ranges (price, quantity):

```typescript
"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberRangeFilterProps {
  columnId: string;
  value?: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number }) => void;
  placeholder?: { min?: string; max?: string };
  currency?: boolean;
  step?: number;
}

export function NumberRangeFilter({
  columnId,
  value,
  onChange,
  placeholder,
  currency = false,
  step = 1,
}: NumberRangeFilterProps) {
  const [min, setMin] = React.useState<string>(
    value?.min?.toString() || ""
  );
  const [max, setMax] = React.useState<string>(
    value?.max?.toString() || ""
  );

  React.useEffect(() => {
    const minNum = min === "" ? undefined : parseFloat(min);
    const maxNum = max === "" ? undefined : parseFloat(max);

    // Validate min <= max
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      return; // Don't update if invalid
    }

    onChange({ min: minNum, max: maxNum });
  }, [min, max, onChange]);

  const formatDisplayValue = (val: string) => {
    if (currency && val) {
      return val;
    }
    return val;
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-min`}>Min</Label>
        <Input
          id={`${columnId}-min`}
          type="number"
          step={step}
          value={formatDisplayValue(min)}
          onChange={(e) => setMin(e.target.value)}
          placeholder={placeholder?.min || "Min"}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-max`}>Max</Label>
        <Input
          id={`${columnId}-max`}
          type="number"
          step={step}
          value={formatDisplayValue(max)}
          onChange={(e) => setMax(e.target.value)}
          placeholder={placeholder?.max || "Max"}
        />
      </div>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `number-range-filter.tsx`
- [ ] Support currency formatting
- [ ] Add validation (min <= max)
- [ ] Test number input handling

### 3. Create Date Range Filter

**File**: `src/components/ui/data-table/filters/date-range-filter.tsx` (NEW)

Create filter for date ranges:

```typescript
"use client";

import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  columnId: string;
  value?: { start?: number; end?: number }; // Unix timestamps
  onChange: (value: { start?: number; end?: number }) => void;
}

export function DateRangeFilter({
  columnId,
  value,
  onChange,
}: DateRangeFilterProps) {
  const [from, setFrom] = React.useState<Date | undefined>(
    value?.start ? new Date(value.start) : undefined
  );
  const [to, setTo] = React.useState<Date | undefined>(
    value?.end ? new Date(value.end) : undefined
  );

  React.useEffect(() => {
    onChange({
      start: from ? from.getTime() : undefined,
      end: to ? to.getTime() : undefined,
    });
  }, [from, to, onChange]);

  return (
    <div className="space-y-2">
      <Label>Date Range</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={`${columnId}-date-filter`}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !from && !to && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {from ? (
              to ? (
                <>
                  {format(from, "LLL dd, y")} - {format(to, "LLL dd, y")}
                </>
              ) : (
                format(from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from, to }}
            onSelect={(range) => {
              setFrom(range?.from);
              setTo(range?.to);
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `date-range-filter.tsx`
- [ ] Install `date-fns` if not already installed
- [ ] Integrate shadcn/ui Calendar component
- [ ] Convert between Date objects and Unix timestamps
- [ ] Test date selection

### 4. Create Select Filter

**File**: `src/components/ui/data-table/filters/select-filter.tsx` (NEW)

Create filter for enum/select values:

```typescript
"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SelectFilterOption {
  label: string;
  value: string;
}

interface SelectFilterProps {
  columnId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  options: SelectFilterOption[];
  placeholder?: string;
}

export function SelectFilter({
  columnId,
  value,
  onChange,
  options,
  placeholder = "Select value...",
}: SelectFilterProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${columnId}-select`}>Filter</Label>
      <Select
        value={value || ""}
        onValueChange={(val) => onChange(val || undefined)}
      >
        <SelectTrigger id={`${columnId}-select`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `select-filter.tsx`
- [ ] Integrate shadcn/ui Select component
- [ ] Test dropdown selection
- [ ] Handle empty/undefined values

### 5. Create Pagination Component

**File**: `src/components/ui/data-table/data-table-pagination.tsx` (NEW)

Create pagination controls:

```typescript
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface DataTablePaginationProps {
  pageSize: number;
  hasMore: boolean;
  isLoading?: boolean;
  onPageSizeChange: (size: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeOptions?: number[];
}

export function DataTablePagination({
  pageSize,
  hasMore,
  isLoading = false,
  onPageSizeChange,
  onNextPage,
  onPreviousPage,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {/* Selection info could go here */}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={onPreviousPage}
            disabled={isLoading}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={onNextPage}
            disabled={!hasMore || isLoading}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Action Items**:

- [ ] Create `data-table-pagination.tsx`
- [ ] Add page size selector
- [ ] Add previous/next buttons
- [ ] Handle disabled states
- [ ] Style pagination controls

### 6. Integrate Filters into Column Headers

**File**: `src/components/ui/data-table/data-table-header.tsx`

Add filter popovers to headers:

```typescript
import { FilterPopover } from "../filters/filter-popover";
import { NumberRangeFilter } from "../filters/number-range-filter";
import { DateRangeFilter } from "../filters/date-range-filter";
import { SelectFilter } from "../filters/select-filter";

interface DataTableHeaderProps<TData, TValue> {
  header: HeaderContext<TData, TValue>;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  onSort?: (columnId: string) => void;
  onFilterChange?: (columnId: string, value: any) => void;
  filterValue?: any;
}

export function DataTableHeader<TData, TValue>({
  header,
  enableSorting = true,
  enableFiltering = true,
  onSort,
  onFilterChange,
  filterValue,
}: DataTableHeaderProps<TData, TValue>) {
  const canSort = enableSorting && header.column.getCanSort();
  const canFilter = enableFiltering && header.column.getCanFilter();
  const filterType = header.column.columnDef.meta?.filterType;
  const filterOptions = header.column.columnDef.meta?.filterOptions;

  // ... existing sort button code

  return (
    <div className="flex items-center space-x-2">
      {/* Sort button */}
      {canSort && (
        <Button
          variant="ghost"
          className="h-8 data-[state=open]:bg-accent -ml-3 hover:bg-accent"
          onClick={() => {
            header.column.toggleSorting();
            onSort?.(header.column.id);
          }}
        >
          {/* ... sort icon code */}
        </Button>
      )}

      {/* Filter popover */}
      {canFilter && (
        <FilterPopover
          label={header.column.columnDef.meta?.label || header.column.id}
          active={!!filterValue}
          hasValue={!!filterValue}
          onApply={() => {}} // Filter applies immediately via onChange
          onClear={() => onFilterChange?.(header.column.id, undefined)}
        >
          {filterType === "number" && (
            <NumberRangeFilter
              columnId={header.column.id}
              value={filterValue}
              onChange={(value) => onFilterChange?.(header.column.id, value)}
              currency={header.column.columnDef.meta?.filterConfig?.currency}
            />
          )}
          {filterType === "date" && (
            <DateRangeFilter
              columnId={header.column.id}
              value={filterValue}
              onChange={(value) => onFilterChange?.(header.column.id, value)}
            />
          )}
          {filterType === "select" && filterOptions && (
            <SelectFilter
              columnId={header.column.id}
              value={filterValue}
              onChange={(value) => onFilterChange?.(header.column.id, value)}
              options={filterOptions}
            />
          )}
        </FilterPopover>
      )}
    </div>
  );
}
```

**Action Items**:

- [ ] Update header to show filter popovers
- [ ] Conditionally render filter based on `filterType`
- [ ] Pass filter value and onChange callback
- [ ] Test filter popovers open/close

### 7. Update DataTable to Support Advanced Filters

**File**: `src/components/ui/data-table/data-table.tsx`

Add filter state management:

```typescript
interface DataTableProps<TData> {
  // ... existing props
  enableFiltering?: boolean;
  onColumnFilterChange?: (columnId: string, value: any) => void;
  columnFilters?: Record<string, any>;
}

export function DataTable<TData>({
  // ... existing props
  enableFiltering = true,
  onColumnFilterChange,
  columnFilters = {},
}: DataTableProps<TData>) {
  // ... existing code

  return (
    <div className={className}>
      {/* ... toolbar, view options */}
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                <DataTableHeader
                  header={header}
                  enableSorting={enableSorting}
                  enableFiltering={enableFiltering}
                  onSort={handleSort}
                  onFilterChange={onColumnFilterChange}
                  filterValue={columnFilters[header.column.id]}
                />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      {/* ... rest of table */}
    </div>
  );
}
```

**Action Items**:

- [ ] Add filter props to component
- [ ] Pass filter state to headers
- [ ] Handle filter changes via callback

### 8. Update Inventory Wrapper for Advanced Filters

**File**: `src/components/inventory/inventory-table-wrapper.tsx`

Connect advanced filters to QuerySpec:

```typescript
// Handle column filter changes
const handleColumnFilterChange = useCallback(
  (columnId: string, value: any) => {
    setQuerySpec((prev) => {
      const newFilters = { ...prev.filters };

      // Map column ID to QuerySpec filter format
      if (columnId === "price") {
        newFilters.price = value
          ? { kind: "numberRange", ...value }
          : undefined;
      } else if (columnId === "quantityAvailable") {
        newFilters.quantityAvailable = value
          ? { kind: "numberRange", ...value }
          : undefined;
      } else if (columnId === "createdAt") {
        newFilters.createdAt = value
          ? { kind: "dateRange", ...value }
          : undefined;
      } else if (columnId === "condition") {
        newFilters.condition = value
          ? { kind: "enum", value }
          : undefined;
      } else if (columnId === "location") {
        newFilters.location = value
          ? { kind: "enum", value }
          : undefined;
      } else {
        // Remove filter if value is undefined
        delete newFilters[columnId as keyof typeof newFilters];
      }

      return {
        ...prev,
        filters: Object.keys(newFilters).length > 0 ? newFilters : undefined,
        pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
      };
    });
  },
  []
);

// Update column definitions with filter options
const columns = useMemo(
  () => createInventoryColumns(syncConfig || {}).map((col) => {
    // Add filter options for select filters
    if (col.id === "condition") {
      return {
        ...col,
        meta: {
          ...col.meta,
          filterType: "select",
          filterOptions: [
            { label: "New", value: "new" },
            { label: "Used", value: "used" },
            { label: "For Parts", value: "forParts" },
          ],
        },
      };
    }
    if (col.id === "location") {
      // You might fetch locations dynamically
      return {
        ...col,
        meta: {
          ...col.meta,
          filterType: "select",
          filterOptions: [], // Populate from data
        },
      };
    }
    return col;
  }),
  [syncConfig]
);

return (
  <DataTable<InventoryItem>
    data={result.items || []}
    columns={columns}
    // ... existing props
    enableFiltering={true}
    onColumnFilterChange={handleColumnFilterChange}
    columnFilters={querySpec.filters || {}}
  />
);
```

**Action Items**:

- [ ] Implement `handleColumnFilterChange`
- [ ] Map column IDs to QuerySpec filter format
- [ ] Add filter options to column definitions
- [ ] Test all filter types work correctly

### 9. Integrate Pagination Component

**File**: `src/components/inventory/inventory-table-wrapper.tsx`

Add pagination controls:

```typescript
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";

// Add pagination handlers
const handlePageSizeChange = useCallback((size: number) => {
  setQuerySpec((prev) => ({
    ...prev,
    pagination: { ...prev.pagination, pageSize: size, cursor: undefined },
  }));
}, []);

const handleNextPage = useCallback(() => {
  if (result && !result.isDone) {
    setQuerySpec((prev) => ({
      ...prev,
      pagination: { ...prev.pagination, cursor: result.cursor },
    }));
  }
}, [result]);

const handlePreviousPage = useCallback(() => {
  // For cursor-based pagination, we'd need to track previous cursors
  // For now, reset to first page
  setQuerySpec((prev) => ({
    ...prev,
    pagination: { ...prev.pagination, cursor: undefined },
  }));
}, []);

return (
  <>
    <DataTable<InventoryItem>
      // ... existing props
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
```

**Action Items**:

- [ ] Add pagination component below table
- [ ] Implement pagination handlers
- [ ] Connect to QuerySpec pagination state
- [ ] Test pagination navigation

## Testing Checklist

### Number Range Filters

- [ ] Min/max inputs work correctly
- [ ] Currency formatting works (if applicable)
- [ ] Validation prevents min > max
- [ ] Filter applies to server query correctly
- [ ] Clear button resets filter

### Date Range Filters

- [ ] Calendar picker opens/closes correctly
- [ ] Date range selection works
- [ ] Selected dates display correctly
- [ ] Filter applies to server query correctly
- [ ] Timestamps convert correctly

### Select Filters

- [ ] Dropdown shows options correctly
- [ ] Selection applies filter correctly
- [ ] Clear/empty selection works
- [ ] Filter applies to server query correctly

### Pagination

- [ ] Page size selector works
- [ ] Next page button works (when hasMore)
- [ ] Previous page button works
- [ ] Pagination resets when filters change
- [ ] Loading state shows during pagination

### Integration

- [ ] Multiple filters work together
- [ ] Filters + sorting work together
- [ ] Filters + pagination work together
- [ ] Active filter indicators show correctly
- [ ] Clear all filters works

## Success Criteria

✅ **All of the following must be true:**

1. Number range filters work for price and quantity columns
2. Date range filters work for date columns
3. Select filters work for enum columns (condition, location)
4. Filter popovers open/close correctly
5. Active filter indicators show when filters are applied
6. Pagination controls work (next/previous, page size)
7. All filters send correct QuerySpec to server
8. Server returns correctly filtered results
9. Filters combine correctly (AND logic)
10. Pagination resets when filters change

## Common Issues & Solutions

### Issue: Date filter not working

**Solution**: Verify timestamp conversion (Date → number → Date). Check timezone handling.

### Issue: Number range filter not applying

**Solution**: Verify QuerySpec format matches server expectation. Check number parsing.

### Issue: Select filter options not showing

**Solution**: Verify `filterOptions` are provided in column meta. Check options format.

### Issue: Pagination not working

**Solution**: Verify cursor is being passed correctly. Check `hasMore` and `isDone` logic.

### Issue: Multiple filters not combining

**Solution**: Verify filters object is being merged correctly. Check QuerySpec structure.

## Next Steps

Once this step is complete:

1. ✅ Verify all tests pass
2. ✅ Test with various filter combinations
3. ✅ Test pagination with filtered data
4. ✅ Document any deviations from this plan
5. ✅ Proceed to **Step 4: Multiselect & Polish**

---

**Remember**: This step completes the filtering system. Focus on making filters intuitive and ensuring they work correctly with server queries!
