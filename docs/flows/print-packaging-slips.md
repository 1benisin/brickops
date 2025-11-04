# Print Packaging Slips Flow

## Overview

User selects one or multiple orders and generates printable packaging slips for shipping.

## Flow Steps

**User** - Selects one or multiple orders on orders page (`/orders`)

**User** - Clicks the "Print Pick Slips" button

**Next.js** - Navigates to `/print/packaging-slips` page with order IDs in URL params (`?orderIds=123,456`)

**Frontend** - Parses order IDs from query parameter

**Frontend** - Calls `api.marketplace.queries.getOrderItemsForOrders` with order IDs

**Convex** - For each order ID:

- Queries `bricklinkOrderItems` by `businessAccountId` and `orderId`
- Returns items grouped by order ID

**Frontend** - Calls `api.marketplace.queries.getOrdersByIds` with order IDs

**Convex** - Queries `bricklinkOrders` by order IDs

- Returns order metadata (buyer info, shipping address, payment info, etc.)

**Frontend** - Displays `PackagingSlip` component for each order

- Shows order header (order ID, buyer info, shipping address)
- Shows order items list (part number, name, color, quantity, condition)
- Formatted for printing with page breaks between orders

**User** - Uses browser print dialog (Ctrl+P / Cmd+P)

**Browser** - Prints packaging slips with proper page breaks

## Related Files

- `src/app/(authenticated)/print/packaging-slips/page.tsx` - Print page route
- `src/components/orders/packaging-slip/packaging-slip.tsx` - Packaging slip component
- `src/components/orders/orders-bulk-actions.tsx` - "Print Pick Slips" button
- `convex/marketplace/queries.ts::getOrderItemsForOrders` - Order items query
- `convex/marketplace/queries.ts::getOrdersByIds` - Orders query

## Notes

- Multiple orders are printed with page breaks between them
- Print styling uses CSS `@media print` rules
- Order items are displayed with all relevant details for shipping
- Shipping address and buyer info are prominently displayed
