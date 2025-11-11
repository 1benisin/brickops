# Inventory to Marketplace Sync Flow

## Overview

When inventory items are created or updated, changes are queued for synchronization to Bricklink and Brickowl marketplaces. A background worker processes these syncs asynchronously.

## Flow Steps

### Enqueue Phase (During Add/Edit)

**Convex** - During `addInventoryItem` or `updateInventoryItem` mutation:

- Generates `correlationId` for tracking
- Calculates current sequence number
- Calls `enqueueMarketplaceSync` helper

**Convex** - Checks if marketplace credentials are configured

- Queries `marketplaceCredentials` for business account
- Filters to active credentials for "bricklink" and "brickowl"

**Convex** - For each configured provider:

- Creates `marketplaceSyncOutbox` entry with:
  - `itemId`: Inventory item ID
  - `provider`: "bricklink" or "brickowl"
  - `kind`: "create", "update", or "delete"
  - `lastSyncedSeq`: Previous sync sequence (0 for new items)
  - `currentSeq`: Current sequence number
  - `correlationId`: For tracking related operations
  - `status`: "pending"
  - `attempts`: 0

**Convex** - Sets inventory item `marketplaceSync` status to "pending" (if outbox entries created)

### Worker Processing Phase

**Convex Worker** - Processes `marketplaceSyncOutbox` entries (via cron or trigger)

**Convex** - Calls `api.inventory.sync.syncInventoryChange` action

**Convex** - Retrieves current inventory item data

**Convex** - Gets list of configured providers for business account

**Convex** - For each provider, calls `syncToMarketplace`:

- Creates marketplace store client (Bricklink or Brickowl)
- Retrieves `lastSyncedSeq` from sync status
- Gets current available quantity from ledger at `lastSyncedSeq`

**Convex** - Maps inventory item to marketplace format:

- **Bricklink**: Uses `mapConvexToBlCreate` or `mapConvexToBlUpdate`
- **Brickowl**: Uses `mapConvexToBrickOwlCreate` or `mapConvexToBrickOwlUpdate`
- Maps part number, color, condition, quantity, price, location

**Convex** - Calls marketplace API:

- **Create**: `client.createInventoryItem(mappedData)`
- **Update**: `client.updateInventoryItem(lotId, mappedData)`
- **Delete**: `client.deleteInventoryItem(lotId)`

**Marketplace API** - Returns success/failure with marketplace ID (lotId)

**Convex** - Updates sync status:

- On success: Sets status to "synced", stores `lotId`, advances `lastSyncedSeq`
- On failure: Sets status to "failed", stores error message, increments attempts

**Convex** - Updates `marketplaceSyncOutbox` entry:

- Sets status to "completed" or "failed"
- Stores result data

**Frontend** - Receives real-time update via Convex subscription

- Sync status indicator updates in inventory table

## Related Files

- `convex/inventory/sync.ts::syncInventoryChange` - Main sync action
- `convex/inventory/sync.ts::syncToMarketplace` - Provider-specific sync
- `convex/inventory/sync.ts::updateSyncStatuses` - Status update mutation
- `convex/inventory/helpers.ts::enqueueMarketplaceSync` - Outbox enqueue helper
- `convex/marketplaces/bricklink/inventory/transformers.ts` - Bricklink data mapping
- `convex/marketplaces/brickowl/storeMappers.ts` - Brickowl data mapping
- `convex/marketplaces/bricklink/storeClient.ts` - Bricklink API client
- `convex/marketplaces/brickowl/inventories.ts` - BrickOwl inventory API helpers

## Notes

- Sync is asynchronous via outbox pattern for reliability
- Sequence numbers track state changes for cursor-based sync
- Correlation IDs link related operations (e.g., quantity + location change)
- Failed syncs can be retried (worker increments attempts)
- Sync status is visible in inventory table UI
- Only configured and active marketplace credentials are synced
- Location mapping may differ between marketplaces (Bricklink uses location, Brickowl may use different field)
