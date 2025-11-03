"use client";

import { OrdersTableWrapper } from "@/components/orders/orders-table-wrapper";

export default function OrdersPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] ">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>

      <OrdersTableWrapper />
    </div>
  );
}
