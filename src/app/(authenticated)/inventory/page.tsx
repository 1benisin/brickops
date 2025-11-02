"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { AddInventoryItemButton } from "@/components/inventory/add-item-workflow/AddInventoryItemButton";
import { InventoryTable } from "@/components/inventory/table/InventoryTable";
import { Button } from "@/components/ui/button";

export default function InventoryPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-6">
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/history">
              <History className="h-4 w-4 mr-2" />
              View History
            </Link>
          </Button>
          <AddInventoryItemButton />
        </div>
      </div>

      <InventoryTable />
    </div>
  );
}
