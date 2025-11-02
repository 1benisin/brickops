# Inventory Table Refactor: Reusable Data-Agnostic Table Component

**Status**: Planning  
**Created**: 2025-01-XX  
**Owner**: Development Team  
**Type**: Feature Enhancement & Component Refactor

---

## Executive Summary

This document outlines a comprehensive refactor of the inventory table into a **reusable, data-agnostic table component** with advanced features including sorting, filtering, pagination, multiselect, and column visibility controls. The component will be reusable across different data types (inventory, orders, catalog, etc.) through a column configuration API.

**⚠️ CRITICAL: 100% Server-Side Data Handling**  
All pagination, filtering, and sorting will be performed **entirely on the server** using Convex queries. No client-side processing. The component uses a `QuerySpec` pattern to send filter/sort/pagination parameters to a single Convex function that returns index-backed results. This ensures scalability for large inventories (10k+ items).

### Key Outcomes

- **Reusable Component**: Single generic table component with server-side data fetching
- **Server-Side Pagination**: Cursor-based pagination using Convex `.take()` (no offsets)
- **Server-Side Filtering**: Index-backed filtering for text (prefix), numbers (ranges), dates (ranges), enums
- **Server-Side Sorting**: Index-backed sorting with composite indexes for common query patterns
- **QuerySpec Pattern**: Normalized query contract between UI and server
- **Composite Indexes**: Optimized indexes for common filter + sort combinations
- **Multiselect**: Row selection with stable selection across pages
- **Column Controls**: Visibility toggles and drag-to-reorder column display (client-side UI only)
- **Performance**: Instant filtering/sorting with index-backed queries
- **Type Safety**: Full TypeScript support with generic data types

### Scope

- **Core Component**: Generic `DataTable` component with 100% server-side data handling
- **QuerySpec API**: Unified query contract pattern for filters + sort + pagination
- **Server-Side Queries**: Single Convex function that accepts QuerySpec and returns paginated results
- **Composite Indexes**: Add composite indexes for common query shapes (filter + sort combinations)
- **Filter Components**: Text (prefix search), number ranges, date ranges, enum/boolean filters
- **Column Configuration API**: Type-safe column definition system (index-backed columns only)
- **Inventory Migration**: Update inventory table to use new component
- **Estimated Effort**: 7-10 days across 4 incremental phases
- **Risk Level**: Medium-High (significant refactor including backend changes)
- **Breaking Changes**:
  - Inventory table API changes (removes `data` prop, requires `queryFn`)
  - Convex queries consolidated into single `listInventoryItemsFiltered` function
  - No client-side processing (TanStack Table client-side features removed)

---

## 1. Problem Statement & Motivation

### Current Pain Points

1. **No Sorting**

   - Users cannot sort by part number, name, quantity, price, etc.
   - Must manually scan through unsorted lists
   - No visual indicators for sortable columns

2. **No Filtering/Search**

   - Cannot filter by specific criteria (e.g., "show only items with price > $10")
   - No search functionality across text columns
   - Cannot combine multiple filters

3. **No Pagination**

   - All inventory items load at once
   - Performance degrades with large inventories
   - No way to navigate large datasets efficiently

4. **Limited Multiselect**

   - Checkboxes exist but no bulk actions
   - Cannot select multiple rows for operations
   - No selection state management

5. **Component Not Reusable**

   - Table logic tied to `InventoryItem` type
   - Cannot reuse for orders, catalog, or other data
   - Duplicate code for similar table implementations

6. **Missing Column Features**
   - Columns exist but lack sorting indicators
   - No column-specific filtering UI
   - Filter state not persisted

### Business Impact

- **User Productivity**: Users waste time manually searching unsorted data
- **Scalability**: Large inventories become unusable without pagination
- **Feature Development**: Cannot reuse table logic for other features
- **User Experience**: Missing standard table features users expect

---

## 2. Current Architecture Analysis

### Current Implementation

**Location**: `src/components/inventory/data-table/data-table.tsx`

**Features**:

- ✅ Column visibility controls
- ✅ Column ordering (drag-to-reorder)
- ✅ Column sizing (with localStorage persistence)
- ✅ Row selection checkboxes (non-functional)
- ❌ No sorting
- ❌ No filtering
- ❌ No pagination

**Architecture**:

```typescript
interface DataTableProps<TData> {
  data: TData[];
  syncConfig: MarketplaceSyncConfig; // ❌ Inventory-specific
}

// Uses TanStack Table v8 with:
- getCoreRowModel() only
- Column visibility, sizing, ordering
- localStorage for persistence
```

**Column Definition**: `src/components/inventory/data-table/columns.tsx`

- Hardcoded `InventoryItem` columns
- No sorting enabled
- No filtering enabled
- Mix of cell renderers and column configs

### Current Limitations

1. **Type-Specific**: `createColumns()` returns `ColumnDef<InventoryItem>[]` - not reusable
2. **No Sorting Logic**: `getCoreRowModel()` only - missing `getSortedRowModel()`
3. **No Filtering Logic**: Missing `getFilteredRowModel()` and filter state
4. **No Pagination Logic**: Missing `getPaginationRowModel()` and pagination state
5. **Limited Selection**: Selection state exists but not exposed or actionable

---

## 3. Convex Best Practices for Large Datasets

### 3.1 Why Server-Side?

