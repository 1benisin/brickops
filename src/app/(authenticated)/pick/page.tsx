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
    api.orders.queries.getPickableItemsForOrders,
    orderIds.length > 0 ? { orderIds } : "skip",
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
    <div className="min-h-screen bg-slate-900">
      <PickingInterface orderIds={orderIds} pickableItems={pickableItems} />
    </div>
  );
}
