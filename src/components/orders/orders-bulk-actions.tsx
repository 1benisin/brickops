"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePrintPackagingSlips}
      disabled={selectedRows.length === 0}
    >
      <Printer className="mr-2 h-4 w-4" />
      Print Packaging Slips {selectedRows.length > 0 && `(${selectedRows.length})`}
    </Button>
  );
}

