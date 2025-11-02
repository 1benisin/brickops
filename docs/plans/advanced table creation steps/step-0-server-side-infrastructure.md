# Step 0: Server-Side Infrastructure (PREREQUISITE)

**Status**: Prerequisite  
**Estimated Time**: ~2 days  
**Risk Level**: Medium  
**Must Complete Before**: All other steps

## Overview

This step establishes the **server-side data fetching infrastructure** required for the reusable table component. All pagination, filtering, and sorting will be performed **entirely on the Convex server** - no client-side processing.

**⚠️ CRITICAL**: This must be completed before any UI work begins.

## Goals

- Add composite indexes to the inventory schema for efficient queries
- Create paginated query function with cursor-based pagination
- Create unified filtered query function that accepts QuerySpec pattern
- Add sorting support to queries
- Ensure all queries use `.take()` instead of `.collect()` for scalability

## Prerequisites

- [ ] Convex project is set up and running
- [ ] Access to `convex/inventory/schema.ts`
- [ ] Access to `convex/inventory/queries.ts` (or create it)
- [ ] Understanding of Convex indexes and pagination
- [ ] Test inventory data available (1000+ items recommended for testing)

## Step-by-Step Implementation

### 1. Add Composite Indexes to Schema

**File**: `convex/inventory/schema.ts`

Add the following indexes to support efficient filtering + sorting combinations:

```typescript
export const inventoryTables = {
  inventoryItems: defineTable({
    // ... existing fields
  })
    // Existing indexes (keep these)
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_fileId", ["fileId"])

    // NEW: Composite indexes for common query patterns

    // Pattern: default listing (sort by createdAt desc)
    .index("by_businessAccount_createdAt", ["businessAccountId", "createdAt"])

    // Pattern: filter by condition + sort by date
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

    // Pattern: part number prefix search + sort by part number
    .index("by_businessAccount_partNumber", ["businessAccountId", "partNumber"])

    // Pattern: quantity filtering + sort by quantity
    .index("by_businessAccount_quantity", ["businessAccountId", "quantityAvailable"]),
};
```

**Action Items**:

- [ ] Add all indexes above
- [ ] Run schema migration: `npx convex dev` (will apply schema changes)
- [ ] Verify indexes appear in Convex dashboard under "Schema"

### 2. Create QuerySpec Type Definition

**File**: `convex/inventory/types.ts` (create if doesn't exist, or add to existing types file)

```typescript
import { v } from "convex/values";

// QuerySpec - unified query contract between UI and server
export const querySpecValidator = v.object({
  filters: v.optional(
    v.object({
      // Text prefix search
      partNumber: v.optional(
        v.object({
          kind: v.literal("prefix"),
          value: v.string(),
        }),
      ),

      // Number range filters
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

      // Enum filters
      condition: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),

      location: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),

      // Date range filters
      createdAt: v.optional(
        v.object({
          kind: v.literal("dateRange"),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
        }),
      ),
    }),
  ),

  sort: v.array(
    v.object({
      id: v.string(), // column id: "partNumber", "createdAt", "price", etc.
      desc: v.boolean(),
    }),
  ),

  pagination: v.object({
    cursor: v.optional(v.string()), // Document _id for cursor-based pagination
    pageSize: v.number(), // Capped at 25/50/100
  }),
});

export type QuerySpec = typeof querySpecValidator._type;
```

**Action Items**:

- [ ] Create or update types file with QuerySpec definition
- [ ] Export QuerySpec type for use in queries

### 3. Create Paginated Query Function

**File**: `convex/inventory/queries.ts`

Create a basic paginated query function:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "../lib/auth";

export const listInventoryItemsPaginated = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const { numItems, cursor } = args.paginationOpts;

    let queryBuilder = ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount_createdAt", (q) =>
        q.eq("businessAccountId", businessAccountId),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc");

    // Apply cursor if provided
    if (cursor) {
      const cursorDoc = await ctx.db.get(ctx.id(cursor));
      if (cursorDoc) {
        queryBuilder = queryBuilder.filter((q) =>
          // Get items after cursor
          q.or(
            q.lt(q.field("createdAt"), cursorDoc.createdAt),
            q.and(
              q.eq(q.field("createdAt"), cursorDoc.createdAt),
              q.gt(q.field("_id"), cursorDoc._id),
            ),
          ),
        );
      }
    }

    const results = await queryBuilder.take(numItems);

    // Calculate next cursor
    const nextCursor =
      results.length === numItems && results.length > 0
        ? results[results.length - 1]._id
        : undefined;

    return {
      items: results,
      cursor: nextCursor,
      isDone: nextCursor === undefined,
    };
  },
});
```

**Action Items**:

- [ ] Create `listInventoryItemsPaginated` query
- [ ] Test with different page sizes (10, 25, 50)
- [ ] Test cursor pagination (page 1, page 2, etc.)
- [ ] Verify it only returns requested number of items

### 4. Create Unified Filtered Query Function

**File**: `convex/inventory/queries.ts`

Create the main query function that handles filters, sorting, and pagination:

```typescript
import { querySpecValidator } from "./types";