Per [Convex documentation](https://docs.convex.dev/database/pagination), **you should paginate all large database queries**:

> If tables could contain more than a few thousand documents, consider pagination or an index with a range expression. Collecting a large number of documents into memory is inefficient.

**Current Problem**:

```typescript
// ❌ BAD: Loads ALL items into memory
const items = await ctx.db
  .query("inventoryItems")
  .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
  .collect(); // Loads everything!
```

**Issues with Current Approach**:

- Loads entire inventory into client memory (could be 10k+ items)
- Filters archived items in memory (inefficient)
- Sorts in memory (inefficient)
- Slow initial load for large inventories
- Wastes bandwidth and memory

### 3.2 Server-Side Pagination

**Recommended Approach**: Use `.take()` with cursor-based pagination

```typescript
// ✅ GOOD: Paginated query
export const listInventoryItems = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(), // Page size (default: 25)
      cursor: v.optional(v.string()), // Cursor from previous page
    }),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const numItems = args.paginationOpts.numItems ?? 25;

    const results = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount_createdAt", (q) =>
        q.eq("businessAccountId", businessAccountId),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc") // Sort by createdAt desc
      .take(numItems);

    // Get cursor for next page (last item's _id)
    const nextCursor = results.length === numItems ? results[results.length - 1]._id : undefined;

    return {
      items: results,
      nextCursor,
      hasMore: nextCursor !== undefined,
    };
  },
});
```

**Cursor-Based vs Offset-Based**:

- ✅ **Cursor-based** (recommended): More efficient, works with indexes, no skipped documents
- ⚠️ **Offset-based**: Works but less efficient for large datasets

### 3.3 Server-Side Filtering (Index-Backed)

**Push all filtering to server; design for indexes**:

```typescript
// Single unified query function with QuerySpec pattern
export const listInventoryItemsFiltered = query({
  args: {
    querySpec: v.object({
      filters: v.optional(v.record(v.string(), v.any())), // Normalized filter spec
      sort: v.array(
        v.object({
          id: v.string(),
          desc: v.boolean(),
        }),
      ),
      pagination: v.object({
        cursor: v.optional(v.string()),
        pageSize: v.number(),
      }),
    }),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const { filters, sort, pagination } = args.querySpec;

    // Choose best index based on QuerySpec (see index selection logic)
    const index = chooseBestIndex(filters, sort);

    // Build query with selected index
    let query = ctx.db
      .query("inventoryItems")
      .withIndex(index.name, (q) => {
        // Apply index predicates
        let builder = q.eq("businessAccountId", businessAccountId);
        if (index.usesCondition && filters?.condition) {
          builder = q.eq("condition", filters.condition.value);
        }
        if (index.usesLocation && filters?.location) {
          builder = q.eq("location", filters.location.value);
        }
        // ... apply other index fields based on chosen index
        return builder;
      })
      .filter((q) => {
        // Apply non-index filters and always filter archived
        let filter = q.eq(q.field("isArchived"), false);

        // Text prefix search for part number (string range on index)
        if (filters?.partNumber?.kind === "prefix") {
          const prefix = filters.partNumber.value;
          filter = q.and(
            filter,
            q.gte(q.field("partNumber"), prefix),
            q.lt(q.field("partNumber"), prefix + "\uffff"),
          );
        }

        // Number ranges
        if (filters?.price?.kind === "numberRange") {
          if (filters.price.min !== undefined) {
            filter = q.and(filter, q.gte(q.field("price"), filters.price.min));
          }
          if (filters.price.max !== undefined) {
            filter = q.and(filter, q.lte(q.field("price"), filters.price.max));
          }
        }

        // Date ranges
        if (filters?.createdAt?.kind === "dateRange") {
          if (filters.createdAt.start !== undefined) {
            filter = q.and(filter, q.gte(q.field("createdAt"), filters.createdAt.start));
          }
          if (filters.createdAt.end !== undefined) {
            filter = q.and(filter, q.lte(q.field("createdAt"), filters.createdAt.end));
          }
        }

        return filter;
      })
      .order(sort[0]?.desc ? "desc" : "asc")
      .take(pagination.pageSize);

    const results = await query;
    const cursor =
      results.length === pagination.pageSize ? results[results.length - 1]._id : undefined;

    return {
      items: results,
      cursor,
      isDone: cursor === undefined,
    };
  },
});
```

**Filter Types & Index Strategy**:

| Filter Type          | Index Strategy                 | Example                                        |
| -------------------- | ------------------------------ | ---------------------------------------------- |
| **Text Prefix**      | String range on indexed field  | `partNumber >= "abc" && < "abc\uffff"`         |
| **Enum/Boolean**     | Equality on indexed field      | `condition = "new"`                            |
| **Number Range**     | `>= / <=` on indexed field     | `price >= 300 && <= 1500`                      |
| **Date Range**       | `>= / <=` on indexed timestamp | `createdAt >= startOfDay && <= endOfDay`       |
| **Multiple Filters** | Use composite index            | `["condition", "createdAt"]` for filter + sort |

**Text Search**:

- ✅ **Prefix search** (`"abc*"`): Use string range on indexed `partNumber` field (efficient, index-backed)
- ⚠️ **Contains/Fuzzy**: Use `.filter()` with string matching (acceptable for filtered results, not index-backed)
- 🔍 **Full-text search**: Consider Convex search indexes or external search service for advanced features

### 3.4 Server-Side Sorting (Index-Backed Only)

**Only allow sorting on indexed fields - no client-side sorting**:

```typescript
// Sort must match an index
// Primary sort uses index efficiently
// Tiebreaker uses _id for stability (automatic in Convex)

// Example: Sort by createdAt desc
.withIndex("by_businessAccount_createdAt", (q) =>
  q.eq("businessAccountId", businessAccountId)
)
.order("desc") // Uses index efficiently
.take(pageSize);

// Multi-column sort: Use composite index
// Example: Sort by condition, then createdAt
// Uses index: ["businessAccountId", "condition", "createdAt"]
```

**Sorting Rules**:

1. **Primary sort**: Must be backed by an index (first sort column)
2. **Tiebreaker**: Always `_id` for stability (Convex provides automatically)
3. **No arbitrary multisort**: Only support approved sort combinations that match composite indexes
4. **UI restrictions**: Only show sortable columns that have matching indexes
5. **No client-side sorting**: All sorting happens server-side, even for small datasets

**Approved Sort Combinations** (based on composite indexes):

- `createdAt` (desc) - default listing
- `partNumber` (asc) - alphabetical part listing
- `price` (asc/desc) - price browsing
- `condition` + `createdAt` (desc) - filter by condition, sort by date
- `location` + `partNumber` (asc) - location view with alphabetical parts

### 3.5 Composite Index Strategy

**Design indexes around common query shapes** (filter + sort combinations):

**Add to `convex/inventory/schema.ts`**:

```typescript
export const inventoryTables = {
  inventoryItems: defineTable({
    // ... existing fields
  })
    // Existing indexes
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_fileId", ["fileId"])

    // NEW: Composite indexes for common query patterns
    // Pattern: filter by status/condition + sort by date
    .index("by_businessAccount_condition_createdAt", [
      "businessAccountId",
      "condition",
      "createdAt",
    ])

    // Pattern: filter by location + sort by part number (for location view)
    .index("by_businessAccount_location_partNumber", [
      "businessAccountId",
      "location",
      "partNumber",
    ])

    // Pattern: filter by price range + sort by price (for price browsing)
    .index("by_businessAccount_price", ["businessAccountId", "price"])

    // Pattern: default listing (sort by createdAt desc)
    .index("by_businessAccount_createdAt", ["businessAccountId", "createdAt"])

    // Pattern: part number prefix search + sort by part number
    .index("by_businessAccount_partNumber", ["businessAccountId", "partNumber"])

    // Pattern: quantity filtering + sort by quantity
    .index("by_businessAccount_quantity", ["businessAccountId", "quantityAvailable"]),

  // Tiebreaker: Always sort by _id for stability (Convex provides this automatically)
};
```

**Index Selection Logic in Query**:

- Server analyzes QuerySpec to choose best matching index
- Prefer composite indexes that match filter + sort exactly
- Fallback to simpler indexes when needed
- Example: Filter by `condition="new"` + sort by `createdAt desc` → uses `by_businessAccount_condition_createdAt`

### 3.6 QuerySpec Pattern (Unified Query Contract)

**Normalized Query Contract**: Single query specification pattern that UI sends to server

```typescript
// QuerySpec - what the UI sends to server
interface QuerySpec {
  filters: {
    [columnId: string]:
      | { kind: "text"; op: "contains" | "prefix"; value: string }
      | { kind: "enum"; values: string[] }
      | { kind: "boolean"; value: boolean }
      | { kind: "numberRange"; min?: number; max?: number }
      | { kind: "dateRange"; start?: number; end?: number };
  };
  sort: Array<{
    id: string; // column id
    desc: boolean;
  }>; // Primary sort + optional tiebreaker
  pagination: {
    cursor?: string; // Cursor from previous page
    pageSize: number; // Capped (25/50/100)
  };
}

// QueryResult - what server returns
interface QueryResult<TData> {
  items: TData[];
  cursor?: string; // Cursor for next page
  isDone: boolean; // True if no more pages
}

// Component Props (100% server-side)
interface DataTableProps<TData> {
  // REQUIRED: Server-side query function
  queryFn: (spec: QuerySpec) => Promise<QueryResult<TData>>;
  columns: ColumnConfig<TData>[];

  // Column definitions specify which columns support server-side operations
  // Only index-backed sorts/filters are exposed in UI
}
```

**Benefits**:

- Single query function handles all combinations
- Server chooses best index based on QuerySpec
- Type-safe filter/sort definitions
- No client-side processing ever

---

## 4. Target Architecture

### Architectural Principles

1. **Data Agnostic**: Component accepts generic `TData` type and column definitions
2. **Column-Driven Configuration**: Columns define their own sorting, filtering, and rendering behavior
3. **Composition over Configuration**: Filter components are separate, composable pieces
4. **Type Safety**: Full TypeScript generics with column definition validation
5. **Performance First**: Virtual scrolling and pagination for large datasets
6. **Progressive Enhancement**: Features work independently (sorting without filtering, etc.)

### Component Structure

```
src/components/ui/data-table/
├── data-table.tsx                    # Main component
├── data-table-toolbar.tsx                  # Search, filters, actions
├── data-table-pagination.tsx             # Pagination controls
├── data-table-view-options.tsx           # Column visibility/ordering
├── filters/
│   ├── text-filter.tsx                   # Text search filter
│   ├── number-range-filter.tsx           # Min/max number filter
│   ├── date-range-filter.tsx             # Date range picker
│   ├── select-filter.tsx                 # Dropdown select filter
│   └── filter-popover.tsx                # Filter wrapper with apply/clear
├── column-definitions.ts                 # Column type definitions & helpers
└── hooks/
    ├── use-data-table.ts                 # Core table hook
    ├── use-data-table-sorting.ts         # Sorting logic
    ├── use-data-table-filtering.ts       # Filtering logic
    └── use-data-table-pagination.ts      # Pagination logic
```

### Column Configuration API

```typescript
// New column definition system
type ColumnFilterType = "text" | "number" | "date" | "select" | "boolean" | "custom";

interface BaseColumnConfig<TData, TValue> {
  id: string;
  header: string | ((props: HeaderContext<TData, TValue>) => React.ReactNode);
  accessorKey?: keyof TData;
  accessorFn?: (row: TData) => TValue;
  cell?: (props: CellContext<TData, TValue>) => React.ReactNode;

  // Sorting
  enableSorting?: boolean;
  sortingFn?: SortingFn<TData>;

  // Filtering
  enableFiltering?: boolean;
  filterType?: ColumnFilterType;
  filterFn?: FilterFn<TData>;
  filterComponent?: (props: FilterComponentProps<TData, TValue>) => React.ReactNode;

  // Visibility & Ordering
  enableHiding?: boolean;
  enableResizing?: boolean;

  // Sizing
  size?: number;
  minSize?: number;
  maxSize?: number;

  // Metadata
  meta?: {
    label?: string;
    description?: string;
    filterPlaceholder?: string;
    [key: string]: any;
  };
}

// Usage example
const inventoryColumns: ColumnConfig<InventoryItem>[] = [
  {
    id: "partNumber",
    accessorKey: "partNumber",
    header: "Part Number",
    enableSorting: true,
    enableFiltering: true,
    filterType: "text",
    size: 120,
  },
  {
    id: "quantityAvailable",
    accessorKey: "quantityAvailable",
    header: "Available",
    enableSorting: true,
    enableFiltering: true,
    filterType: "number",
    cell: ({ row }) => row.getValue("quantityAvailable").toLocaleString(),
    size: 100,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Date Created",
    enableSorting: true,
    enableFiltering: true,
    filterType: "date",
    cell: ({ row }) => formatRelativeTime(row.getValue("createdAt")),
    size: 150,
  },
];
```

### Component Props

```typescript
interface DataTableProps<TData> {
  // Data
  data: TData[];
  columns: ColumnConfig<TData>[];

  // Features
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enablePagination?: boolean;
  enableRowSelection?: boolean;
  enableColumnVisibility?: boolean;

  // Pagination
  pageSize?: number;
  pageSizeOptions?: number[];
  defaultPageSize?: number;

  // Selection
  onRowSelect?: (rows: TData[]) => void;
  bulkActions?: (props: BulkActionsProps<TData>) => React.ReactNode;

  // Filtering
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;

  // Sorting
  defaultSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;

  // Persistence
  storageKey?: string; // localStorage key for state persistence
  persistColumnVisibility?: boolean;
  persistColumnOrder?: boolean;
  persistColumnSizing?: boolean;
  persistSorting?: boolean;
  persistFilters?: boolean;
  persistPagination?: boolean;

  // Customization
  toolbarActions?: React.ReactNode;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;

  // Callbacks
  onRowClick?: (row: Row<TData>) => void;
  onRowDoubleClick?: (row: Row<TData>) => void;

  // Styling
  className?: string;
  tableClassName?: string;
}
```

### Filter Component Architecture

```typescript
// Text Filter (for strings)
<TextFilter
  column={column}
  value={filterValue}
  onChange={setFilterValue}
  placeholder="Search..."
/>

// Number Range Filter (for numbers, currency)
<NumberRangeFilter
  column={column}
  value={filterValue} // { min?: number, max?: number }
  onChange={setFilterValue}
  placeholder={{ min: "Min", max: "Max" }}
  currency?: boolean
/>

// Date Range Filter (for dates)
<DateRangeFilter
  column={column}
  value={filterValue} // { from?: Date, to?: Date }
  onChange={setFilterValue}
/>

// Select Filter (for enums, categories)
<SelectFilter
  column={column}
  value={filterValue}
  onChange={setFilterValue}
  options={[
    { label: "New", value: "new" },
    { label: "Used", value: "used" },
  ]}
/>
```

---

## 5. Incremental Implementation Strategy

### Phase 0: Server-Side Infrastructure (PREREQUISITE, ~2 days)

**Goal**: Add server-side pagination, filtering, and sorting to Convex queries before building the UI

**Changes**:

1. **Add Indexes to Schema** (`convex/inventory/schema.ts`)

   - Add indexes for sorting: `by_businessAccount_createdAt`, `by_businessAccount_partNumber`
   - Add indexes for filtering: `by_businessAccount_location`, `by_businessAccount_price`, `by_businessAccount_quantity`
   - Add index for condition: `by_businessAccount_condition`
   - Run schema migration

2. **Create Paginated Query** (`convex/inventory/queries.ts`)

   - Refactor `listInventoryItems` to support cursor-based pagination
   - Add `paginationOpts` parameter (numItems, cursor)
   - Return `{ items, nextCursor, hasMore }`
   - Use `.take()` instead of `.collect()`
   - Filter `isArchived` in query, not in memory

3. **Add Filtered Query** (`convex/inventory/queries.ts`)

   - Create `listInventoryItemsFiltered` query
   - Support filters: partNumber, location, minPrice, maxPrice, minQuantity, condition
   - Combine filters with AND logic
   - Use appropriate indexes based on active filters

4. **Add Sorting Support**

   - Add `sortBy` parameter: `"createdAt" | "partNumber" | "price" | "quantityAvailable"`
   - Add `sortOrder` parameter: `"asc" | "desc"`
   - Use appropriate index for each sort field
   - Default to `createdAt desc`

5. **Update Query Validators** (`convex/inventory/validators.ts`)
   - Add validators for new query parameters
   - Type-safe filter and pagination options

**Why Start Here**:

- **CRITICAL**: Must be done before UI work
- Establishes data fetching infrastructure
- Enables efficient large dataset handling
- Allows testing queries independently

**Testing**:

- [ ] Query returns paginated results correctly
- [ ] Cursor pagination works (next page loads correctly)
- [ ] Filters reduce result set correctly
- [ ] Sorting changes result order correctly
- [ ] Indexes are used efficiently (check Convex dashboard)

### Phase 1: Create Reusable Core Component (Low Risk, ~1.5 days)

**Goal**: Extract generic table component from inventory-specific implementation with server-side support

**Changes**:

1. Create `src/components/ui/data-table/data-table.tsx`

   - Generic `DataTable<TData>` component
   - **100% server-side**: Requires `queryFn` prop only (no `data` prop)
   - Accepts `columns` prop for column definitions
   - Remove inventory-specific logic (`syncConfig`, `EditInventoryItemDialog`)
   - Uses TanStack Table for UI only (not for data processing)

2. Create `src/components/ui/data-table/column-definitions.ts`

   - Type-safe column configuration types
   - Helper functions for column creation
   - Type inference utilities

3. Create `src/components/ui/data-table/data-table-view-options.tsx`

   - Move column manager logic to UI component
   - Make it generic (no inventory assumptions)

4. Create server-side query hook (`src/hooks/use-server-table.ts`)

   - Manages pagination state (cursor, page size)
   - Manages filter state
   - Manages sort state
   - Calls Convex query with params
   - Returns loading/error states

5. Update inventory table to use new component
   - Create `src/components/inventory/inventory-table-wrapper.tsx`
   - Use server-side mode with `listInventoryItemsFiltered` query
   - Pass inventory columns to generic component
   - Maintain backward compatibility (fallback to client-side if needed)

**Why Next**:

- Establishes foundation for all features
- Integrates server-side queries with UI
- Low risk (can fallback to client-side)
- Easy to validate (same functionality, better performance)

### Phase 2: Add Sorting & Basic Filtering (Medium Risk, ~2 days)

**Goal**: Add sortable columns and text-based filtering with server-side integration

**Changes**:

1. **Server-Side Sorting Integration**

   - Update `use-server-table.ts` to handle sort changes
   - When user clicks sort, update QuerySpec and call `queryFn`
   - Use appropriate Convex composite index based on sort column + active filters
   - Display sort indicators in column headers (arrows)
   - Only show sort controls for index-backed columns
   - Cancel in-flight requests when sort changes (AbortController)

2. **Server-Side Text Filtering**

   - Add part number prefix search to server query (string range on index)
   - Update `use-server-table.ts` to handle filter changes
   - Debounce filter inputs (300ms) before querying server
   - Cancel in-flight requests when filter changes (AbortController)
   - Clear cursor when filters change (start from page 1)
   - Create `use-data-table-filtering.ts` hook for filter state management

3. **Update Column Definitions**

   - Add `enableSorting` to column configs
   - Add `enableFiltering` to column configs
   - Add `filterType: "text"` for text columns (part number, name)
   - Map column IDs to Convex query parameters

4. **Create Toolbar Component**

   - Create `src/components/ui/data-table/data-table-toolbar.tsx`
   - Global search input (maps to part number filter)
   - Filter toggles per column
   - Clear filters button
   - Show active filter count

5. **Update Convex Query**
   - Add `partNumberSearch` parameter (partial match)
   - Use `.filter()` with string matching for partial searches
   - Optimize: Use index when possible, filter when needed

**Why Next**:

- Most requested feature (sorting)
- Text filtering is simplest filter type
- Builds on Phase 0 and Phase 1 foundation
- Server-side integration is critical for performance

### Phase 3: Advanced Filtering & Pagination UI (Medium Risk, ~2 days)

**Goal**: Add number range filters, date range filters, and pagination UI components

**Changes**:

1. Create filter components

   - `src/components/ui/data-table/filters/number-range-filter.tsx`
     - Min/max inputs for numeric columns
     - Currency formatting support
   - `src/components/ui/data-table/filters/date-range-filter.tsx`
     - Date picker for date columns
     - Range selection (from/to)
   - `src/components/ui/data-table/filters/select-filter.tsx`
     - Dropdown for enum/select columns
   - `src/components/ui/data-table/filters/filter-popover.tsx`
     - Wrapper with apply/clear buttons

2. Add pagination UI components

   - Server-side pagination already implemented in Phase 0
   - Create `src/components/ui/data-table/data-table-pagination.tsx`
   - Page size selector (updates query `numItems`)
   - Previous/next navigation (uses cursor)
   - Page number display (if total count available)
   - "Load more" button for infinite scroll option
   - Update `use-server-table.ts` to handle pagination state

3. Update column definitions

   - Add `filterType: "number"` for quantity, price`
   - Add `filterType: "date"` for date columns
   - Add `filterType: "select"` for condition, location

4. Update toolbar
   - Filter popovers in column headers
   - Active filter indicators
   - Filter badge count

**Why Next**:

- Completes filtering system
- Pagination critical for performance
- Users need these features together

### Phase 4: Multiselect & Polish (Low-Medium Risk, ~1.5 days)

**Goal**: Functional row selection, bulk actions, and final polish

**Changes**:

1. Implement multiselect

   - Functional checkbox selection
   - `onRowSelect` callback prop
   - Selection state management
   - Bulk actions component slot

2. Create bulk actions component

   - `src/components/ui/data-table/data-table-bulk-actions.tsx`
   - Shows when rows are selected
   - Custom action buttons via props
   - Selection count display

3. State persistence

   - Persist sorting state to localStorage
   - Persist filter state to localStorage
   - Persist pagination state to localStorage
   - Configurable per feature via props

4. Performance optimizations

   - Memoize column definitions
   - Virtual scrolling for large lists (if needed)
   - Debounce filter inputs
   - Optimize re-renders

5. Accessibility
   - Keyboard navigation
   - ARIA labels
   - Screen reader announcements
   - Focus management

**Why Last**:

- Builds on all previous phases
- Lower priority than core features
- Can be enhanced incrementally

---

## 5. Detailed Technical Changes

### Phase 1: Core Component

#### 5.1.1 Create Generic DataTable Component

**File**: `src/components/ui/data-table/data-table.tsx`

```typescript
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
  SortingState,
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

// Column configuration type
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

#### 5.1.2 Create Column Definitions Helper

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

// Helper to create typed columns
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

#### 5.1.3 Create View Options Component

**File**: `src/components/ui/data-table/data-table-view-options.tsx`

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
import { SortableColumnItem } from "./sortable-column-item";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  onResetAll: () => void;
}

