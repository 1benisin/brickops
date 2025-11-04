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

    // Extract orderIds from selected rows
    const orderIds = selectedRows.map((row) => row.orderId).filter(Boolean);

    if (orderIds.length === 0) return;

    // Navigate to print route with orderIds as query param
    const queryString = orderIds.join(",");
    router.push(`/print/packaging-slips?orderIds=${encodeURIComponent(queryString)}`);
  };

  const handlePickOrders = () => {
    if (selectedRows.length === 0) return;

    const orderIds = selectedRows.map((row) => row.orderId).filter(Boolean);
    if (orderIds.length === 0) return;

    // Navigate to pick route with orderIds as query param
    const queryString = orderIds.join(",");
    // @ts-expect-error - Next.js router typing doesn't recognize dynamic query params for /pick route
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
