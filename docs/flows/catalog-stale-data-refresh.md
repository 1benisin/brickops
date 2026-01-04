# Catalog Stale/Missing Data Refresh Flow

## Overview

When a user requests part catalog data, the system checks if data exists and is fresh. If data is missing or stale (older than 30 days), it automatically triggers a refresh. The self-scheduling `ensureCatalogPart` orchestrator fetches fresh data from the BrickLink API and updates the database. The frontend reactively updates when fresh data becomes available.

## Flow Steps

**User** - Views part data (catalog page, part detail drawer, inventory form)

**Frontend** - Component calls reactive hook (`useGetPart`, `useGetPartColors`, or `useGetPriceGuide`)

**Frontend Hook** - Calls `api.catalog.queries.getPart` (or `getPartColors`, `getPriceGuide`)

**Convex Query** - Checks database and determines status:

- Queries `parts` table by part number
- Calculates staleness: `lastFetched < (now - 30 days)`
- Returns `{ data: {...}, status: "fresh" | "stale" | "missing" }`

**Frontend Hook** - If status is "missing" or "stale":

- Automatically calls `api.catalog.actions.enqueueRefreshPart` (or `enqueueRefreshPartColors`, `enqueueRefreshPriceGuide`)
- Uses deduplication to prevent duplicate requests

**Convex Action** - Triggers self-scheduling orchestrator:

- Verifies user authentication
- Calls `ensureCatalogPart` which:
  - Checks freshness of part, colors, and prices
  - If all fresh, returns immediately
  - If stale/missing, fetches data via rate-limited API calls
  - Uses self-scheduling retry pattern for rate limit handling
  - Processes: part data → part colors → global colors (BrickOwl mappings) → prices

**ensureCatalogPart Orchestrator** - Fetches and saves data:

- **Rate limiting**: Consumes tokens from "bricklink" bucket before each API call
- **Self-scheduling retry**: If rate limited, schedules itself for later
- **Multi-source**: Fetches from BrickLink (required) + BrickOwl/Rebrickable (optional)
- **Batched prices**: Processes price data in batches to avoid timeouts
- Updates database via upsert mutations
- Promotes inventory items from `awaiting_catalog` to `ready_to_sync`

**Convex Query** - Automatically re-runs (reactive):

- Convex detects database change
- Query re-executes and returns fresh data with `status: "fresh"`

**Frontend Hook** - Receives updated data:

- Query subscription delivers new data
- Component re-renders with fresh data

## Related Files

- `src/hooks/useGetPart.ts` - Frontend hook for part data
- `src/hooks/useGetPartColors.ts` - Frontend hook for part colors
- `src/hooks/useGetPriceGuide.ts` - Frontend hook for price guides
- `convex/catalog/parts.ts::getPart` - Status-aware query
- `convex/catalog/parts.ts::enqueueRefreshPart` - Triggers refresh action
- `convex/catalog/ensure.ts::ensureCatalogPart` - Self-scheduling orchestrator
- `convex/catalog/ensure.ts::ensureColor` - Single color ensure action
- `convex/marketplaces/bricklink/catalog/*/actions.ts` - BrickLink catalog fetch helpers

## Notes

- Data older than 30 days is considered stale
- Rate limiting prevents API overload via token bucket
- Failed fetches retry with exponential backoff via self-scheduling
- Convex reactivity provides seamless UX updates
- All refresh operations are idempotent
- ensureCatalogPart handles the full cascade: part → colors → global colors → prices
