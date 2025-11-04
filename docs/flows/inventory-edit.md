# Edit Inventory Item Flow

## Overview

User edits an existing inventory item's properties (location, quantity, price, etc.). Changes are tracked in ledgers and synced to marketplaces.

## Flow Steps

**User** - Opens inventory table on `/inventory` page

**User** - Clicks edit button on an inventory item row

**Frontend** - Opens `EditInventoryItemDialog` with current item data

**Frontend** - Loads part details via `api.catalog.queries.getPart` (for name, images)

**Frontend** - Loads price guide via `api.catalog.queries.getPriceGuide` (for price helper)

**User** - Modifies fields:

- Color (required)
- Location (required)
- Quantity Available (required, min 0)
- Quantity Reserved (optional, min 0)
- Condition (new/used)
- Price (optional, can use price guide helper)
- Notes (optional)

**User** - Clicks "Save Changes"

**Frontend** - Validates form (quantities >= 0)

**Frontend** - Calls `api.inventory.mutations.updateInventoryItem` with:

- `itemId`: Current item ID
- Updated field values
- `reason`: "Manual edit"

**Convex** - Validates user has owner role (AC: 3.4.1)

**Convex** - Retrieves current item from database

**Convex** - Validates quantities won't go negative

- Calculates `deltaAvailable = newAvailable - oldAvailable`
- Projects `projectedTotal = oldAvailable + deltaAvailable`
- Rejects if `projectedTotal < 0`

**Convex** - Captures previous state for potential rollback

**Convex** - Generates `correlationId` for tracking

**Convex** - Calculates sequence number via `getNextSeqForItem`

**Convex** - If quantity changed:

- Calculates `preAvailable` from current ledger state
- Calculates `postAvailable = preAvailable + deltaAvailable`
- Inserts `inventoryQuantityLedger` entry with:
  - `preAvailable`, `postAvailable`, `deltaAvailable`
  - `reason`: "Manual edit"
  - `source`: "user"
  - `userId`: Current user ID

**Convex** - If location changed:

- Inserts `inventoryLocationLedger` entry with:
  - `fromLocation`: Old location
  - `toLocation`: New location
  - `reason`: "Manual edit"
  - `source`: "user"
  - `userId`: Current user ID

**Convex** - Updates inventory item document with new values

- Updates `quantityAvailable`, `quantityReserved` (if changed)
- Updates `location`, `colorId`, `condition`, `price`, `notes` (if changed)
- Sets `updatedAt` timestamp

**Convex** - Enqueues marketplace sync outbox messages

- For each marketplace (Bricklink, Brickowl):
  - Gets current `lastSyncedSeq` from sync status
  - Enqueues outbox message with:
    - `changeType`: "update"
    - `currentSeq`: New sequence number
    - `lastSyncedSeq`: Previous sync sequence
    - `correlationId`: For tracking

**Convex** - Updates marketplace sync status to "pending" (if outbox messages created)

**Convex** - Returns updated item ID

**Frontend** - Refreshes inventory table to show updated values

**Background** - Marketplace sync worker processes outbox messages (see `inventory-sync.md`)

## Related Files

- `src/components/inventory/dialogs/EditInventoryItemDialog.tsx` - Edit dialog component
- `src/components/inventory/table/InventoryTableColumns.tsx` - Table with edit button
- `convex/inventory/mutations.ts::updateInventoryItem` - Update mutation
- `convex/inventory/helpers.ts::getNextSeqForItem` - Sequence calculation
- `convex/inventory/helpers.ts::getCurrentAvailableFromLedger` - Ledger state retrieval

## Notes

- Only users with "owner" role can edit inventory (AC: 3.4.1)
- Quantity validation prevents negative values at mutation level
- All changes are tracked in quantity and location ledgers
- Sequence numbers ensure proper ordering of ledger entries
- Marketplace sync is asynchronous via outbox pattern
- Price guide helper can auto-fill price from Bricklink price guide data
- Location changes are tracked separately from quantity changes
