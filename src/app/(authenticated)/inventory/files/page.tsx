"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { InventoryFilesList } from "@/components/inventory/InventoryFilesList";

export default function InventoryFilesPage() {
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  if (!businessAccountId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory Files</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            Loading your account information...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory Files</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize inventory items into files for batch synchronization to marketplaces.
          </p>
        </div>
      </div>

      <InventoryFilesList />
    </div>
  );
}