export function DataTableViewOptions<TData>({
  table,
  onResetAll,
}: DataTableViewOptionsProps<TData>) {
  // Same logic as current DataTableColumnManager, but generic
  const allLeafColumns = table.getAllLeafColumns();
  const hideableColumns = allLeafColumns.filter((column) => column.getCanHide());
  const currentColumnOrder = table.getState().columnOrder;

  // ... (same drag-and-drop logic)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto mb-2">
          <Settings2 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[350px]">
        {/* Same UI as current implementation */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### 5.1.4 Update Inventory Table

**File**: `src/components/inventory/inventory-table-wrapper.tsx` (NEW)

```typescript
"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/ui/data-table/data-table";
import { createInventoryColumns } from "./inventory-columns";
import type { InventoryItem } from "@/types/inventory";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function InventoryTableWrapper() {
  const items = useQuery(api.inventory.queries.listInventoryItems);
  const syncConfig = useQuery(api.marketplace.queries.getMarketplaceSyncConfig);

  const columns = useMemo(
    () => createInventoryColumns(syncConfig),
    [syncConfig],
  );

  if (items === undefined || syncConfig === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <DataTable<InventoryItem>
      data={items || []}
      columns={columns}
      storageKey="inventory-table-state"
      pinnedStartColumns={["select"]}
      pinnedEndColumns={["actions"]}
    />
  );
}
```

**File**: `src/components/inventory/data-table/columns.tsx` (UPDATE)

```typescript
// Update to use new createColumn helper
import { createColumn } from "@/components/ui/data-table/column-definitions";
import type { ColumnDef } from "@tanstack/react-table";
import type { InventoryItem } from "@/types/inventory";

export const createInventoryColumns = (
  syncConfig: MarketplaceSyncConfig,
): ColumnDef<InventoryItem>[] => {
  return [
    createColumn({
      id: "select",
      // ... selection column
    }),
    createColumn({
      id: "partNumber",
      accessorKey: "partNumber",
      header: "Part Number",
      meta: { label: "Part Number" },
      // ... rest of config
    }),
    // ... other columns
  ];
};
```

**Testing Phase 1**:

- [ ] Generic component renders with inventory data
- [ ] Column visibility controls work
- [ ] Column ordering works
- [ ] Column sizing works
- [ ] No regressions in inventory table functionality

---

### Phase 2: Sorting & Basic Filtering

#### 5.2.1 Add Sorting Support

**File**: `src/components/ui/data-table/data-table.tsx` (UPDATE)

```typescript
import {
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  // ... other imports
} from "@tanstack/react-table";

interface DataTableProps<TData> {
  // ... existing props
  enableSorting?: boolean;
  defaultSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  persistSorting?: boolean;
}

export function DataTable<TData>({
  // ... existing props
  enableSorting = true,
  defaultSorting,
  onSortingChange,
  persistSorting = true,
}: DataTableProps<TData>) {
  // Add sorting state
  const [sorting, setSorting] = useLocalStorage<SortingState>(
    persistSorting ? `${storageKey}-sorting` : null,
    defaultSorting || [],
  );

  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      onSortingChange?.(newSorting);
    },
    [sorting, setSorting, onSortingChange],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    onSortingChange: enableSorting ? handleSortingChange : undefined,
    state: {
      // ... existing state
      sorting: enableSorting ? sorting : undefined,
    },
  });
}
```

**File**: `src/components/ui/data-table/data-table-header.tsx` (NEW)

```typescript
"use client";

import { HeaderContext } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableHeaderProps<TData, TValue> {
  header: HeaderContext<TData, TValue>;
  enableSorting?: boolean;
}

export function DataTableHeader<TData, TValue>({
  header,
  enableSorting = true,
}: DataTableHeaderProps<TData, TValue>) {
  const canSort = enableSorting && header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();

  if (!canSort) {
    return <>{header.column.columnDef.header}</>;
  }

  return (
    <Button
      variant="ghost"
      className="h-8 data-[state=open]:bg-accent -ml-3"
      onClick={() => header.column.toggleSorting()}
    >
      <span>{header.column.columnDef.header as string}</span>
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

#### 5.2.2 Add Text Filtering

**File**: `src/components/ui/data-table/data-table.tsx` (UPDATE)

```typescript
import {
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnFiltersState,
  // ... other imports
} from "@tanstack/react-table";

interface DataTableProps<TData> {
  // ... existing props
  enableFiltering?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  persistFilters?: boolean;
}

export function DataTable<TData>({
  // ... existing props
  enableFiltering = true,
  globalFilter,
  onGlobalFilterChange,
  columnFilters,
  onColumnFiltersChange,
  persistFilters = true,
}: DataTableProps<TData>) {
  // Global filter state
  const [globalFilterValue, setGlobalFilterValue] = useLocalStorage<string>(
    persistFilters ? `${storageKey}-global-filter` : null,
    globalFilter || "",
  );

  // Column filters state
  const [columnFiltersValue, setColumnFiltersValue] = useLocalStorage<ColumnFiltersState>(
    persistFilters ? `${storageKey}-column-filters` : null,
    columnFilters || [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    globalFilterFn: "includesString", // Default text filter
    state: {
      // ... existing state
      globalFilter: enableFiltering ? globalFilterValue : undefined,
      columnFilters: enableFiltering ? columnFiltersValue : undefined,
    },
    onGlobalFilterChange: enableFiltering ? setGlobalFilterValue : undefined,
    onColumnFiltersChange: enableFiltering
      ? (updater) => {
          const newFilters = typeof updater === "function" ? updater(columnFiltersValue) : updater;
          setColumnFiltersValue(newFilters);
          onColumnFiltersChange?.(newFilters);
        }
      : undefined,
  });
}
```

**File**: `src/components/ui/data-table/data-table-toolbar.tsx` (NEW)

```typescript
"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
}

export function DataTableToolbar<TData>({
  table,
  globalFilter,
  onGlobalFilterChange,
}: DataTableToolbarProps<TData>) {
  const [value, setValue] = React.useState(globalFilter || "");

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      table.setGlobalFilter(value);
      onGlobalFilterChange?.(value);
    }, 300); // Debounce

    return () => clearTimeout(timeoutId);
  }, [value, table, onGlobalFilterChange]);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder="Search all columns..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-sm"
        />
        {value && (
          <Button
            variant="ghost"
            onClick={() => {
              setValue("");
              table.setGlobalFilter("");
            }}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Testing Phase 2**:

- [ ] Columns sort when clicked
- [ ] Sort indicators show correct direction
- [ ] Global search filters all columns
- [ ] Column-specific filters work
- [ ] Filter state persists to localStorage

---

### Phase 3: Advanced Filtering & Pagination

#### 5.3.1 Create Number Range Filter

**File**: `src/components/ui/data-table/filters/number-range-filter.tsx`

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
}

export function NumberRangeFilter({
  columnId,
  value,
  onChange,
  placeholder,
  currency = false,
}: NumberRangeFilterProps) {
  const [min, setMin] = React.useState<string>(value?.min?.toString() || "");
  const [max, setMax] = React.useState<string>(value?.max?.toString() || "");

  React.useEffect(() => {
    const minNum = min === "" ? undefined : parseFloat(min);
    const maxNum = max === "" ? undefined : parseFloat(max);
    onChange({ min: minNum, max: maxNum });
  }, [min, max, onChange]);

  const formatValue = (val: string) => {
    if (currency && val) {
      return `$${val}`;
    }
    return val;
  };

  return (
    <div className="space-y-2 p-2">
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-min`}>Min</Label>
        <Input
          id={`${columnId}-min`}
          type="number"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder={placeholder?.min || "Min"}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-max`}>Max</Label>
        <Input
          id={`${columnId}-max`}
          type="number"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder={placeholder?.max || "Max"}
        />
      </div>
    </div>
  );
}
```

#### 5.3.2 Create Date Range Filter

**File**: `src/components/ui/data-table/filters/date-range-filter.tsx`

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
  value?: { from?: Date; to?: Date };
  onChange: (value: { from?: Date; to?: Date }) => void;
}

export function DateRangeFilter({ columnId, value, onChange }: DateRangeFilterProps) {
  const [from, setFrom] = React.useState<Date | undefined>(value?.from);
  const [to, setTo] = React.useState<Date | undefined>(value?.to);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    onChange({ from, to });
  }, [from, to, onChange]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
            if (range?.from && range?.to) {
              setIsOpen(false);
            }
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
```

