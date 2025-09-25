"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { TotalsCard } from "@/components/dashboard/totals-card";

export default function DashboardPage() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;
  const isLoading = currentUser === undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome to your shared BrickOps workspace. Use the navigation above to manage inventory,
          orders, and catalog data.
        </p>
      </header>

      <section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TotalsCard businessAccountId={businessAccountId} isLoading={isLoading} />
        </div>
      </section>
    </div>
  );
}
