# Inventory Table Column Filters Implementation Plan

**Status**: Planning  
**Created**: 2025-01-XX  
**Owner**: Development Team  
**Type**: Feature Enhancement

---

## Executive Summary

This plan outlines adding comprehensive column-level filtering to the inventory table. All columns that make sense will be filterable with appropriate filter types (text, number range, date range, select). The implementation will maintain the reusable table component's data-agnostic nature so it can be reused for orders and other tables.

### Key Outcomes

- ✅ All filterable columns have filter UI in column headers
- ✅ Text filters for partNumber, name, colorId (prefix search)
- ✅ Number range filters for price, quantityAvailable, quantityReserved
- ✅ Date range filters for createdAt, updatedAt
- ✅ Select filters for condition, location
- ✅ Backend supports all filter types via QuerySpec
- ✅ Reusable components remain data-agnostic

---

## Current State Analysis

### Backend Support (Convex QuerySpec)

**✅ Already Supported:**

- `partNumber` - prefix search (string range)
- `price` - numberRange (min/max)
- `quantityAvailable` - numberRange (min/max)
- `createdAt` - dateRange (start/end timestamps)
- `condition` - enum (single value)
- `location` - enum (single value)

**❌ Missing Backend Support:**

- `name` - text prefix search
- `colorId` - text prefix search (or could be select if we populate options)
- `updatedAt` - dateRange
- `quantityReserved` - numberRange

### Frontend Implementation

**✅ Already Implemented:**

- Filter infrastructure in `DataTableHeader` component
- Filter components: `NumberRangeFilter`, `DateRangeFilter`, `SelectFilter`
- Filter popover wrapper component
- Column metadata system for filter configuration

**❌ Missing Frontend Components:**

- `TextFilter` component (for text/string columns)

### Column Metadata

**✅ Already Configured:**

- `condition` - filterType: "select", filterOptions provided
- `location` - filterType: "select", filterOptions empty (needs dynamic population)
- `quantityAvailable` - filterType: "number"
- `price` - filterType: "number", filterConfig: { currency: true }
- `createdAt` - filterType: "date"

**❌ Missing Filter Configuration:**

- `partNumber` - currently only has global filter, needs column filter
- `name` - no filter metadata
- `colorId` - no filter metadata
- `updatedAt` - no filter metadata
- `quantityReserved` - no filter metadata

### Inventory Table Wrapper

**✅ Already Handles:**

- `price` → numberRange
- `quantityAvailable` → numberRange
- `createdAt` → dateRange
- `condition` → enum
- `location` → enum

**❌ Missing Handlers:**

- `partNumber` → prefix (needs column filter, not just global)
- `name` → prefix
- `colorId` → prefix
- `updatedAt` → dateRange
- `quantityReserved` → numberRange

---

## Implementation Plan

### Phase 1: Create Text Filter Component (Data-Agnostic)

**Goal**: Create reusable text filter component that works for any text column

**Files to Create:**

- `src/components/ui/data-table/filters/text-filter.tsx`

**Requirements:**

- Simple text input with debouncing (300ms)
- Placeholder text configurable via column metadata
- Clear button to reset filter
- Data-agnostic (no inventory-specific logic)

**Component Interface:**

```typescript
interface TextFilterProps {
  columnId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  debounceMs?: number; // Default: 300
}
```

**Testing:**

- ✅ Text input updates state
- ✅ Debouncing delays onChange calls
- ✅ Clear button resets filter
- ✅ Works with any column ID

---

### Phase 2: Update Backend QuerySpec Type

**Goal**: Add missing filter types to QuerySpec validator

**Files to Modify:**

- `convex/inventory/types.ts`

**Changes:**

1. Add `name` filter (prefix search, same as partNumber)
2. Add `colorId` filter (prefix search)
3. Add `updatedAt` filter (dateRange)
4. Add `quantityReserved` filter (numberRange)

**Updated QuerySpec Structure:**

