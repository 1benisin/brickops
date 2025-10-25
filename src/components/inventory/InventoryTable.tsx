"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "./data-table/data-table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Loading skeleton component
const TableSkeleton = () => (
  <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="py-3 px-4">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        </Card>
      ))}
    </div>
    <div className="rounded-md border">
      <div className="p-4">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Error state component
const ErrorState = ({ error }: { error: string }) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>Failed to load inventory: {error}</AlertDescription>
  </Alert>
);

// Empty state component
const EmptyState = () => (
  <div className="text-center py-12">
    <div className="mx-auto h-12 w-12 text-muted-foreground mb-4">
      <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">No inventory items</h3>
    <p className="text-muted-foreground mb-4">Get started by adding your first inventory item.</p>
  </div>
);

// Stat card component
const StatCard = ({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
}) => (
  <Card className="py-3 px-4">
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {isLoading ? (
        <Skeleton className="h-5 w-12" />
      ) : (
        <div className="text-base font-bold">{value?.toLocaleString() || 0}</div>
      )}
    </div>
  </Card>
);

export function InventoryTable() {
  const items = useQuery(api.inventory.queries.listInventoryItems);
  const totals = useQuery(api.inventory.queries.getInventoryTotals);
  const syncConfig = useQuery(api.marketplace.queries.getMarketplaceSyncConfig);

  // Loading state
  if (items === undefined || totals === undefined || syncConfig === undefined) {
    return <TableSkeleton />;
  }

  // Error state
  if (items === null) {
    return <ErrorState error="Unable to fetch inventory items" />;
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Available" value={0} isLoading={false} />
          <StatCard label="Reserved" value={0} isLoading={false} />
          <StatCard label="Sold" value={0} isLoading={false} />
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3 flex-shrink-0">
        <StatCard label="Available" value={totals?.totals.available} isLoading={false} />
        <StatCard label="Reserved" value={totals?.totals.reserved} isLoading={false} />
        <StatCard label="Sold" value={totals?.totals.sold} isLoading={false} />
      </div>

      {/* Data Table - Scrollable Area */}
      <div className="flex-1 min-h-0">
        <DataTable data={items} syncConfig={syncConfig} />
      </div>
    </div>
  );
}