export const listInventoryItemsFiltered = query({
  args: {
    querySpec: querySpecValidator,
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const { filters, sort, pagination } = args.querySpec;

    // Choose best index based on filters and sort
    const index = chooseBestIndex(filters, sort);

    // Build query with selected index
    let queryBuilder = ctx.db
      .query("inventoryItems")
      .withIndex(index.name, (q) => {
        let builder = q.eq("businessAccountId", businessAccountId);

        // Apply index predicates
        if (index.usesCondition && filters?.condition) {
          builder = builder.eq("condition", filters.condition.value);
        }
        if (index.usesLocation && filters?.location) {
          builder = builder.eq("location", filters.location.value);
        }

        return builder;
      })
      .filter((q) => {
        // Always filter archived items
        let filter = q.eq(q.field("isArchived"), false);

        // Text prefix search for part number
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

        if (filters?.quantityAvailable?.kind === "numberRange") {
          if (filters.quantityAvailable.min !== undefined) {
            filter = q.and(
              filter,
              q.gte(q.field("quantityAvailable"), filters.quantityAvailable.min),
            );
          }
          if (filters.quantityAvailable.max !== undefined) {
            filter = q.and(
              filter,
              q.lte(q.field("quantityAvailable"), filters.quantityAvailable.max),
            );
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
      });

    // Apply sorting
    if (sort.length > 0) {
      const primarySort = sort[0];
      queryBuilder = queryBuilder.order(primarySort.desc ? "desc" : "asc");
    } else {
      // Default sort
      queryBuilder = queryBuilder.order("desc");
    }

    // Apply cursor pagination
    if (pagination.cursor) {
      const cursorDoc = await ctx.db.get(ctx.id(pagination.cursor));
      if (cursorDoc) {
        // Add cursor filter logic here (similar to paginated query)
        // This ensures we get items after the cursor
      }
    }

    // Take only requested page size
    const results = await queryBuilder.take(pagination.pageSize);

    // Calculate next cursor
    const cursor =
      results.length === pagination.pageSize && results.length > 0
        ? results[results.length - 1]._id
        : undefined;

    return {
      items: results,
      cursor,
      isDone: cursor === undefined,
    };
  },
});

// Helper function to choose best index based on filters and sort
function chooseBestIndex(
  filters: QuerySpec["filters"],
  sort: QuerySpec["sort"],
): {
  name: string;
  usesCondition: boolean;
  usesLocation: boolean;
} {
  const primarySort = sort[0]?.id || "createdAt";

  // If filtering by condition and sorting by createdAt
  if (filters?.condition && primarySort === "createdAt") {
    return {
      name: "by_businessAccount_condition_createdAt",
      usesCondition: true,
      usesLocation: false,
    };
  }

  // If filtering by location and sorting by partNumber
  if (filters?.location && primarySort === "partNumber") {
    return {
      name: "by_businessAccount_location_partNumber",
      usesCondition: false,
      usesLocation: true,
    };
  }

  // If sorting by price
  if (primarySort === "price") {
    return {
      name: "by_businessAccount_price",
      usesCondition: false,
      usesLocation: false,
    };
  }

  // If sorting by partNumber
  if (primarySort === "partNumber") {
    return {
      name: "by_businessAccount_partNumber",
      usesCondition: false,
      usesLocation: false,
    };
  }

  // If sorting by quantity
  if (primarySort === "quantityAvailable") {
    return {
      name: "by_businessAccount_quantity",
      usesCondition: false,
      usesLocation: false,
    };
  }

  // Default: sort by createdAt
  return {
    name: "by_businessAccount_createdAt",
    usesCondition: false,
    usesLocation: false,
  };
}
```

**Action Items**:

- [ ] Implement `chooseBestIndex` helper function
- [ ] Implement `listInventoryItemsFiltered` query
- [ ] Handle cursor pagination correctly (filter items after cursor)
- [ ] Test with various filter combinations
- [ ] Test with different sort orders
- [ ] Verify results are correctly filtered and sorted

### 5. Update Existing Query (if applicable)

**File**: `convex/inventory/queries.ts`

If you have an existing `listInventoryItems` query, update it to use the new paginated pattern:

```typescript
// DEPRECATED: Use listInventoryItemsFiltered instead
// Keep for backward compatibility during migration
export const listInventoryItems = query({
  // ... migrate to use pagination
});
```

**Action Items**:

- [ ] Identify existing queries that load all items
- [ ] Update them to use `.take()` instead of `.collect()`
- [ ] Add deprecation comments pointing to new queries

## Testing Checklist

### Schema & Indexes

- [ ] All indexes created successfully
- [ ] Indexes visible in Convex dashboard
- [ ] No schema errors in Convex logs

### Paginated Query

- [ ] Returns correct number of items (matches `numItems` param)
- [ ] First page returns first N items
- [ ] Second page returns next N items (using cursor)
- [ ] Last page correctly identifies `isDone: true`
- [ ] Cursor pagination works correctly (no duplicate items across pages)
- [ ] Archived items are filtered out

### Filtered Query

- [ ] Text prefix filter (partNumber) works correctly
- [ ] Number range filters (price, quantity) work correctly
- [ ] Enum filters (condition, location) work correctly
- [ ] Date range filters work correctly
- [ ] Multiple filters combine with AND logic
- [ ] Filters work with sorting
- [ ] Sorting works for all sortable columns
- [ ] Cursor pagination works with filters applied
- [ ] Query returns correct page size

### Performance

- [ ] Query completes in < 500ms for typical use cases
- [ ] Indexes are being used (check Convex dashboard query logs)
- [ ] No full table scans (verify in Convex dashboard)

## Success Criteria

✅ **All of the following must be true:**

1. All composite indexes are created and visible in Convex dashboard
2. `listInventoryItemsPaginated` returns paginated results correctly
3. `listInventoryItemsFiltered` handles filters, sorting, and pagination correctly
4. All queries use `.take()` instead of `.collect()` (no full table loads)
5. Cursor-based pagination works correctly (no duplicate items)
6. Filters reduce result sets correctly
7. Sorting changes result order correctly
8. No archived items appear in results

## Common Issues & Solutions

### Issue: Index not found error

**Solution**: Make sure you ran `npx convex dev` after adding indexes to schema

### Issue: Cursor pagination returns duplicates

**Solution**: Ensure cursor filter logic correctly excludes the cursor document and gets items after it

### Issue: Filter not working

**Solution**: Verify the filter value matches the data type (string for text, number for ranges, etc.)

### Issue: Query is slow

**Solution**: Check that indexes are being used - look at query logs in Convex dashboard. Verify index predicate matches filter.

## Next Steps

Once this step is complete:

1. ✅ Verify all tests pass
2. ✅ Document any deviations from this plan
3. ✅ Proceed to **Step 1: Create Reusable Core Component**

---

**Remember**: This is the foundation for all server-side operations. Take your time to get it right!