```typescript
filters: v.optional(
  v.object({
    // Text prefix searches
    partNumber: v.optional(v.object({ kind: v.literal("prefix"), value: v.string() })),
    name: v.optional(v.object({ kind: v.literal("prefix"), value: v.string() })), // NEW
    colorId: v.optional(v.object({ kind: v.literal("prefix"), value: v.string() })), // NEW

    // Number ranges
    price: v.optional(
      v.object({
        kind: v.literal("numberRange"),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      }),
    ),
    quantityAvailable: v.optional(
      v.object({
        kind: v.literal("numberRange"),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      }),
    ),
    quantityReserved: v.optional(
      v.object({
        kind: v.literal("numberRange"),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      }),
    ), // NEW

    // Date ranges
    createdAt: v.optional(
      v.object({
        kind: v.literal("dateRange"),
        start: v.optional(v.number()),
        end: v.optional(v.number()),
      }),
    ),
    updatedAt: v.optional(
      v.object({
        kind: v.literal("dateRange"),
        start: v.optional(v.number()),
        end: v.optional(v.number()),
      }),
    ), // NEW

    // Enums
    condition: v.optional(v.object({ kind: v.literal("enum"), value: v.string() })),
    location: v.optional(v.object({ kind: v.literal("enum"), value: v.string() })),
  }),
);
```

**Testing:**

- ✅ TypeScript types compile correctly
- ✅ Validator accepts valid filter specs
- ✅ Validator rejects invalid filter specs

---

### Phase 3: Update Backend Query Handler

**Goal**: Process new filter types in `listInventoryItemsFiltered` query

**Files to Modify:**

- `convex/inventory/queries.ts`

**Changes:**

1. **Add name filter handling** (prefix search):

   ```typescript
   if (filters?.name?.kind === "prefix") {
     const prefix = filters.name.value;
     filter = q.and(
       filter,
       q.gte(q.field("name"), prefix),
       q.lt(q.field("name"), prefix + "\uffff"),
     );
   }
   ```

2. **Add colorId filter handling** (prefix search):

   ```typescript
   if (filters?.colorId?.kind === "prefix") {
     const prefix = filters.colorId.value;
     filter = q.and(
       filter,
       q.gte(q.field("colorId"), prefix),
       q.lt(q.field("colorId"), prefix + "\uffff"),
     );
   }
   ```

3. **Add quantityReserved filter handling** (numberRange):

   ```typescript
   if (filters?.quantityReserved?.kind === "numberRange") {
     if (filters.quantityReserved.min !== undefined) {
       filter = q.and(filter, q.gte(q.field("quantityReserved"), filters.quantityReserved.min));
     }
     if (filters.quantityReserved.max !== undefined) {
       filter = q.and(filter, q.lte(q.field("quantityReserved"), filters.quantityReserved.max));
     }
   }
   ```

4. **Add updatedAt filter handling** (dateRange):
   ```typescript
   if (filters?.updatedAt?.kind === "dateRange") {
     if (filters.updatedAt.start !== undefined) {
       filter = q.and(filter, q.gte(q.field("updatedAt"), filters.updatedAt.start));
     }
     if (filters.updatedAt.end !== undefined) {
       filter = q.and(filter, q.lte(q.field("updatedAt"), filters.updatedAt.end));
     }
   }
   ```

**Testing:**

- ✅ Name prefix filter returns matching items
- ✅ ColorId prefix filter returns matching items
- ✅ QuantityReserved range filter works correctly
- ✅ UpdatedAt date range filter works correctly
- ✅ All filters can be combined
- ✅ Filters work with sorting and pagination

---

### Phase 4: Update Column Definitions

**Goal**: Add filter metadata to all filterable columns

**Files to Modify:**

- `src/components/inventory/inventory-columns.tsx`

**Changes:**

1. **Part Number Column** - Add column filter (not just global):

   ```typescript
   createColumn({
     id: "partNumber",
     accessorKey: "partNumber",
     meta: {
       label: "Part Number",
       filterType: "text", // NEW
       filterPlaceholder: "Search part numbers...", // NEW
     },
     // ... existing config
   });
   ```

2. **Name Column** - Add text filter:

   ```typescript
   createColumn({
     id: "name",
     accessorKey: "name",
     meta: {
       label: "Name",
       filterType: "text", // NEW
       filterPlaceholder: "Search names...", // NEW
     },
     // ... existing config
   });
   ```

