# Bricklink Notification Polling Flow

## Overview

Background cron job polls Bricklink API for new notifications as a safety net for missed webhooks. This ensures no orders are missed even if webhook delivery fails.

## Flow Steps

**Convex Cron** - Runs `pollNotificationsForAllBusinesses` on schedule (every 3 minutes)

**Convex** - Queries all active `marketplaceCredentials` with provider "bricklink"

**Convex** - For each business account:

- Calls `api.marketplaces.bricklink.notifications.pollNotificationsForBusiness` action

**Convex** - Creates Bricklink store client with business credentials

**Convex** - Calls `client.getNotifications()` to fetch unread notifications

**Bricklink API** - Returns array of unread notifications:

- `event_type`: "Order" | "Message" | "Feedback"
- `resource_id`: Order/Message/Feedback ID
- `timestamp`: ISO 8601 timestamp

**Convex** - For each notification:

- Generates `dedupeKey`: `{businessAccountId}:{event_type}:{resource_id}:{timestamp}`
- Calls `api.marketplaces.bricklink.notifications.upsertNotification` (idempotent)
- Checks if notification already exists by `dedupeKey`
  - If exists: Returns existing ID (prevents duplicate processing)
  - If new: Creates notification with status "pending"
- Schedules `api.marketplaces.bricklink.notifications.processNotification` action

**Convex** - Updates `marketplaceCredentials.lastCentralPolledAt` timestamp

**Convex** - Notification processing continues (see `bricklink-order-notification.md` flow)

## Related Files

- `convex/crons.ts` - Cron job definitions
- `convex/marketplaces/bricklink/notifications.ts::pollNotificationsForBusiness` - Polling action
- `convex/marketplaces/bricklink/notifications.ts::pollNotificationsForAllBusinesses` - Multi-business poller
- `convex/marketplaces/bricklink/notifications.ts::updateLastPolled` - Timestamp update
- `convex/marketplaces/bricklink/storeClient.ts::getNotifications` - Bricklink API call

## Notes

- Polling runs every 3 minutes as safety net for webhook failures
- Deduplication via `dedupeKey` prevents processing same notification twice
- Idempotent design means webhook and polling can both receive same notification safely
- `lastCentralPolledAt` tracks when polling last succeeded
- Only polls businesses with active Bricklink credentials
- Polling is less efficient than webhooks but provides reliability guarantee
