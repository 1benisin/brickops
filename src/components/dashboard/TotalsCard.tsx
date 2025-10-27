"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { TotalsCardSkeleton } from "./TotalsCardSkeleton";

interface TotalsCardProps {
  isLoading?: boolean;
}

export function TotalsCard({ isLoading }: TotalsCardProps) {
  const totals = useQuery(api.inventory.queries.getInventoryTotals);

  const values = useMemo(() => {
    return {
      items: totals?.counts.items ?? 0,
      available: totals?.totals.available ?? 0,
      reserved: totals?.totals.reserved ?? 0,
    };
  }, [totals]);

  if (isLoading || totals === undefined) {
    return <TotalsCardSkeleton />;
  }

  return (
    <Card data-testid="dashboard-totals">
      <CardHeader>
        <CardTitle>Totals</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">Items</div>
          <div className="font-medium" data-testid="totals-items">
            {values.items}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Available</div>
          <div className="font-medium" data-testid="totals-available">
            {values.available}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Reserved</div>
          <div className="font-medium" data-testid="totals-reserved">
            {values.reserved}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