3. **Color ID Column** - Add text filter:

   ```typescript
   createColumn({
     id: "colorId",
     accessorKey: "colorId",
     meta: {
       label: "Color",
       filterType: "text", // NEW
       filterPlaceholder: "Search color IDs...", // NEW
     },
     // ... existing config
   });
   ```

4. **Quantity Reserved Column** - Add number range filter:

   ```typescript
   createColumn({
     id: "quantityReserved",
     accessorKey: "quantityReserved",
     meta: {
       label: "Reserved",
       filterType: "number", // NEW
     },
     // ... existing config
   });
   ```

5. **Last Updated Column** - Add date range filter:

   ```typescript
   createColumn({
     id: "updatedAt",
     accessorKey: "updatedAt",
     meta: {
       label: "Last Updated",
       filterType: "date", // NEW
     },
     // ... existing config
   });
   ```

6. **Location Column** - Populate filter options dynamically:
   ```typescript
   // Note: This might require a separate query to get unique locations
   // For MVP, we can keep empty array and let user type/select
   createColumn({
     id: "location",
     // ... existing
     meta: {
       label: "Location",
       filterType: "select",
       filterOptions: [], // Could be populated from data later
     },
   });
   ```

**Testing:**

- ✅ All columns show filter UI in header when filterType is set
- ✅ Filter popovers open correctly
- ✅ Filter types match expected components

---

### Phase 5: Update DataTableHeader to Support Text Filters

**Goal**: Render TextFilter component for text filterType

**Files to Modify:**

- `src/components/ui/data-table/data-table-header.tsx`

**Changes:**

1. Import TextFilter component:

   ```typescript
   import { TextFilter } from "./filters/text-filter";
   ```

2. Add text filter case in render logic:
   ```typescript
   {filterType === "text" && (
     <TextFilter
       columnId={header.column.id}
       value={filterValue}
       onChange={(value) => onFilterChange?.(header.column.id, value)}
       placeholder={(header.column.columnDef.meta as any)?.filterPlaceholder || "Search..."}
     />
   )}
   ```

**Testing:**

- ✅ TextFilter appears for columns with filterType: "text"
- ✅ TextFilter updates filter value correctly
- ✅ Filter value clears properly

---

### Phase 6: Update Inventory Table Wrapper

**Goal**: Handle new filter types in column filter change handler

**Files to Modify:**

- `src/components/inventory/inventory-table-wrapper.tsx`

**Changes:**

Update `handleColumnFilterChange` to handle all new filter types:

```typescript
const handleColumnFilterChange = useCallback((columnId: string, value: unknown) => {
  setQuerySpec((prev: QuerySpec) => {
    const newFilters = { ...(prev.filters || {}) };

    // Text prefix filters
    if (columnId === "partNumber" || columnId === "name" || columnId === "colorId") {
      if (value && typeof value === "string") {
        newFilters[columnId] = { kind: "prefix", value };
      } else {
        delete newFilters[columnId];
      }
    }
    // Number range filters
    else if (
      columnId === "price" ||
      columnId === "quantityAvailable" ||
      columnId === "quantityReserved"
    ) {
      if (value) {
        newFilters[columnId] = { kind: "numberRange", ...value };
      } else {
        delete newFilters[columnId];
      }
    }
    // Date range filters
    else if (columnId === "createdAt" || columnId === "updatedAt") {
      if (value) {
        newFilters[columnId] = { kind: "dateRange", ...value };
      } else {
        delete newFilters[columnId];
      }
    }
    // Enum filters
    else if (columnId === "condition" || columnId === "location") {
      if (value && typeof value === "string") {
        newFilters[columnId] = { kind: "enum", value };
      } else {
        delete newFilters[columnId];
      }
    }
    // Remove unknown filters
    else {
      delete newFilters[columnId as keyof typeof newFilters];
    }

    return {
      ...prev,
      filters: Object.keys(newFilters).length > 0 ? newFilters : undefined,
      pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
    };
  });
}, []);
```

Also update `columnFilters` useMemo to include new filter types:

