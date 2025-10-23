"use client";

import { AddInventoryItemButton } from "@/components/inventory/AddInventoryItemButton";

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <AddInventoryItemButton />
      </div>
    </div>
  );
}
