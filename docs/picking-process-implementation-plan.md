# Picking Process Implementation Plan

## Overview

Implement a complete picking workflow that allows warehouse workers to select orders, view all order items sorted by location, and mark items as picked. The interface uses a focused/compact view pattern where one item is fully expanded while others are shown in a condensed, faded state.

## Current State Analysis

### Database Schema

#### Order Items (`bricklinkOrderItems`)

**Current Fields:**

- `businessAccountId`: `Id<"businessAccounts">`
- `orderId`: `string` (BrickLink order_id)
- `inventoryId`: `optional(number)` (BrickLink inventory_id, not Convex inventory item ID)
- `itemNo`: `string` (part number)
- `itemName`: `string`
- `itemType`: `string` (PART, SET, MINIFIG, etc.)
- `itemCategoryId`: `optional(number)`
- `colorId`: `number`
- `colorName`: `optional(string)`
- `quantity`: `number`
- `newOrUsed`: `string` ("N" or "U")
- `completeness`: `optional(string)` (C, B, S for SETs)
- `unitPrice`: `number`
- `unitPriceFinal`: `number`
- `currencyCode`: `string`
- `remarks`: `optional(string)`
- `description`: `optional(string)`
- `weight`: `optional(number)`
- `createdAt`: `number`
- `updatedAt`: `number`

**Missing Fields:**

- `location`: `string` (should be added from BrickLink API during ingestion)
- `isPicked`: `boolean` (needed for picking status)

**Indexes:**

- `by_order`: `["businessAccountId", "orderId"]`
- `by_business_item`: `["businessAccountId", "itemNo", "colorId"]`

#### Inventory Items (`inventoryItems`)

**Current Fields:**

- `businessAccountId`: `Id<"businessAccounts">`
- `name`: `string`
- `partNumber`: `string` (BrickLink part number)
- `colorId`: `string` (stored as string, not number)
- `location`: `string`
- `quantityAvailable`: `number`
- `quantityReserved`: `number`
- `condition`: `"new" | "used"`
- `price`: `optional(number)`
- `notes`: `optional(string)`
- `createdBy`: `Id<"users">`
- `createdAt`: `number`
- `updatedAt`: `optional(number)`
- `isArchived`: `optional(boolean)`
- `deletedAt`: `optional(number)`
- `fileId`: `optional(Id<"inventoryFiles">)`
- `marketplaceSync`: `marketplaceSync` object

**Matching Logic:**

- Order items match inventory items by:
  - `itemNo === partNumber` (order item `itemNo` matches inventory `partNumber`)
  - `colorId.toString() === colorId` (order item `colorId` is number, inventory `colorId` is string)
  - `newOrUsed === "N" ? condition === "new" : condition === "used"`

**Note:** The user states that location should already be available from the initial order ingestion from BrickLink API. However, the current schema doesn't include a location field on `bricklinkOrderItems`. We need to:

1. **Add location field to order items schema** - This should be populated during order ingestion by matching with inventory items or extracting from BrickLink API response
2. **Verify order ingestion process** - Ensure location is captured during order ingestion

### Current UI State

#### Orders Page (`src/app/(authenticated)/orders/page.tsx`)

- Uses `OrdersTableWrapper` component
- Has `OrdersBulkActions` component with "Print Pick Slips" button
- Orders table supports row selection via `enableRowSelection={true}`
- Selected rows available via `selectedRows` prop

#### Bulk Actions (`src/components/orders/orders-bulk-actions.tsx`)

- Currently only has "Print Pick Slips" button
- Extracts `orderIds` from selected rows
- Navigates to `/print/packaging-slips?orderIds=...`

### Order Ingestion Process

**Current State (`convex/bricklink/notifications.ts`):**

- `upsertOrder` mutation handles order ingestion
- Order items are inserted without location field
- No inventory quantity updates during ingestion
- **Note:** User states inventory quantity should be adjusted on order ingestion (decrease quantity, increase reserved), but this is not currently implemented

**BrickLink API Response:**

