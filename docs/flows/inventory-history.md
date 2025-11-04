# Inventory History View Flow

## Overview

User views a comprehensive history of all inventory changes (quantity and location) with filtering and pagination capabilities.

## Flow Steps

**User** - Navigates to `/inventory/history` page

**Frontend** - Initializes filter state:
  - Change type: "all" | "quantity" | "location"
  - Part number: empty string
  - Location: empty string
  - Offset: 0
  - Limit: 100

**Frontend** - Calls `api.inventory.queries.getUnifiedInventoryHistory` with filter args

**Convex** - Queries `inventoryQuantityLedger` and `inventoryLocationLedger` tables
  - Filters by change type if specified
  - Filters by part number if specified
  - Filters by location if specified
  - Orders by timestamp (descending)
  - Limits results to specified limit
  - Offsets by specified offset

**Convex** - Unifies ledger entries into single format:
  - Combines quantity and location changes
  - Includes item details (part number, name, color)
  - Includes change metadata (reason, source, user, timestamp)
  - Includes quantity deltas and location transitions

**Convex** - Returns unified history array

**Frontend** - Displays history in `HistoryDataTable` component
  - Shows columns: Timestamp, Part, Change Type, Details, User, Reason
  - Formats quantity changes: "+5" or "-3"
  - Formats location changes: "A1 → B2"

**User** - Applies filters:
  - Selects change type filter
  - Enters part number search
  - Enters location search
  - Clicks "Reset Filters"

**Frontend** - Resets offset to 0 and refetches with new filters

**User** - Clicks "Load More" button (if more results available)

**Frontend** - Increments offset by limit and fetches next page

**Frontend** - Appends new results to existing table

## Related Files

- `src/app/(authenticated)/inventory/history/page.tsx` - History page
- `src/components/inventory/history/HistoryDataTable.tsx` - History table component
- `src/components/inventory/history/HistoryColumns.tsx` - Table column definitions
- `convex/inventory/queries.ts::getUnifiedInventoryHistory` - History query

## Notes

- History combines both quantity and location ledger entries
- Unified format makes it easy to see all changes chronologically
- Filtering supports multiple criteria simultaneously
- Pagination uses offset-based approach (limit 100 per page)
- Change details show deltas and transitions clearly
- User information is included for audit trail

