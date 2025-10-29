"use client";

import { Card } from "@/components/ui/card";

/**
 * Inventory Change History Page
 * TODO: Update to use new ledger queries (getItemQuantityLedger, getItemLocationLedger)
 */
export default function InventoryChangeHistoryPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory Change History
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          History display is being updated to use the new ledger system. This page will be restored
          once the implementation is complete.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          New ledger queries available: getItemQuantityLedger, getItemLocationLedger,
          calculateOnHandQuantity
        </p>
      </div>
      <Card className="p-6">
        <p className="text-muted-foreground">
          The history page previously used inventoryHistory table which has been replaced with:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
          <li>
            <code className="text-xs">inventoryQuantityLedger</code> - Quantity changes
          </li>
          <li>
            <code className="text-xs">inventoryLocationLedger</code> - Location changes
          </li>
        </ul>
      </Card>
    </div>
  );
}