#### 5.3.3 Add Pagination

**File**: `src/components/ui/data-table/data-table.tsx` (UPDATE)

```typescript
import {
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  // ... other imports
} from "@tanstack/react-table";

interface DataTableProps<TData> {
  // ... existing props
  enablePagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  persistPagination?: boolean;
}

export function DataTable<TData>({
  // ... existing props
  enablePagination = true,
  pageSize: initialPageSize,
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 25,
  persistPagination = true,
}: DataTableProps<TData>) {
  // Pagination state
  const [pagination, setPagination] = useLocalStorage<PaginationState>(
    persistPagination ? `${storageKey}-pagination` : null,
    {
      pageIndex: 0,
      pageSize: initialPageSize || defaultPageSize,
    },
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    state: {
      // ... existing state
      pagination: enablePagination ? pagination : undefined,
    },
    onPaginationChange: enablePagination ? setPagination : undefined,
    pageCount: undefined, // Client-side pagination
  });
}
```

**File**: `src/components/ui/data-table/data-table-pagination.tsx` (NEW)

```typescript
"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected.
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Testing Phase 3**:

- [ ] Number range filters work for quantity, price columns
- [ ] Date range filters work for date columns
- [ ] Pagination displays correct page numbers
- [ ] Page size selector works
- [ ] Previous/next navigation works
- [ ] Filter state persists

---

### Phase 4: Multiselect & Polish

#### 5.4.1 Implement Functional Multiselect

**File**: `src/components/ui/data-table/data-table.tsx` (UPDATE)

```typescript
import {
  RowSelectionState,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
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
  enableRowSelection = true,
  onRowSelect,
  bulkActions,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
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
}
```

#### 5.4.2 Create Bulk Actions Component

**File**: `src/components/ui/data-table/data-table-bulk-actions.tsx` (NEW)

```typescript
"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DataTableBulkActionsProps<TData> {
  table: Table<TData>;
  children?: React.ReactNode;
}

