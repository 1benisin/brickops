# Order Sync from Marketplaces Flow

## Overview

Background cron job periodically syncs orders from Bricklink and Brickowl marketplaces to ensure all orders are captured. This is a fallback mechanism in addition to real-time webhook notifications.

## Flow Steps

**Convex Cron** - Runs `syncOrdersFromMarketplaces` on schedule (every 15 minutes)

**Convex** - Queries all active `marketplaceCredentials` for each provider

**Convex** - For each configured marketplace:

- **Bricklink**: Creates store client and calls `client.getOrders()` with filters
- **Brickowl**: Creates store client and calls `client.getOrders()` with filters

**Marketplace API** - Returns list of new/updated orders since last sync

**Convex** - For each returned order:

- Checks if order already exists in the unified `orders` table (filtered by `businessAccountId`, `provider`, and `orderId`)
- If new: Creates order document with `provider` field
- If existing: Updates order document with latest data

**Convex** - For each order, fetches order items:

- **Bricklink**: Calls `client.getOrderItems(orderId)`
- **Brickowl**: Calls `client.getOrderItems(orderId)`

**Convex** - Upserts order items:

- Matches items to inventory by `partNumber` + `colorId` + `condition` + `location`
- Retrieves location from matched inventory item
- Creates or updates entries in the unified `orderItems` table (tagged with `provider`)

**Convex** - Reserves inventory for order items:

- For each order item with matched inventory:
  - Updates `quantityReserved` on inventory item
  - Creates reservation ledger entry

**Convex** - Updates last sync timestamp for each marketplace

**Frontend** - Receives real-time updates via Convex subscription

**User** - Sees new/updated orders appear in orders table

## Related Files

- `convex/crons.ts` - Cron job definitions (if implemented)
- `convex/marketplaces/shared/actions.ts` - Order sync action (if implemented)
- `convex/marketplaces/bricklink/storeClient.ts::getOrders` - Bricklink orders API
- `convex/marketplaces/brickowl/storeClient.ts::getOrders` - Brickowl orders API
- `docs/architecture/frontend/core-workflows.md` - Mentions 15-minute cron

## Notes

- This flow is mentioned in architecture diagrams but may not be fully implemented yet
- Primary order intake is via webhook notifications (see `bricklink-order-notification.md`)
- Sync provides safety net for missed webhooks or API-only integrations
- Order matching logic is same as webhook notification flow
- Inventory reservation happens automatically on order sync
- Sync frequency (15 minutes) balances freshness with API rate limits
