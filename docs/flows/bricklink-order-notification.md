# New Bricklink Order Notification Flow

## Overview

Bricklink sends a notification when a new order is created. The system receives it via webhook (preferred) or polling (fallback), then fetches full order data and reserves inventory.

## Flow Steps

### Webhook Path (Primary)

**Bricklink** - Sends POST request to `/api/bricklink/webhook/{webhookToken}`

**Convex** - Extracts `webhookToken` from URL path or query parameter

**Convex** - Validates token via `api.marketplaces.bricklink.notifications.getCredentialByToken`

**Convex** - Validates request method (must be POST)

**Convex** - Parses notification payload:

- `event_type`: "Order" | "Message" | "Feedback"
- `resource_id`: Order ID number
- `timestamp`: ISO 8601 timestamp

**Convex** - Validates payload size (< 1024 bytes) and structure

**Convex** - Checks for replay (timestamp within last hour)

**Convex** - Generates `dedupeKey`: `{businessAccountId}:{event_type}:{resource_id}:{timestamp}`

**Convex** - Calls `api.marketplaces.bricklink.notifications.upsertNotification` (idempotent)

**Convex** - Checks if notification already exists by `dedupeKey`

- If exists and status is "pending" or "failed": Resets attempts and returns existing ID
- If exists and already processed: Returns existing ID
- If new: Creates notification with status "pending"

**Convex** - Returns 200 OK immediately (async processing)

**Convex** - Schedules `processNotification` action via scheduler (fire-and-forget)

### Polling Path (Fallback)

**Convex Cron** - Runs `pollNotificationsForBusiness` on schedule

**Convex** - Creates Bricklink store client with business credentials

**Convex** - Calls `client.getNotifications()` to fetch unread notifications

**Bricklink API** - Returns array of notifications

**Convex** - For each notification:

- Generates `dedupeKey`
- Calls `upsertNotification` (idempotent)
- Schedules `processNotification` action

**Convex** - Updates `lastPolled` timestamp

### Process Notification (Both Paths)

**Convex** - `processNotification` action runs

**Convex** - Updates notification status to "processing"

**Convex** - Increments attempts counter

**Convex** - For "Order" event type: Calls `processOrderNotification`

- For "Message" or "Feedback": Handles separately (future)

**Convex** - Creates Bricklink store client

**Convex** - Fetches full order data: `client.getOrder(orderId)`

**Convex** - Fetches order items: `client.getOrderItems(orderId)`

**Convex** - Calls `api.marketplaces.bricklink.notifications.upsertOrder` mutation

**Convex** - Upserts `bricklinkOrders` document

- Parses timestamps (date_ordered, date_status_changed)
- Stores order metadata (buyer info, shipping, payment, etc.)

**Convex** - Upserts `bricklinkOrderItems` documents

- For each item: Matches to inventory by `itemNo` + `colorId` + `condition` + `location`
- Retrieves location from matched inventory item (if exists)
- Sets `status: "unpicked"` initially
- Stores item details (quantity, price, condition, etc.)

**Convex** - Reserves inventory for order items

- For each order item with matched inventory:
  - Calculates required quantity
  - Updates `quantityReserved` on inventory item
  - Creates reservation ledger entry

**Convex** - Updates notification status to "completed"

**Convex** - Sets `processedAt` timestamp

**Frontend** - Receives real-time update via Convex subscription

**User** - Sees new order appear in orders table

## Related Files

- `convex/marketplaces/bricklink/webhook.ts::bricklinkWebhook` - Webhook HTTP handler
- `convex/marketplaces/bricklink/notifications.ts::upsertNotification` - Idempotent notification creation
- `convex/marketplaces/bricklink/notifications.ts::processNotification` - Notification processor
- `convex/marketplaces/bricklink/notifications.ts::processOrderNotification` - Order-specific processing
- `convex/marketplaces/bricklink/notifications.ts::upsertOrder` - Order upsert mutation
- `convex/marketplaces/bricklink/notifications.ts::pollNotificationsForBusiness` - Polling action
- `convex/marketplaces/bricklink/storeClient.ts::getOrder` - Order fetch method
- `convex/marketplaces/bricklink/storeClient.ts::getOrderItems` - Order items fetch method

## Notes

- Webhook is preferred method (real-time, efficient)
- Polling is fallback for reliability (catches missed webhooks)
- Deduplication via `dedupeKey` prevents duplicate processing
- Replay protection: Ignores notifications older than 1 hour
- Processing is async (webhook returns immediately)
- Inventory reservation happens automatically on order receipt
- Location matching uses exact match on `partNumber` + `colorId` + `condition` + `location`
- Order items without matched inventory still stored (location may be "UNKNOWN")
