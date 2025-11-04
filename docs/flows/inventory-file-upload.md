# Inventory File Upload Flow

## Overview

User uploads a file (CSV/Excel) containing multiple inventory items. System processes the file, allows user to review items, and then adds them to inventory in batch.

## Flow Steps

**User** - Navigates to `/inventory/files` page

**User** - Clicks "Upload File" button

**Frontend** - Opens file upload dialog

**User** - Selects file (CSV or Excel format)

**Frontend** - Validates file type and size

**Frontend** - Generates upload URL via `api.files.generateUploadUrl`

**Frontend** - Uploads file to Convex storage

**Convex** - Returns `fileId` and `storageId`

**Frontend** - Calls `api.inventory.files.mutations.createFile` with file metadata

**Convex** - Creates `inventoryFiles` document

- Stores file name, size, type, upload date
- Sets `status`: "uploaded"
- Sets `itemCount`: 0 (will be updated after parsing)

**Frontend** - Navigates to `/inventory/files/{fileId}` page

**Frontend** - Calls `api.inventory.files.actions.parseFile` with `fileId`

**Convex** - Retrieves file from storage

**Convex** - Parses file (CSV or Excel)

- Extracts rows with part data
- Validates required fields (part number, color, quantity, location)
- Maps to inventory item format

**Convex** - Creates `inventoryFileItems` documents for each parsed row

- Stores parsed data (part number, color, quantity, location, price, etc.)
- Sets `status`: "pending" (not yet added to inventory)
- Links to parent file via `fileId`

**Convex** - Updates file `itemCount` and `status`: "parsed"

**Frontend** - Displays file detail page with:

- File metadata (name, upload date, item count)
- List of parsed items with validation status
- "Add to Inventory" button

**User** - Reviews parsed items

- Can see validation errors (missing fields, invalid data)
- Can edit individual items before adding

**User** - Clicks "Add to Inventory" (or "Add Selected Items")

**Frontend** - For each selected item:

- Calls `api.inventory.mutations.addInventoryItem` with item data
- Includes `fileId` in the mutation args

**Convex** - Processes each item via `addInventoryItem` mutation

- Creates inventory item (see `inventory-add.md` flow)
- Links item to file via `fileId`
- Creates ledger entries
- Enqueues marketplace sync

**Convex** - Updates `inventoryFileItems` status to "added"

**Frontend** - Refreshes file detail page

- Shows updated item statuses
- Updates item count

**User** - Can navigate back to files list or continue adding more items

## Related Files

- `src/app/(authenticated)/inventory/files/page.tsx` - Files list page
- `src/app/(authenticated)/inventory/files/[fileId]/page.tsx` - File detail page
- `src/components/inventory/files/InventoryFilesList.tsx` - Files list component
- `src/components/inventory/files/InventoryFileDetail.tsx` - File detail component
- `convex/inventory/files/mutations.ts::createFile` - File creation
- `convex/inventory/files/actions.ts::parseFile` - File parsing action
- `convex/inventory/files/queries.ts::getFile` - File retrieval
- `convex/inventory/files/queries.ts::getFileItemCount` - Item count query

## Notes

- File parsing is asynchronous (action) to handle large files
- Parsed items are stored separately before adding to inventory
- User can review and edit items before bulk adding
- Items can be added individually or in batch
- File items are linked to inventory items via `fileId` field
- Validation errors are shown per item
- File status tracks: "uploaded" → "parsing" → "parsed" → "completed"
