# Order Status Update Flow

## Overview

When all items in an order are picked, the system automatically updates the order status to "Packed" and optionally syncs to marketplace.

## Flow Steps

### Automatic Status Update (After Picking)

**User** - Completes picking items for an order (see `orders.md` flow)

**Frontend** - Calls `api.marketplace.mutations.updateOrderStatusIfFullyPicked` with order ID

**Convex** - Validates user authentication

**Convex** - Retrieves order from `bricklinkOrders` table

**Convex** - Queries all order items for the order from `bricklinkOrderItems` table

**Convex** - Checks if all items are picked:
  - `orderItems.every(item => item.status === "picked")`

**Convex** - If all items picked AND current status is "Paid":
  - Updates order status to "Packed"
  - Sets `updatedAt` timestamp
  - Returns `{ updated: true, newStatus: "Packed" }`

**Convex** - Otherwise:
  - Returns `{ updated: false, currentStatus: order.status }`

**Frontend** - Receives update result

**Frontend** - Refreshes orders table to show updated status

**Background** - (Future) Sync status to Bricklink API:
  - Calls `client.updateOrderStatus(orderId, "Packed")`
  - Updates marketplace order status

### Manual Status Update (Future)

**User** - Manually updates order status in UI

**Frontend** - Calls update mutation with new status

**Convex** - Updates local order status

**Convex** - Syncs to marketplace API

**Frontend** - Updates UI

## Related Files

- `convex/marketplace/mutations.ts::updateOrderStatusIfFullyPicked` - Auto-update mutation
- `convex/bricklink/storeClient.ts::updateOrderStatus` - Marketplace API call (future)
- `src/components/picking/picking-interface.tsx` - Picking interface (triggers update)

## Notes

- Status update is automatic when all items are picked
- Only updates from "Paid" to "Packed" (prevents overwriting other statuses)
- Marketplace sync is planned but not yet implemented
- Status updates are tracked in order's `updatedAt` field
- Order items must have `status: "picked"` for all items to trigger update
- Items with status "skipped" or "issue" are not considered picked

