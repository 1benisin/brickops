"use client";

import { OrdersTableWrapper } from "@/components/orders/orders-table-wrapper";

export default function OrdersPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-6">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Track marketplace orders, picking progress, and fulfillment status.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <OrdersTableWrapper />
      </div>
    </div>
  );
}
