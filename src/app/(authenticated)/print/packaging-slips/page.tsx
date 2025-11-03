"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PackagingSlip } from "@/components/orders/packaging-slip/packaging-slip";

export default function PrintPackagingSlipsPage() {
  const searchParams = useSearchParams();
  const orderIdsParam = searchParams.get("orderIds");

  // Parse orderIds from query param
  const orderIds = orderIdsParam ? orderIdsParam.split(",").filter(Boolean) : [];

  // Fetch order items for all selected orders
  const orderItemsData = useQuery(
    api.marketplace.queries.getOrderItemsForOrders,
    orderIds.length > 0 ? { orderIds } : "skip",
  );

  // Fetch selected orders
  const selectedOrders = useQuery(
    api.marketplace.queries.getOrdersByIds,
    orderIds.length > 0 ? { orderIds } : "skip",
  );

  // Loading state
  if (!orderItemsData || !selectedOrders) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading packaging slips...</div>
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

  if (selectedOrders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-muted-foreground">
          <p>No orders found.</p>
          <p className="mt-2 text-sm">
            The selected orders may not exist or belong to your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="print:bg-white">
      {selectedOrders.map((order, index) => {
        const items = orderItemsData[order.orderId] || [];
        const isLast = index === selectedOrders.length - 1;

        return (
          <div key={order._id} className={!isLast ? "print:break-after-page" : ""}>
            <PackagingSlip order={order} items={items} />
            {!isLast && (
              <hr className="my-8 h-px border-0 bg-gray-200 dark:bg-gray-700 print:hidden" />
            )}
          </div>
        );
      })}
    </div>
  );
}