```typescript
const columnFilters = useMemo(() => {
  const filters: Record<string, unknown> = {};

  // Text filters
  if (querySpec.filters?.partNumber) {
    filters.partNumber = querySpec.filters.partNumber.value;
  }
  if (querySpec.filters?.name) {
    filters.name = querySpec.filters.name.value;
  }
  if (querySpec.filters?.colorId) {
    filters.colorId = querySpec.filters.colorId.value;
  }

  // Number range filters
  if (querySpec.filters?.price) {
    filters.price = { min: querySpec.filters.price.min, max: querySpec.filters.price.max };
  }
  if (querySpec.filters?.quantityAvailable) {
    filters.quantityAvailable = {
      min: querySpec.filters.quantityAvailable.min,
      max: querySpec.filters.quantityAvailable.max,
    };
  }
  if (querySpec.filters?.quantityReserved) {
    filters.quantityReserved = {
      min: querySpec.filters.quantityReserved.min,
      max: querySpec.filters.quantityReserved.max,
    };
  }

  // Date range filters
  if (querySpec.filters?.createdAt) {
    filters.createdAt = {
      start: querySpec.filters.createdAt.start,
      end: querySpec.filters.createdAt.end,
    };
  }
  if (querySpec.filters?.updatedAt) {
    filters.updatedAt = {
      start: querySpec.filters.updatedAt.start,
      end: querySpec.filters.updatedAt.end,
    };
  }

  // Enum filters
  if (querySpec.filters?.condition) {
    filters.condition = querySpec.filters.condition.value;
  }
  if (querySpec.filters?.location) {
    filters.location = querySpec.filters.location.value;
  }

  return filters;
}, [querySpec.filters]);
```

**Testing:**

- ✅ All filter types update QuerySpec correctly
- ✅ Filter values are passed to DataTable component
- ✅ Pagination resets when filters change
- ✅ Multiple filters can be active simultaneously

---

## Column Filter Summary

| Column              | Filter Type    | Backend Support | Frontend Component   | Status                   |
| ------------------- | -------------- | --------------- | -------------------- | ------------------------ |
| `partNumber`        | text (prefix)  | ✅ Existing     | ❌ Need TextFilter   | ⚠️ Partial (global only) |
| `name`              | text (prefix)  | ❌ Need to add  | ❌ Need TextFilter   | ❌ Missing               |
| `colorId`           | text (prefix)  | ❌ Need to add  | ❌ Need TextFilter   | ❌ Missing               |
| `location`          | select (enum)  | ✅ Existing     | ✅ SelectFilter      | ✅ Complete              |
| `condition`         | select (enum)  | ✅ Existing     | ✅ SelectFilter      | ✅ Complete              |
| `quantityAvailable` | number (range) | ✅ Existing     | ✅ NumberRangeFilter | ✅ Complete              |
| `quantityReserved`  | number (range) | ❌ Need to add  | ✅ NumberRangeFilter | ⚠️ Partial               |
| `price`             | number (range) | ✅ Existing     | ✅ NumberRangeFilter | ✅ Complete              |
| `createdAt`         | date (range)   | ✅ Existing     | ✅ DateRangeFilter   | ✅ Complete              |
| `updatedAt`         | date (range)   | ❌ Need to add  | ✅ DateRangeFilter   | ⚠️ Partial               |

---

## Data-Agnostic Considerations

### Reusable Components (No Changes Needed)

The following components are already data-agnostic and will work for orders table:

- ✅ `DataTable` - Generic component accepting any data type
- ✅ `DataTableHeader` - Renders filters based on column metadata
- ✅ `FilterPopover` - Generic wrapper component
- ✅ `NumberRangeFilter` - Works for any numeric column
- ✅ `DateRangeFilter` - Works for any date column
- ✅ `SelectFilter` - Works for any enum/select column
- ✅ `TextFilter` - (NEW) Will work for any text column

### Column Metadata Pattern

The column metadata system is data-agnostic:

```typescript
meta: {
  label: string,
  filterType: "text" | "number" | "date" | "select",
  filterPlaceholder?: string,
  filterOptions?: Array<{ label: string; value: string }>,
  filterConfig?: { currency?: boolean; step?: number },
}
```

**For Orders Table**: Simply define columns with appropriate filterType in metadata. No changes to filter components needed.

---

## Testing Strategy

### Unit Tests

1. **TextFilter Component**

   - ✅ Input updates state
   - ✅ Debouncing works correctly
   - ✅ Clear button resets filter