export function DataTableBulkActions<TData>({
  table,
  children,
}: DataTableBulkActionsProps<TData>) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded-md">
      <div className="text-sm text-muted-foreground">
        {selectedCount} row(s) selected
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetRowSelection()}
        >
          <X className="h-4 w-4 mr-2" />
          Clear selection
        </Button>
      </div>
    </div>
  );
}
```

#### 5.4.3 Update Column Definitions for Inventory

**File**: `src/components/inventory/inventory-columns.tsx` (NEW - refactored from columns.tsx)

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
      id: "partNumber",
      accessorKey: "partNumber",
      header: "Part Number",
      enableSorting: true,
      enableFiltering: true,
      meta: {
        label: "Part Number",
        filterType: "text",
        filterPlaceholder: "Search part numbers...",
      },
      cell: ({ row }) => (
        <div className="font-medium font-mono">{row.getValue("partNumber")}</div>
      ),
      size: 120,
    }),
    createColumn({
      id: "quantityAvailable",
      accessorKey: "quantityAvailable",
      header: "Available",
      enableSorting: true,
      enableFiltering: true,
      meta: {
        label: "Available",
        filterType: "number",
      },
      cell: ({ row }) => {
        const quantity = row.getValue("quantityAvailable") as number;
        return <div className="text-right font-mono">{quantity.toLocaleString()}</div>;
      },
      size: 100,
    }),
    createColumn({
      id: "price",
      accessorKey: "price",
      header: "Unit Price",
      enableSorting: true,
      enableFiltering: true,
      meta: {
        label: "Unit Price",
        filterType: "number",
        filterConfig: { currency: true },
      },
      cell: ({ row }) => {
        const price = row.getValue("price") as number | undefined;
        if (!price) return null;
        return <div className="text-right font-mono">{formatCurrency(price)}</div>;
      },
      size: 120,
    }),
    createColumn({
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Date Created",
      enableSorting: true,
      enableFiltering: true,
      meta: {
        label: "Date Created",
        filterType: "date",
      },
      cell: ({ row }) => {
        const timestamp = row.getValue("createdAt") as number;
        return <div className="text-sm">{formatRelativeTime(timestamp)}</div>;
      },
      size: 150,
    }),
    // ... other columns
  ];
};
```

