# Order Picking Flow

## Overview

User selects one or multiple orders from the orders page, navigates to the picking interface, and picks items sorted by location.

## Flow Steps

**User** - Selects one or multiple orders on orders page (`/orders`)

**User** - Clicks the "Pick Orders" button

**Next.js** - Navigates to `/pick` page with order IDs in URL params (`?orderIds=123,456`)

**Frontend** - Calls `api.marketplaces.shared.queries.getPickableItemsForOrders` with order IDs

**Convex** - Finds all order items for the specified orders

**Convex** - For each order item:

- Matches to inventory items by `partNumber` + `colorId` + `condition` + `location`
- Uses location from order item (stored on unified `orderItems.location`)
- Calculates `remainingAfterPick = (quantityAvailable + quantityReserved) - quantity`

**Convex** - Returns order items sorted by location

**Frontend** - Displays pickable items in `PickingInterface` component

- Shows items sorted by location
- One item fully expanded (focused), others condensed
- Displays location, quantity, part image, order indicators

**User** - Navigates to physical item location and picks items

**User** - Marks item as picked (clicks PICK button)

**Frontend** - Calls `api.marketplaces.shared.mutations.markOrderItemAsPicked` with:

- `orderItemId`: Order item ID
- `inventoryItemId`: Matched inventory item ID

**Convex** - Validates user access and item matching

**Convex** - Updates order item:

- Sets `status: "picked"` on unified `orderItems` document
- Sets `updatedAt` timestamp

**Convex** - Updates inventory item:

- Decreases `quantityReserved` by the quantity picked
- Calculates: `newReservedQuantity = max(0, currentReserved - quantityPicked)`
- If insufficient reserved quantity: Sets to 0 (doesn't throw error)
- Sets `updatedAt` timestamp

**Convex** - Returns success result

**Frontend** - Calls `api.orders.mutations.updateOrderStatusIfFullyPicked` with order ID

**Convex** - Checks if all items in order are picked

- If all picked AND status is "Paid": Updates order status to "Packed"

**Frontend** - Moves focus to next unpicked item

- Finds next unpicked item after current index
- If none after, finds previous unpicked item
- Auto-scrolls to focused item

**User** - Can mark item as skipped or issue

- **Skip**: User clicks "Skip" button
- **Frontend** - Calls `api.marketplaces.shared.mutations.markOrderItemAsSkipped`
- **Convex** - Sets `status: "skipped"` on order item
- **Frontend** - Shows yellow overlay on unfocused skipped items
- **Frontend** - Moves focus to next unpicked item

- **Issue**: User clicks "Missing / Problem" button
- **Frontend** - Calls `api.marketplaces.shared.mutations.markOrderItemAsIssue`
- **Convex** - Sets `status: "issue"` on order item
- **Frontend** - Shows red overlay on unfocused issue items
- **Frontend** - Moves focus to next unpicked item

**User** - Continues picking remaining items

## Related Files

- `src/app/(authenticated)/pick/page.tsx` - Pick page route
- `src/components/picking/picking-interface.tsx` - Main picking UI
- `src/components/picking/pickable-item-card.tsx` - Individual item card
- `src/components/orders/orders-bulk-actions.tsx` - "Pick Orders" button
- `convex/marketplaces/shared/queries.ts::getPickableItemsForOrders` - Query function
- `convex/marketplaces/shared/mutations.ts::markOrderItemAsPicked` - Mark item as picked mutation
- `convex/marketplaces/shared/mutations.ts::markOrderItemAsSkipped` - Mark item as skipped mutation
- `convex/marketplaces/shared/mutations.ts::markOrderItemAsIssue` - Mark item as having issue mutation
- `convex/orders/mutations.ts::updateOrderStatusIfFullyPicked` - Auto-update order status mutation

## Notes

- Order items are matched to inventory by:
  - `itemNo` (order) = `partNumber` (inventory)
  - `colorId` (order) = `colorId` (inventory, as string)
  - `newOrUsed === "N"` (order) = `condition === "new"` (inventory)
  - `location` (order) = `location` (inventory)
- Location comes from the order item (populated during order ingestion)
- Items are sorted alphabetically by location for efficient warehouse navigation
- Multiple orders can be picked in a single session
- Returns all items (including already picked ones) - frontend handles display based on `status` ("picked", "unpicked", "skipped", "issue")
- When item is picked: `quantityReserved` decreases (inventory was already decreased during order ingestion)
- Focus automatically moves to next unpicked item for efficient picking workflow