2. **QuerySpec Validator**

   - ✅ Accepts valid filter specs
   - ✅ Rejects invalid filter specs

3. **Backend Query Handler**
   - ✅ Each filter type processes correctly
   - ✅ Combined filters work together
   - ✅ Filters work with sorting

### Integration Tests

1. **Filter UI Rendering**

   - ✅ Correct filter component appears for each filterType
   - ✅ Filter values persist across page changes
   - ✅ Filter indicators show active state

2. **Filter → QuerySpec → Backend Flow**
   - ✅ Filter change updates QuerySpec
   - ✅ QuerySpec sent to backend
   - ✅ Backend returns filtered results
   - ✅ UI displays filtered results

### Manual Testing Checklist

- ✅ Part Number filter: Prefix search works
- ✅ Name filter: Prefix search works
- ✅ Color ID filter: Prefix search works
- ✅ Location filter: Select dropdown works
- ✅ Condition filter: Select dropdown works
- ✅ Quantity Available filter: Min/max range works
- ✅ Quantity Reserved filter: Min/max range works
- ✅ Price filter: Min/max range works (with currency)
- ✅ Created At filter: Date range picker works
- ✅ Updated At filter: Date range picker works
- ✅ Multiple filters: Can combine filters
- ✅ Filter + Sort: Filters work with sorting
- ✅ Filter + Pagination: Filters work with pagination
- ✅ Clear filters: Reset button clears all filters

---

## Migration Path

### Phase-by-Phase Rollout

1. **Phase 1-2**: Create TextFilter and update QuerySpec (no UI changes)
2. **Phase 3**: Update backend query handler (test via API/console)
3. **Phase 4-5**: Update column definitions and DataTableHeader (filter UI appears)
4. **Phase 6**: Update inventory table wrapper (filters become functional)

### Rollback Plan

If issues arise:

- Revert backend changes (Phases 2-3)
- Remove filterType from column metadata (Phase 4)
- Disable filtering via enableFiltering prop (Phase 5-6)

---

## Success Criteria

### Functional Requirements

- ✅ All appropriate columns have filter UI in headers
- ✅ Text filters work for partNumber, name, colorId
- ✅ Number range filters work for price, quantityAvailable, quantityReserved
- ✅ Date range filters work for createdAt, updatedAt
- ✅ Select filters work for condition, location
- ✅ Filters can be combined
- ✅ Filters work with sorting and pagination
- ✅ Filter state persists (via QuerySpec in URL/localStorage if implemented)

### Data-Agnostic Requirements

- ✅ TextFilter component has no inventory-specific logic
- ✅ All filter components work with any data type
- ✅ Column metadata pattern is reusable
- ✅ Orders table can use same filter components

### Performance Requirements

- ✅ Text filters debounce (300ms)
- ✅ Filter changes reset pagination (cursor = undefined)
- ✅ Backend queries use appropriate indexes
- ✅ No performance degradation with multiple filters

---

## Future Enhancements (Out of Scope)

1. **Dynamic Filter Options**

   - Populate location filter options from actual data
   - Populate colorId filter options from catalog

2. **Advanced Text Search**

   - Contains search (not just prefix)
   - Fuzzy matching
   - Full-text search via Convex search indexes

3. **Filter Presets**

   - Save filter combinations
   - Quick filter buttons (e.g., "Show only new items")

4. **Filter Indicators**

   - Badge showing active filter count
   - Clear all filters button

5. **URL State**
   - Persist filters in URL query params
   - Share filtered views

---

## Summary

This plan adds comprehensive column-level filtering to the inventory table while maintaining the reusable table component's data-agnostic nature. The implementation follows an incremental approach, building on existing infrastructure and ensuring each phase is testable and rollback-able.

**Estimated Effort**: 3-4 days

- Phase 1: TextFilter component (0.5 day)
- Phase 2: QuerySpec updates (0.5 day)
- Phase 3: Backend query handler (1 day)
- Phase 4: Column definitions (0.5 day)
- Phase 5: DataTableHeader update (0.5 day)
- Phase 6: Inventory wrapper update (0.5 day)
- Testing & polish (0.5 day)

**Risk Level**: Low-Medium (builds on existing infrastructure)

**Breaking Changes**: None (additive only)
