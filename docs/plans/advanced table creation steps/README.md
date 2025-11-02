# Reusable Data Table Component - Implementation Guide

This directory contains step-by-step implementation guides for creating a **reusable, data-agnostic table component** with server-side pagination, filtering, sorting, and advanced features.

## Overview

We're building a generic table component that can be reused for inventory, orders, catalog, or any other data type. The component is **100% server-side** - all pagination, filtering, and sorting happen on the Convex server for optimal performance and scalability.

## Implementation Steps

### Step 0: Server-Side Infrastructure ⚠️ PREREQUISITE

**File**: `step-0-server-side-infrastructure.md`  
**Time**: ~2 days  
**Risk**: Medium

**Must complete first!** This establishes the server-side data fetching infrastructure:

- Add composite indexes to schema
- Create paginated query functions
- Create unified filtered query function (QuerySpec pattern)
- Add sorting support

👉 **Start here if you haven't already!**

### Step 1: Create Reusable Core Component

**File**: `step-1-reusable-core-component.md`  
**Time**: ~1.5 days  
**Risk**: Low

Create the generic table component foundation:

- Extract generic `DataTable<TData>` component
- Create type-safe column configuration system
- Create server-side query hook
- Update inventory table to use new component

### Step 2: Add Sorting & Basic Filtering

**File**: `step-2-sorting-and-basic-filtering.md`  
**Time**: ~2 days  
**Risk**: Medium

Add server-side sorting and text filtering:

- Sortable column headers with indicators
- Text prefix search
- Debounced filter inputs
- Integration with server queries

### Step 3: Advanced Filtering & Pagination UI

**File**: `step-3-advanced-filtering-and-pagination.md`  
**Time**: ~2 days  
**Risk**: Medium

Complete the filtering system and add pagination:

- Number range filters (price, quantity)
- Date range filters
- Select/dropdown filters
- Pagination controls

### Step 4: Multiselect & Polish

**File**: `step-4-multiselect-and-polish.md`  
**Time**: ~1.5 days  
**Risk**: Low-Medium

Final features and polish:

- Row selection with checkboxes
- Bulk actions component
- State persistence
- Accessibility improvements
- Performance optimizations

## Quick Start

1. **Read the main plan**: Review `../inventory-table-refactor_plan1.md` for context

2. **Start with Step 0**: Follow `step-0-server-side-infrastructure.md`\*\*

   - This is a prerequisite for all other steps
   - Establishes server-side query infrastructure

3. **Follow steps sequentially**: Each step builds on the previous one

   - Don't skip steps!
   - Complete testing checklist for each step before moving on

4. **Test thoroughly**: Each step includes a testing checklist
   - Verify all tests pass
   - Test with real data
   - Check for regressions

## Key Principles

### 🚫 No Client-Side Processing

- All pagination, filtering, and sorting happen server-side
- Component accepts `queryFn` prop, not `data` prop
- TanStack Table used for UI only (not data processing)

### 📊 QuerySpec Pattern

- Unified query contract between UI and server
- Normalized filter/sort/pagination format
- Server chooses best index based on QuerySpec

### 🎯 Index-Backed Only

- Only expose sorting/filtering for fields with indexes
- Composite indexes for common query patterns
- No arbitrary client-side operations

### 🔄 Cursor-Based Pagination

- Use `.take()` with cursors (not offsets)
- Efficient and works with indexes
- Stable pagination across filter changes

## Architecture Decisions

### Component Structure

```
src/components/ui/data-table/
├── data-table.tsx              # Main generic component
├── data-table-toolbar.tsx      # Search and filters
├── data-table-pagination.tsx   # Pagination controls
├── data-table-view-options.tsx # Column visibility/ordering
├── data-table-bulk-actions.tsx # Bulk actions bar
├── filters/                    # Filter components
│   ├── text-filter.tsx
│   ├── number-range-filter.tsx
│   ├── date-range-filter.tsx
│   ├── select-filter.tsx
│   └── filter-popover.tsx
├── hooks/
│   └── use-server-table.ts     # Server-side state hook
└── column-definitions.ts       # Column type system
```

### Server-Side Query Pattern

```typescript
// QuerySpec - what UI sends to server
interface QuerySpec {
  filters: {
    [columnId: string]: FilterValue;
  };
  sort: Array<{ id: string; desc: boolean }>;
  pagination: {
    cursor?: string;
    pageSize: number;
  };
}

// QueryResult - what server returns
interface QueryResult<TData> {
  items: TData[];
  cursor?: string;
  isDone: boolean;
}
```

## Testing Strategy

Each step includes:

- ✅ **Testing Checklist**: Verify functionality
- ✅ **Success Criteria**: Clear pass/fail conditions
- ✅ **Common Issues**: Troubleshooting guide

## Estimated Timeline

- **Step 0**: 2 days (prerequisite)
- **Step 1**: 1.5 days
- **Step 2**: 2 days
- **Step 3**: 2 days
- **Step 4**: 1.5 days

**Total**: ~9 days for complete implementation

## Getting Help

- Check the **Common Issues & Solutions** section in each step
- Review the main plan document for architecture details
- Test queries in Convex dashboard to verify server-side behavior

## Success Criteria

The refactor is complete when:

- ✅ Generic `DataTable<TData>` component exists
- ✅ Component is reusable for multiple data types
- ✅ All server-side operations work correctly
- ✅ Inventory table uses new component
- ✅ No regressions in existing functionality
- ✅ Performance is acceptable (1000+ items)
- ✅ Code is clean and well-typed

## Next Steps After Completion

Once all steps are complete:

1. Test with real production data
2. Consider adding to other tables (orders, catalog)
3. Document component API for other developers
4. Add any missing filter types as needed

---

**Happy coding! 🚀**

_Remember: Take your time with each step. Quality over speed!_
