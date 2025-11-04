# Add Inventory Item Flow

## Overview

User adds a new item to inventory through one of three methods: camera identification, catalog search, or file upload. Each method follows a similar path to the final add dialog.

## Flow Steps

### Method 1: Camera Identification

**User** - Clicks "Add Item" button on inventory page

**Frontend** - Opens `SearchOrCaptureDialog` with camera tab active

**User** - Grants camera permissions

**Frontend** - Initializes camera stream

**User** - Captures photo of part

**Frontend** - Converts canvas to JPEG blob

**Frontend** - Generates upload URL via `api.files.generateUploadUrl`

**Frontend** - Uploads image to Convex storage

**Convex** - Returns `storageId`

**Frontend** - Calls `api.identify.actions.identifyPartFromImage` with `storageId`

**Convex** - Retrieves image from storage

**Convex** - Calls Brickognize API `/predict/` with image

**Brickognize** - Returns identification results with confidence scores

**Convex** - Returns identification results to frontend

**Frontend** - Displays results in `IdentificationResultsList` component

**User** - Selects a part from results

**Frontend** - Opens `AddPartToInventoryDialog` with selected part number

### Method 2: Catalog Search

**User** - Clicks "Add Item" button on inventory page

**Frontend** - Opens `SearchOrCaptureDialog` with search tab active

**User** - Enters part number in search field

**Frontend** - Calls `api.catalog.queries.searchParts` with query

**Convex** - Searches catalog cache or fetches from Bricklink API

**Convex** - Returns matching parts

**Frontend** - Displays search results

**User** - Selects a part from results

**Frontend** - Opens `AddPartToInventoryDialog` with selected part number

### Method 3: File Upload (See `inventory-file-upload.md`)

### Add to Inventory (Common Path)

**User** - Fills in add dialog fields:

- Color (required)
- Location (required)
- Quantity Available (required, min 0)
- Quantity Reserved (optional, defaults to 0)
- Condition (new/used)
- Price (optional, can use price guide helper)
- Notes (optional)
- File ID (optional, if adding from file)

**User** - Clicks "Add to Inventory"

**Frontend** - Calls `api.inventory.mutations.addInventoryItem` with form data

**Convex** - Validates input (quantity >= 0)

**Convex** - Inserts new `inventoryItems` document

- Sets `marketplaceSync` status to "pending" for both Bricklink and Brickowl

**Convex** - Generates `correlationId` for tracking

**Convex** - Calculates sequence number via `getNextSeqForItem`

**Convex** - Inserts `inventoryQuantityLedger` entry

- `preAvailable`: 0 (new item)
- `postAvailable`: quantityAvailable
- `deltaAvailable`: quantityAvailable
- `reason`: "initial_stock"

**Convex** - Inserts `inventoryLocationLedger` entry

- `fromLocation`: undefined
- `toLocation`: location
- `reason`: "initial_stock"

**Convex** - Enqueues marketplace sync outbox messages

- Creates outbox entries for "bricklink" and "brickowl" if credentials exist
- Sets `lastSyncedSeq` to 0 (never synced)
- Uses same `correlationId`

**Convex** - Updates sync status

- If no credentials configured: Sets status to "synced" (no sync needed)
- If outbox messages created: Status remains "pending" (worker will process)

**Convex** - Returns new inventory item ID

**Frontend** - Refreshes inventory table to show new item

**Background** - Marketplace sync worker processes outbox messages (see `inventory-sync.md`)

## Related Files

- `src/components/inventory/add-item-workflow/AddInventoryItemButton.tsx` - Entry point component
- `src/components/inventory/dialogs/SearchOrCaptureDialog.tsx` - Camera/search dialog
- `src/components/inventory/dialogs/AddPartToInventoryDialog.tsx` - Add item form
- `src/components/inventory/add-item-workflow/IdentificationResultsList.tsx` - Results display
- `convex/inventory/mutations.ts::addInventoryItem` - Mutation function
- `convex/identify/actions.ts::identifyPartFromImage` - Identification action
- `convex/inventory/helpers.ts::getNextSeqForItem` - Sequence calculation

## Notes

- Camera identification uses Brickognize API with confidence threshold (85% auto-accept)
- Catalog search uses cached Bricklink catalog data or fetches on-demand
- Quantity validation prevents negative values
- Marketplace sync is asynchronous via outbox pattern
- All inventory changes are tracked in quantity and location ledgers
- Sequence numbers ensure proper ordering of ledger entries