**Testing Phase 4**:

- [ ] Row selection works with checkboxes
- [ ] Bulk actions component shows when rows selected
- [ ] Selection state cleared properly
- [ ] `onRowSelect` callback fires correctly
- [ ] All state persists to localStorage
- [ ] Performance acceptable with 1000+ rows

---

## 6. Testing Strategy

### Unit Tests

1. **Column Configuration**

   - Column definitions create correct TanStack columns
   - Filter types map to correct filter components
   - Sorting functions work correctly

2. **Filter Components**

   - Text filter updates table state
   - Number range filter validates inputs
   - Date range filter handles date selection
   - Filter popover shows/hides correctly

3. **Pagination**

   - Page size changes update table
   - Navigation buttons enable/disable correctly
   - Page count calculates correctly

4. **Selection**
   - Row selection updates state
   - Bulk actions show/hide correctly
   - Selection persists across page changes

### Integration Tests

1. **Full Table Flow**

   - Data loads and displays
   - Sorting works end-to-end
   - Filtering reduces rows correctly
   - Pagination navigates correctly
   - Selection works across filtered/sorted data

2. **State Persistence**
   - Column visibility persists
   - Sorting state persists
   - Filter state persists
   - Pagination state persists

### End-to-End Tests

1. **Inventory Table**

   - User can sort by part number
   - User can filter by quantity range
   - User can filter by date created
   - User can select multiple rows
   - User can perform bulk actions