- `BricklinkOrderItemResponse` includes `inventory_id` (optional number) which is BrickLink's inventory ID
- Does NOT include location directly in API response
- Location must be obtained by matching order item with inventory items or from BrickLink inventory API

## Implementation Requirements

### 1. Schema Changes

#### Add Fields to `bricklinkOrderItems`

**File:** `convex/marketplace/schema.ts`

```typescript
bricklinkOrderItems: defineTable({
  // ... existing fields ...
  location: v.string(), // NEW: Location from inventory item or BrickLink API
  isPicked: v.boolean(), // NEW: Picking status (default: false)
  // ... rest of fields ...
});
```

**Migration Strategy:**

- Since order hasn't launched yet, we can drop the table data and recreate
- Use Convex MCP to drop table data if desired
- Default values: `location: "UNKNOWN"` (for existing items), `isPicked: false`

**Implementation Steps:**

1. Add `location: v.string()` to schema
2. Add `isPicked: v.boolean()` to schema (default: false)
3. Drop existing `bricklinkOrderItems` table data (using Convex MCP or manual deletion)
4. Update order ingestion to populate location field

### 2. Order Ingestion Updates

**File:** `convex/bricklink/notifications.ts` (function: `upsertOrder`)

**Current Behavior:**

- Inserts order items without location
- Does not update inventory quantities

**Required Changes:**

#### A. Add Location to Order Items During Ingestion

When inserting order items, we need to:

1. Match order item with inventory item using:
   - `itemNo === partNumber`
   - `colorId.toString() === colorId` (convert order item colorId number to string)
   - `newOrUsed === "N" ? condition === "new" : condition === "used"`
2. If match found, use inventory item's `location`
3. If no match found, use `"UNKNOWN"` or extract from BrickLink inventory API if `inventoryId` is available

**Implementation:**

```typescript
// In upsertOrder, before inserting order items:
for (const batch of items) {
  for (const item of batch) {
    // Match with inventory item to get location
    const matchedInventoryItem = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .filter((q) =>
        q.and(
          q.eq(q.field("partNumber"), item.item.no),
          q.eq(q.field("colorId"), item.color_id.toString()),
          q.eq(q.field("condition"), item.new_or_used === "N" ? "new" : "used"),
        ),
      )
      .first();

    const location = matchedInventoryItem?.location || "UNKNOWN";

    await ctx.db.insert("bricklinkOrderItems", {
      // ... existing fields ...
      location, // NEW
      isPicked: false, // NEW
      // ... rest of fields ...
    });
  }
}
```

#### B. Update Inventory on Order Ingestion

**User Requirement:** When an order is ingested, inventory quantity should decrease and reserved quantity should increase.

**Implementation:**

```typescript
// After matching inventory item, update quantities:
if (matchedInventoryItem) {
  const quantityOrdered = item.quantity;

  // Update inventory item
  await ctx.db.patch(matchedInventoryItem._id, {
    quantityAvailable: matchedInventoryItem.quantityAvailable - quantityOrdered,
    quantityReserved: (matchedInventoryItem.quantityReserved || 0) + quantityOrdered,
    updatedAt: now,
  });

  // Write to quantity ledger
  const seq = await getNextSeqForItem(ctx.db, matchedInventoryItem._id);
  const preAvailable = await getCurrentAvailableFromLedger(ctx.db, matchedInventoryItem._id);
  const postAvailable = preAvailable - quantityOrdered;

  await ctx.db.insert("inventoryQuantityLedger", {
    businessAccountId: args.businessAccountId,
    itemId: matchedInventoryItem._id,
    timestamp: now,
    seq,
    preAvailable,
    postAvailable,
    deltaAvailable: -quantityOrdered,
    reason: "order_sale",
    source: "bricklink",
    orderId: order.order_id,
    correlationId: crypto.randomUUID(),
  });

  // Enqueue marketplace sync if needed
  // ... (follow existing pattern from inventory mutations)
}
```

**Note:** This is a significant change to order ingestion. Ensure:

