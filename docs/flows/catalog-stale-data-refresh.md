# Catalog Stale/Missing Data Refresh Flow

## Overview

When a user requests part catalog data, the system checks if data exists and is fresh. If data is missing or stale (older than 30 days), it automatically enqueues a refresh. A background worker fetches fresh data from Bricklink API and updates the database. The frontend reactively updates when fresh data becomes available.

## Flow Steps

**User** - Views part data (catalog page, part detail drawer, inventory form)

**Frontend** - Component calls reactive hook (`useGetPart`, `useGetPartColors`, or `useGetPriceGuide`)

**Frontend Hook** - Calls `api.catalog.queries.getPart` (or `getPartColors`, `getPriceGuide`)

**Convex Query** - Checks database and determines status:

- Queries `parts` table by part number
- Checks `catalogRefreshOutbox` for pending refreshes
- Calculates staleness: `lastFetched < (now - 30 days)`
- Returns `{ data: {...}, status: "fresh" | "stale" | "refreshing" | "missing" }`

**Frontend Hook** - If status is "missing" or "stale":

- Automatically calls `api.catalog.actions.enqueueRefreshPart` (or `enqueueRefreshPartColors`, `enqueueRefreshPriceGuide`)
- Uses deduplication to prevent duplicate requests

**Convex Action** - Enqueues refresh request:

- Verifies user authentication
- Checks for existing pending refresh (prevents duplicates)
- Adds message to `catalogRefreshOutbox` table with HIGH priority
- If data is missing: Schedules immediate processing

**Background Worker** - Processes refresh requests:

- **Cron Job**: Runs every 10 minutes, processes up to 10 pending messages
- **Immediate**: Missing data triggers instant processing
- Marks message as "inflight" to prevent double processing
- Takes rate limit token from "bricklink:global" bucket
- Calls Bricklink API to fetch fresh data:
  - `catalogClient.getRefreshedPart(partNumber)`
  - `catalogClient.getRefreshedPartColors(partNumber)`
  - `catalogClient.getRefreshedPriceGuide(partNumber, colorId)`
- Updates database via upsert mutations
- Marks message as "succeeded"

**Convex Query** - Automatically re-runs (reactive):

- Convex detects database change
- Query re-executes and returns fresh data with `status: "fresh"`

**Frontend Hook** - Receives updated data:

- Query subscription delivers new data
- Component re-renders with fresh data
- `isRefreshing` flag becomes `false`

## Related Files

- `src/hooks/useGetPart.ts` - Frontend hook for part data
- `src/hooks/useGetPartColors.ts` - Frontend hook for part colors
- `src/hooks/useGetPriceGuide.ts` - Frontend hook for price guides
- `convex/catalog/queries.ts::getPart` - Status-aware query
- `convex/catalog/actions.ts::enqueueRefreshPart` - Enqueue refresh action
- `convex/catalog/refreshWorker.ts::drainCatalogRefreshOutbox` - Batch worker
- `convex/catalog/refreshWorker.ts::processSingleOutboxMessage` - Immediate worker
- `convex/marketplaces/bricklink/catalogClient.ts` - Bricklink API client
- `convex/crons.ts` - Cron job definitions

## Notes

- Data older than 30 days is considered stale
- User-triggered refreshes use HIGH priority for immediate processing
- Rate limiting prevents API overload (global bucket)
- Failed refreshes retry with exponential backoff
- Convex reactivity provides seamless UX updates
- All enqueue operations are idempotent