2. **Reusability**
   - Component works with orders data
   - Component works with catalog data
   - Different column configs work correctly

---

## 7. Migration Plan

### Pre-Refactor Checklist

- [ ] Backup current inventory table code
- [ ] Document current column definitions
- [ ] Identify all places using inventory table
- [ ] Prepare rollback procedure

### Phase-by-Phase Rollout

#### Phase 1 Rollout

1. Create generic component (parallel with existing)
2. Test generic component with inventory data
3. Update inventory table wrapper gradually
4. Monitor for regressions

**Rollback**: Revert to old inventory-specific component

#### Phase 2 Rollout

1. Deploy sorting and basic filtering
2. Enable for internal testing
3. Gather feedback on filter UX
4. Adjust filter UI as needed

**Rollback**: Disable sorting/filtering via props

#### Phase 3 Rollout

1. Deploy advanced filters and pagination
2. Enable pagination by default
3. Monitor performance with large datasets
4. Adjust page size defaults if needed

**Rollback**: Disable pagination, fall back to all-data display

#### Phase 4 Rollout

1. Deploy multiselect and bulk actions
2. Add inventory-specific bulk actions
3. Test selection across paginated data
4. Monitor selection state persistence

**Rollback**: Disable row selection via props

### Post-Rollout Validation

- [ ] All inventory table features work
- [ ] No performance regression
- [ ] Column definitions are correct
- [ ] State persists correctly
- [ ] Filtering works for all column types
- [ ] Pagination handles large datasets
- [ ] Multiselect works correctly

---

## 8. Success Criteria

### Functional Success

- [ ] Table component is data-agnostic and reusable
- [ ] All columns that should sort can be sorted
- [ ] All column types have appropriate filters
- [ ] Pagination works with configurable page sizes
- [ ] Row selection works with checkboxes
- [ ] Bulk actions component displays correctly
- [ ] Column visibility and ordering persist
- [ ] All state persists to localStorage

### Performance Success

- [ ] Table renders 1000+ rows without lag
- [ ] Sorting is instant (<100ms)
- [ ] Filtering is instant (<100ms)
- [ ] Pagination loads pages instantly
- [ ] No memory leaks with state persistence

### Code Quality Success

- [ ] Component is fully typed with TypeScript
- [ ] Column definitions are type-safe
- [ ] No linter errors
- [ ] Code coverage > 80%
- [ ] Clear documentation and comments
- [ ] Reusable for other data types

### User Experience Success

- [ ] Users can sort by any relevant column
- [ ] Users can filter effectively
- [ ] Users can navigate large datasets easily
- [ ] Users can select multiple rows for bulk operations
- [ ] Column preferences persist between sessions
- [ ] Table feels responsive and fast

---

## 9. Risk Assessment & Mitigation

### Technical Risks

| Risk                            | Severity | Probability | Mitigation                                    |
| ------------------------------- | -------- | ----------- | --------------------------------------------- |
| Performance with large datasets | High     | Medium      | Pagination, virtual scrolling, memoization    |
| Filter state complexity         | Medium   | Medium      | Simple filter API, clear documentation        |
| Type safety with generics       | Medium   | Low         | Extensive TypeScript testing, type inference  |
| State persistence conflicts     | Medium   | Low         | Namespaced localStorage keys, migration logic |
| Column definition drift         | Low      | Medium      | Centralized column definitions, validation    |

### Operational Risks

| Risk                             | Severity | Probability | Mitigation                              |
| -------------------------------- | -------- | ----------- | --------------------------------------- |
| User confusion with new features | Medium   | Low         | Clear UI, tooltips, documentation       |
| Breaking changes to inventory    | High     | Low         | Gradual rollout, backward compatibility |
| Missing filter types             | Low      | Medium      | Extensible filter system                |

---

## 10. Future Enhancements

### Phase 5 (Future): Server-Side Features

- Server-side sorting
- Server-side filtering
- Server-side pagination
- Infinite scroll option

### Phase 6 (Future): Advanced Features

- Column grouping
- Row expansion
- Export to CSV/Excel
- Saved filter presets
- Column templates/profiles

### Phase 7 (Future): Performance

- Virtual scrolling for very large datasets
- Web Workers for heavy filtering
- IndexedDB for state persistence
- Optimistic UI updates

