# Part Catalog Lookup Flow

## Overview

User searches for parts in the catalog. System checks cache first, then fetches from Bricklink API if needed, and displays part details.

## Flow Steps

**User** - Navigates to `/catalog` page

**Frontend** - Initializes search state from URL params:

- `partId`: Part number filter
- `name`: Part name filter
- `location`: Location filter
- `sort`: Sort order
- `pageSize`: Results per page

**User** - Enters search criteria in `CatalogSearchBar`

**Frontend** - Updates URL params with search criteria

**Frontend** - Calls `api.catalog.queries.searchParts` with search args

**Convex** - Queries cached catalog data from `catalogParts` table

- Filters by part number, name, or other criteria
- Applies sorting
- Paginates results

**Convex** - If part not in cache:

- Calls Bricklink API `GET /items/{type}/{no}` to fetch part details
- Stores part data in `catalogParts` cache
- Returns cached part

**Convex** - Returns paginated results

**Frontend** - Displays results in `CatalogResultCard` components

- Shows part image, name, part number, category
- Shows availability and price info if available

**User** - Clicks on a part card

**Frontend** - Opens `PartDetailDrawer` with part details

- Shows full part information
- Shows price guide data
- Shows inventory availability
- Provides "Add to Inventory" action

**User** - Can add part to inventory from detail drawer

## Related Files

- `src/app/(authenticated)/catalog/page.tsx` - Catalog page
- `src/components/catalog/CatalogSearchBar.tsx` - Search interface
- `src/components/catalog/CatalogResultCard.tsx` - Part card display
- `src/components/catalog/PartDetailDrawer.tsx` - Part detail drawer
- `convex/catalog/queries.ts::searchParts` - Catalog search query
- `convex/marketplaces/bricklink/catalogClient.ts` - Stateless Bricklink catalog helpers

## Notes

- Catalog data is cached in `catalogParts` table for performance
- Cache is populated on-demand when parts are searched
- Search supports multiple criteria (part number, name, location)
- Results are paginated for large result sets
- Part details include price guide and inventory availability
- Catalog lookup is used in add inventory flow for part selection
