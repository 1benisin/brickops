"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InventoryFileDetail } from "@/components/inventory/InventoryFileDetail";

export default function InventoryFileDetailPage({
  params,
}: {
  params: { fileId: Id<"inventoryFiles"> };
}) {
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  if (!businessAccountId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">File Details</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            Loading your account information...
          </div>
        </div>
      </div>
    );
  }

  return <InventoryFileDetail fileId={params.fileId} />;
}