---

## 11. Appendix

### A. Column Type Mapping

| Data Type | Filter Type | Filter Component    | Example Columns             |
| --------- | ----------- | ------------------- | --------------------------- |
| String    | `"text"`    | `TextFilter`        | Part Number, Name, Location |
| Number    | `"number"`  | `NumberRangeFilter` | Quantity, Price             |
| Currency  | `"number"`  | `NumberRangeFilter` | Unit Price, Total Price     |
| Date      | `"date"`    | `DateRangeFilter`   | Created At, Updated At      |
| Enum      | `"select"`  | `SelectFilter`      | Condition, Status           |
| Boolean   | `"boolean"` | `SelectFilter`      | Enabled, Active             |
| Custom    | `"custom"`  | Custom component    | Color (with picker)         |

### B. File Structure

```
src/components/
├── ui/
│   └── data-table/
│       ├── data-table.tsx
│       ├── data-table-toolbar.tsx
│       ├── data-table-pagination.tsx
│       ├── data-table-view-options.tsx
│       ├── data-table-bulk-actions.tsx
│       ├── data-table-header.tsx
│       ├── column-definitions.ts
│       ├── filters/
│       │   ├── text-filter.tsx
│       │   ├── number-range-filter.tsx
│       │   ├── date-range-filter.tsx
│       │   ├── select-filter.tsx
│       │   └── filter-popover.tsx
│       └── hooks/
│           ├── use-data-table.ts
│           ├── use-data-table-sorting.ts
│           ├── use-data-table-filtering.ts
│           └── use-data-table-pagination.ts
└── inventory/
    ├── inventory-table-wrapper.tsx
    └── inventory-columns.tsx
```

### C. Component API Reference

**DataTable Props**:

- `data: TData[]` - Array of data to display
- `columns: ColumnConfig<TData>[]` - Column definitions
- `enableSorting?: boolean` - Enable column sorting (default: true)
- `enableFiltering?: boolean` - Enable filtering (default: true)
- `enablePagination?: boolean` - Enable pagination (default: true)
- `enableRowSelection?: boolean` - Enable row selection (default: true)
- `pageSize?: number` - Initial page size
- `pageSizeOptions?: number[]` - Available page sizes
- `storageKey?: string` - localStorage key for persistence
- `persistSorting?: boolean` - Persist sorting state (default: true)
- `persistFilters?: boolean` - Persist filter state (default: true)
- `persistPagination?: boolean` - Persist pagination state (default: true)
- `onRowSelect?: (rows: TData[]) => void` - Selection callback
- `bulkActions?: (props: { selectedRows: TData[] }) => React.ReactNode` - Bulk actions render prop

### D. References

- **Shadcn Data Table**: https://ui.shadcn.com/docs/components/data-table
- **TanStack Table Docs**: https://tanstack.com/table/latest
- **Shadcn Date Picker**: https://ui.shadcn.com/docs/components/date-picker
- **Shadcn Pagination**: https://ui.shadcn.com/docs/components/pagination
- **Current Implementation**: `src/components/inventory/data-table/`
- **Convex Pagination Docs**: https://docs.convex.dev/database/pagination
- **Convex Indexes**: https://docs.convex.dev/database/indexes

---

## 12. Summary: Server-Side vs Client-Side Decision

### ✅ RECOMMENDED: Server-Side Approach

**For Large Datasets (> 1000 items)**:

- ✅ **Server-Side Pagination**: Use Convex `.take()` with cursor-based pagination
- ✅ **Server-Side Filtering**: Use indexes and query filters
- ✅ **Server-Side Sorting**: Use indexed sort fields
- ✅ **Benefits**: Fast initial load, scalable, efficient memory usage

**Implementation**:

```typescript
// Server-side query pattern
const results = await ctx.db
  .query("inventoryItems")
  .withIndex("by_businessAccount_createdAt", (q) =>
    q.eq("businessAccountId", businessAccountId)
  )
  .filter((q) => q.eq(q.field("isArchived"), false)))
  .order("desc")
  .take(pageSize);
```

### ⚠️ Alternative: Client-Side Approach (Fallback Only)

**Use Only For**:

- Small datasets (< 1000 items)
- Prototyping/MVP
- When server-side is not yet implemented

**Limitations**:

- ❌ Loads all data into memory
- ❌ Slow initial load for large datasets
- ❌ Wastes bandwidth
- ❌ Not scalable

### ❌ No Client-Side Processing

**Removed from Plan**:

- ❌ No client-side pagination (TanStack `getPaginationRowModel`)
- ❌ No client-side filtering (TanStack `getFilteredRowModel`)
- ❌ No client-side sorting (TanStack `getSortedRowModel`)
- ❌ No `data` prop - component requires `queryFn` only

**Component API**:

```typescript
// 100% server-side - no data prop
<DataTable
  queryFn={listInventoryItemsFiltered} // REQUIRED
  columns={columns}
  // ... other UI-only props (column visibility, etc.)
/>
```

**Why 100% Server-Side**:

- All data processing happens server-side for scalability
- No exceptions - even small datasets use server-side queries
- Simpler component implementation
- Consistent performance characteristics
- No confusion about where processing happens

### Key Takeaways

1. **100% Server-Side**: All pagination, filtering, sorting happens in Convex queries - no client processing
2. **Always Paginate**: Use `.take()` with cursor-based pagination - never `.collect()` for large datasets
3. **Index-Backed Operations**: Only expose sorts/filters that have matching indexes
4. **Composite Indexes**: Design indexes around common query shapes (filter + sort combinations)
5. **QuerySpec Pattern**: Single unified query contract between UI and server
6. **Cursor-Based Only**: No offset-based pagination - use cursors for efficiency
7. **Debounce & Cancel**: Debounce filter inputs (300ms) and cancel in-flight requests
8. **Stable Selection**: Store selected IDs for cross-page selection stability

### Migration Path

**Current State**:

```typescript
// ❌ Loads everything
const items = await ctx.db.query("inventoryItems")
  .withIndex("by_businessAccount", (q) => q.eq(...))
  .collect(); // ALL items!
```

**Target State**:

```typescript
// ✅ Paginated and filtered with QuerySpec pattern
const results = await ctx.db
  .query("inventoryItems")
  .withIndex(
    "by_businessAccount_condition_createdAt",
    (q) => q.eq("businessAccountId", businessAccountId).eq("condition", "new"), // From QuerySpec filters
  )
  .filter((q) => q.eq(q.field("isArchived"), false))
  .order("desc") // From QuerySpec sort
  .take(25); // From QuerySpec pagination - only 25 items!

return {
  items: results,
  cursor: results[results.length - 1]._id,
  isDone: false,
};
```

---

**End of Planning Document**