- Idempotency: Don't double-process if order already exists
- Handle partial matches (some items match, some don't)
- Error handling for negative quantities
- Transaction safety (use Convex transactions if available)

### 3. New Convex Queries

**File:** `convex/marketplace/queries.ts`

#### Query: `getPickableItemsForOrders`

**Purpose:** Get all order items for selected orders, sorted by location, ready for picking.

**Implementation:**

```typescript
export const getPickableItemsForOrders = query({
  args: {
    orderIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (!businessAccountId || args.orderIds.length === 0) {
      return [];
    }

    // Get all order items for the given orderIds
    const allOrderItems: Doc<"bricklinkOrderItems">[] = [];

    for (const orderId of args.orderIds) {
      const items = await ctx.db
        .query("bricklinkOrderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .collect();

      allOrderItems.push(...items);
    }

    // Filter to only unpicked items
    const unpickedItems = allOrderItems.filter((item) => !item.isPicked);

    // Match each order item with inventory item to get remaining quantity info
    const pickableItems: PickableItem[] = await Promise.all(
      unpickedItems.map(async (orderItem) => {
        // Match inventory item
        const inventoryItem = await ctx.db
          .query("inventoryItems")
          .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
          .filter((q) =>
            q.and(
              q.eq(q.field("partNumber"), orderItem.itemNo),
              q.eq(q.field("colorId"), orderItem.colorId.toString()),
              q.eq(q.field("condition"), orderItem.newOrUsed === "N" ? "new" : "used"),
            ),
          )
          .first();

        // Calculate remaining after pick
        // remainingAfterPick = inventory.quantityAvailable + inventory.quantityReserved - orderItem.quantity
        const remainingAfterPick = inventoryItem
          ? inventoryItem.quantityAvailable + inventoryItem.quantityReserved - orderItem.quantity
          : 0;

        return {
          orderItemId: orderItem._id,
          orderId: orderItem.orderId,
          itemNo: orderItem.itemNo,
          itemName: orderItem.itemName,
          colorId: orderItem.colorId,
          colorName: orderItem.colorName,
          quantity: orderItem.quantity,
          location: orderItem.location || "UNKNOWN",
          inventoryItemId: inventoryItem?._id,
          remainingAfterPick,
          imageUrl: undefined, // TODO: Add image URL if available
        };
      }),
    );

    // Sort by location (alphabetically)
    pickableItems.sort((a, b) => a.location.localeCompare(b.location));

    return pickableItems;
  },
});
```

**Return Type:**

```typescript
type PickableItem = {
  orderItemId: Id<"bricklinkOrderItems">;
  orderId: string;
  itemNo: string;
  itemName: string;
  colorId: number;
  colorName?: string;
  quantity: number;
  location: string;
  inventoryItemId: Id<"inventoryItems"> | undefined;
  remainingAfterPick: number; // quantityAvailable + quantityReserved - orderItem.quantity
  imageUrl?: string; // For future use
};
```

### 4. New Convex Mutations

**File:** `convex/marketplace/mutations.ts` (create if doesn't exist, or add to existing mutations file)

#### Mutation: `markOrderItemAsPicked`

**Purpose:** Mark an order item as picked and update inventory reserved quantity.

**User Requirements:**

- No partial picking - mark entire quantity as picked
- Only update `quantityReserved` (decrease by quantity picked)
- Do NOT update `quantityAvailable` (this was already decreased during order ingestion)
- Update order item `isPicked` to `true`

**Implementation:**

```typescript
export const markOrderItemAsPicked = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
    inventoryItemId: v.id("inventoryItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already picked
    if (orderItem.isPicked) {
      throw new ConvexError("Order item already picked");
    }

    // Get inventory item
    const inventoryItem = await ctx.db.get(args.inventoryItemId);
    if (!inventoryItem) {
      throw new ConvexError("Inventory item not found");
    }

    // Verify inventory item matches order item
    if (
      inventoryItem.partNumber !== orderItem.itemNo ||
      inventoryItem.colorId !== orderItem.colorId.toString() ||
      inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
    ) {
      throw new ConvexError("Inventory item does not match order item");
    }

    // Verify sufficient reserved quantity
    const quantityToPick = orderItem.quantity;
    if (inventoryItem.quantityReserved < quantityToPick) {
      throw new ConvexError(
        `Insufficient reserved quantity. Required: ${quantityToPick}, Available: ${inventoryItem.quantityReserved}`,
      );
    }

    const now = Date.now();
    const correlationId = crypto.randomUUID();

    // Update order item
    await ctx.db.patch(args.orderItemId, {
      isPicked: true,
      updatedAt: now,
    });

    // Update inventory reserved quantity (decrease)
    const newReservedQuantity = inventoryItem.quantityReserved - quantityToPick;

    await ctx.db.patch(args.inventoryItemId, {
      quantityReserved: newReservedQuantity,
      updatedAt: now,
    });

    // Note: We do NOT update quantityAvailable here
    // It was already decreased during order ingestion

    // Write to quantity ledger for reserved quantity change
    // Note: This is a bit unusual - we're tracking reserved quantity changes
    // We might want a separate ledger for reserved quantity, but for now we'll
    // track it as a special case in the existing ledger
    // Actually, let's not write to ledger for reserved changes - just track available changes
    // Reserved is internal tracking, not inventory quantity

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityPicked: quantityToPick,
    };
  },
});
```

**Note:** The user clarified that inventory quantity should NOT be adjusted on pick - only reserved quantity. The inventory quantity was already decreased during order ingestion.

### 5. Order Status Update Logic

**User Requirement:** When all order items are picked, update order status from "Paid" to "Packed".

**BrickLink Status Values:**

- `Paid` - Payment received. Only ship orders once the "Order Status" updates to "Paid."
- `Packed` - Package has been sealed but not yet shipped.
- `Shipped` - Package has been shipped but not yet received by buyer.

**Implementation:**

Create a mutation or query that checks if all order items are picked:

```typescript
// In queries.ts
export const checkOrderFullyPicked = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    const orderItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    const allPicked = orderItems.length > 0 && orderItems.every((item) => item.isPicked);
    return allPicked;
  },
});
```

**Update Order Status Mutation:**

```typescript
// In mutations.ts or bricklink/notifications.ts
export const updateOrderStatusIfFullyPicked = mutation({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    // Get order
    const order = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .first();

    if (!order) {
      throw new ConvexError("Order not found");
    }

    // Get all order items
    const orderItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    // Check if all items are picked
    const allPicked = orderItems.length > 0 && orderItems.every((item) => item.isPicked);

    // Update status if fully picked and currently "Paid"
    if (allPicked && order.status === "Paid") {
      await ctx.db.patch(order._id, {
        status: "Packed",
        updatedAt: Date.now(),
      });

      return { updated: true, newStatus: "Packed" };
    }

    return { updated: false, currentStatus: order.status };
  },
});
```

**When to Call:**

- After each `markOrderItemAsPicked` mutation completes successfully
- Can be called from frontend after successful pick, or from backend after mutation

### 6. Frontend Route Structure

**New Route:** `src/app/(authenticated)/pick/page.tsx`

**Purpose:** Display picking interface for selected orders

**Implementation:**

```typescript
"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PickingInterface } from "@/components/picking/picking-interface";

export default function PickPage() {
  const searchParams = useSearchParams();
  const orderIdsParam = searchParams.get("orderIds");

  // Parse orderIds from query param
  const orderIds = orderIdsParam ? orderIdsParam.split(",").filter(Boolean) : [];

  // Fetch pickable items
  const pickableItems = useQuery(
    api.marketplace.queries.getPickableItemsForOrders,
    orderIds.length > 0 ? { orderIds } : "skip"
  );

  // Loading state
  if (!pickableItems) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading picking interface...</div>
      </div>
    );
  }

  // Error/empty state
  if (orderIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-muted-foreground">
          <p>No orders selected.</p>
          <p className="mt-2 text-sm">Please select orders from the orders page.</p>
        </div>
      </div>
    );
  }

  if (pickableItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-muted-foreground">
          <p>No items to pick.</p>
          <p className="mt-2 text-sm">All items for the selected orders may already be picked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <PickingInterface orderIds={orderIds} pickableItems={pickableItems} />
    </div>
  );
}
```

### 7. Picking Interface Components

#### Main Component: `src/components/picking/picking-interface.tsx`

**Responsibilities:**

- Display list of pickable items
- Manage focused item state (which item is expanded)
- Handle auto-scrolling when focus changes
- Call `markOrderItemAsPicked` mutation when PICK card tapped
- Update local state optimistically

**Implementation:**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PickableItemCard } from "./pickable-item-card";
import type { Id } from "@/convex/_generated/dataModel";

type PickableItem = {
  orderItemId: Id<"bricklinkOrderItems">;
  orderId: string;
  itemNo: string;
  itemName: string;
  colorId: number;
  colorName?: string;
  quantity: number;
  location: string;
  inventoryItemId: Id<"inventoryItems"> | undefined;
  remainingAfterPick: number;
  imageUrl?: string;
};

interface PickingInterfaceProps {
  orderIds: string[];
  pickableItems: PickableItem[];
}

export function PickingInterface({ orderIds, pickableItems }: PickingInterfaceProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [pickedItems, setPickedItems] = useState<Set<string>>(new Set());
  const focusedItemRef = useRef<HTMLDivElement>(null);
  const markAsPicked = useMutation(api.marketplace.mutations.markOrderItemAsPicked);
  const updateOrderStatus = useMutation(api.marketplace.mutations.updateOrderStatusIfFullyPicked);

  // Filter out picked items from display
  const unpickedItems = pickableItems.filter(
    (item) => !pickedItems.has(item.orderItemId)
  );

  // Get currently focused item
  const focusedItem = unpickedItems[focusedIndex];

  // Auto-scroll to focused item
  useEffect(() => {
    if (focusedItemRef.current && focusedIndex !== null) {
      focusedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusedIndex]);

  const handlePick = async (item: PickableItem) => {
    if (!item.inventoryItemId) {
      console.error("Cannot pick item without inventory item ID");
      return;
    }

    try {
      // Optimistic update
      setPickedItems((prev) => new Set(prev).add(item.orderItemId));

      // Call mutation
      await markAsPicked({
        orderItemId: item.orderItemId,
        inventoryItemId: item.inventoryItemId,
      });

      // Check if order is fully picked and update status
      await updateOrderStatus({ orderId: item.orderId });

      // Move focus to next item
      if (focusedIndex < unpickedItems.length - 1) {
        setFocusedIndex(focusedIndex + 1);
      } else if (unpickedItems.length > 1) {
        // If we just picked the last item, focus stays on the last remaining item
        setFocusedIndex(Math.max(0, unpickedItems.length - 2));
      }
    } catch (error) {
      // Rollback optimistic update
      setPickedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.orderItemId);
        return next;
      });
      console.error("Failed to mark item as picked:", error);
      // TODO: Show error toast
    }
  };

  const handleSkip = () => {
    // Stub: Move to next item
    if (focusedIndex < unpickedItems.length - 1) {
      setFocusedIndex(focusedIndex + 1);
    }
  };

  const handleReportProblem = () => {
    // Stub: Show problem reporting modal/form
    console.log("Report problem - TODO");
  };

  if (unpickedItems.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">All Items Picked!</h2>
          <p className="text-muted-foreground">All items for the selected orders have been picked.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Picking Orders</h1>
        <div className="text-sm text-muted-foreground">
          {unpickedItems.length} items remaining
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-2">
        {unpickedItems.map((item, index) => (
          <div
            key={item.orderItemId}
            ref={index === focusedIndex ? focusedItemRef : null}
          >
            <PickableItemCard
              item={item}
              isFocused={index === focusedIndex}
              isPicked={pickedItems.has(item.orderItemId)}
              onPick={() => handlePick(item)}
              onSkip={handleSkip}
              onReportProblem={handleReportProblem}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### Item Card Component: `src/components/picking/pickable-item-card.tsx`

**Props:**

- `item`: PickableItem
- `isFocused`: boolean
- `isPicked`: boolean (for optimistic updates)
- `onPick`: () => void
- `onSkip`: () => void (stubbed)
- `onReportProblem`: () => void (stubbed)

**Features:**

- Expanded view when focused: shows large image, full details, LOCATION and PICK cards
- Compact view when not focused: smaller card with faded overlay
- Visual indication when picked (green overlay or checkmark)
- Shows remaining quantity to pick
- Stubs for "Missing/Problem" and "Skip" actions

**Implementation:**

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { PickableItem } from "./picking-interface";

interface PickableItemCardProps {
  item: PickableItem;
  isFocused: boolean;
  isPicked: boolean;
  onPick: () => void;
  onSkip: () => void;
  onReportProblem: () => void;
}

export function PickableItemCard({
  item,
  isFocused,
  isPicked,
  onPick,
  onSkip,
  onReportProblem,
}: PickableItemCardProps) {
  if (isPicked) {
    // Show picked state (compact)
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg opacity-60">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="font-medium">{item.itemName}</span>
          <span className="text-sm text-muted-foreground">- Picked</span>
        </div>
      </div>
    );
  }

  if (isFocused) {
    // Expanded view
    return (
      <div className="p-6 bg-white border-2 border-primary rounded-lg shadow-lg">
        {/* LOCATION Card */}
        <div className="mb-4 p-4 bg-white border-2 border-gray-300 rounded-lg">
          <div className="text-sm font-medium text-gray-600 mb-1">LOCATION</div>
          <div className="text-3xl font-bold">{item.location}</div>
        </div>

        {/* Item Details */}
        <div className="mb-4">
          <h3 className="text-xl font-bold mb-2">{item.itemName}</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Part: {item.itemNo}</div>
            <div>Color: {item.colorName || `Color ID ${item.colorId}`}</div>
            <div>Quantity: {item.quantity}</div>
            <div>Remaining After Pick: {item.remainingAfterPick}</div>
          </div>
        </div>

        {/* PICK Card - Tappable */}
        <Button
          onClick={onPick}
          className="w-full p-6 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 mb-4"
          size="lg"
        >
          <div className="text-sm font-medium text-gray-600 mb-1">PICK</div>
          <div className="text-3xl font-bold">{item.quantity}</div>
        </Button>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <button
            onClick={onReportProblem}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Missing / Problem
          </button>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Compact view (not focused)
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg opacity-40">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{item.itemName}</div>
          <div className="text-sm text-muted-foreground">
            {item.location} • Qty: {item.quantity}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 8. Update Orders Bulk Actions

**File:** `src/components/orders/orders-bulk-actions.tsx`

**Add "Pick Orders" button next to "Print Pick Slips":**

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Printer, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Order } from "./orders-columns";

interface OrdersBulkActionsProps {
  selectedRows: Order[];
}

export function OrdersBulkActions({ selectedRows }: OrdersBulkActionsProps) {
  const router = useRouter();

  const handlePrintPackagingSlips = () => {
    if (selectedRows.length === 0) return;

    const orderIds = selectedRows.map((row) => row.orderId).filter(Boolean);
    if (orderIds.length === 0) return;

    const queryString = orderIds.join(",");
    router.push(`/print/packaging-slips?orderIds=${encodeURIComponent(queryString)}`);
  };

  const handlePickOrders = () => {
    if (selectedRows.length === 0) return;

    const orderIds = selectedRows.map((row) => row.orderId).filter(Boolean);
    if (orderIds.length === 0) return;

    const queryString = orderIds.join(",");
    router.push(`/pick?orderIds=${encodeURIComponent(queryString)}`);
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePickOrders}
        disabled={selectedRows.length === 0}
      >
        <Package className="mr-2 h-4 w-4" />
        Pick Orders {selectedRows.length > 0 && `(${selectedRows.length})`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrintPackagingSlips}
        disabled={selectedRows.length === 0}
      >
        <Printer className="mr-2 h-4 w-4" />
        Print Pick Slips {selectedRows.length > 0 && `(${selectedRows.length})`}
      </Button>
    </div>
  );
}
```

## Implementation Order

### Phase 1: Schema & Backend Foundation

1. **Schema Changes**

   - Add `location: v.string()` to `bricklinkOrderItems`
   - Add `isPicked: v.boolean()` to `bricklinkOrderItems` (default: false)
   - Drop existing `bricklinkOrderItems` table data (using Convex MCP)

2. **Order Ingestion Updates**

   - Update `upsertOrder` to populate `location` field by matching with inventory items
   - Implement inventory quantity updates on order ingestion:
     - Decrease `quantityAvailable` by order item quantity
     - Increase `quantityReserved` by order item quantity
     - Write to `inventoryQuantityLedger` with reason `"order_sale"`
   - Handle cases where inventory item not found (use "UNKNOWN" location)

3. **Backend Queries & Mutations**
   - Implement `getPickableItemsForOrders` query
   - Implement `markOrderItemAsPicked` mutation
   - Implement `updateOrderStatusIfFullyPicked` mutation (or add to existing mutation)
   - Test with sample data

### Phase 2: Frontend Route & Main Component

4. **Frontend Route**

   - Create `/pick` route (`src/app/(authenticated)/pick/page.tsx`)
   - Handle `orderIds` query parameter
   - Basic loading and error states

5. **Picking Interface Component**
   - Create `PickingInterface` component
   - Basic list rendering (no focus yet)
   - Connect to `getPickableItemsForOrders` query

### Phase 3: Item Card & Focus Logic

6. **Item Card Component**

   - Create `PickableItemCard` component
   - Implement focused/compact views
   - Add LOCATION and PICK cards
   - Add faded overlay for compact items

7. **Picking Logic**
   - Implement pick handler
   - Add optimistic updates
   - Connect to `markOrderItemAsPicked` mutation
   - Implement auto-scroll to focused item

### Phase 4: Visual Polish & Integration

8. **Visual Polish**

   - Add picked state indicators (green overlay/checkmark)
   - Refine faded overlays for compact items
   - Improve focus indicator (border/shadow)
   - Test auto-scroll behavior

9. **Integration**

   - Add "Pick Orders" button to bulk actions
   - Test full workflow from orders page to picking interface
   - Verify order status updates when fully picked

10. **Stubs**
    - Add "Missing/Problem" button (bottom left)
    - Add "Skip" button (bottom right)
    - Add placeholder handlers

## Technical Considerations

### Performance

- **Query Optimization:**

  - Use Convex indexes efficiently (`by_order`, `by_businessAccount`)
  - Batch fetch all order items for multiple orders in single query
  - Consider pagination if list is very long (>1000 items)
  - Cache inventory item lookups if needed

- **Frontend Performance:**
  - Use React.memo for item cards to prevent unnecessary re-renders
  - Virtualize long lists if needed (react-window or similar)
  - Debounce scroll events

### Error Handling

- **Backend Errors:**

  - Handle cases where inventory item not found
  - Handle cases where inventory quantity insufficient
  - Validate business account membership
  - Return clear error messages

- **Frontend Errors:**
  - Show error messages for failed picks
  - Rollback optimistic updates on error
  - Handle network failures gracefully
  - Display loading states appropriately

### Data Consistency

- **Transaction Safety:**

  - Use Convex transactions if possible for atomic updates
  - Ensure order item and inventory item updates are consistent
  - Track correlation IDs for auditing

- **Idempotency:**
  - Prevent double-picking (check `isPicked` before updating)
  - Handle race conditions (multiple users picking same item)

### Mobile Optimization

- **Touch Targets:**

  - Ensure PICK card is large enough (44x44px minimum)
  - Make LOCATION card easily readable
  - Large tap targets for action buttons

- **Layout:**
  - Responsive design for various screen sizes
  - Consider landscape orientation support
  - Test on actual mobile devices

### State Management

- **React State:**

  - Use React state for focused item index
  - Use React state for optimistic picked items
  - Use Convex queries for server state

- **Optimistic Updates:**
  - Update UI immediately when item is picked
  - Rollback on error
  - Sync with server state after mutation completes

## Files to Create/Modify

### New Files:

- `src/app/(authenticated)/pick/page.tsx`
- `src/components/picking/picking-interface.tsx`
- `src/components/picking/pickable-item-card.tsx`
- `convex/marketplace/mutations.ts` (if doesn't exist)

### Modified Files:

- `convex/marketplace/schema.ts` (add `location` and `isPicked` fields)
- `convex/bricklink/notifications.ts` (update `upsertOrder` to populate location and update inventory)
- `convex/marketplace/queries.ts` (add `getPickableItemsForOrders` query)
- `src/components/orders/orders-bulk-actions.tsx` (add "Pick Orders" button)

## Testing Checklist

### Backend Tests:

- [ ] Schema changes apply correctly
- [ ] Order ingestion populates location field
- [ ] Order ingestion updates inventory quantities correctly
- [ ] `getPickableItemsForOrders` returns items sorted by location
- [ ] `markOrderItemAsPicked` updates order item and inventory correctly
- [ ] Order status updates to "Packed" when all items picked
- [ ] Error handling works for unmatched inventory
- [ ] Error handling works for insufficient reserved quantity

### Frontend Tests:

- [ ] Can select orders and navigate to picking page
- [ ] Items displayed sorted by location
- [ ] Focused item shows expanded view
- [ ] Other items show compact view with fade
- [ ] Tapping PICK card marks item as picked
- [ ] Picked items show visual indication
- [ ] Next item auto-focuses and scrolls into view
- [ ] Auto-scroll centers focused item properly
- [ ] Missing/Problem and Skip buttons exist (stubbed)
- [ ] Mobile touch interactions work well
- [ ] Error handling works for failed picks
- [ ] Optimistic updates work correctly

### Integration Tests:

- [ ] Full workflow from orders page to picking interface
- [ ] Inventory reserved quantity decreases correctly
- [ ] Order item `isPicked` updates correctly
- [ ] Order status updates when fully picked
- [ ] Multiple orders can be picked in same session
- [ ] Page refresh maintains state (or reloads correctly)

## Additional Notes

### Location Field Population

The user states that location should already be available from BrickLink API during order ingestion. However, the BrickLink API response doesn't include location directly. We have two options:

1. **Match with Inventory Items:** During order ingestion, match order items with inventory items and copy the location. This requires inventory items to exist before orders are ingested.

2. **Fetch from BrickLink Inventory API:** If `inventoryId` is available in the order item, we could fetch the inventory item from BrickLink API to get the location. This requires an additional API call.

**Recommendation:** Use Option 1 (match with inventory items) as it's more efficient and aligns with the user's statement that location should come from initial order ingestion. If inventory item doesn't exist, use "UNKNOWN" as fallback.

### Order Status Update Timing

The user wants order status to update from "Paid" to "Packed" when all items are picked. This can be done:

1. **After each pick:** Call `updateOrderStatusIfFullyPicked` after each successful pick
2. **On page load:** Check order status when picking interface loads
3. **Periodic check:** Poll for order status updates

**Recommendation:** Call `updateOrderStatusIfFullyPicked` after each successful `markOrderItemAsPicked` mutation completes. This ensures immediate status update.

### Remaining After Pick Calculation

The user wants to display: `remainingAfterPick = inventory.quantityAvailable + inventory.quantityReserved - orderItem.quantity`

This represents how many items will remain in the drawer after picking this order item. This is calculated in the `getPickableItemsForOrders` query and displayed in the item card.

## Future Enhancements (Not in Scope)

- Image display for items
- Batch picking (pick multiple items at once)
- Pick history/audit trail
- Missing/problem reporting workflow
- Skip item workflow
- Multi-user picking coordination
- Pick list generation/printing
- Barcode scanning for item verification
