"use client";

import { AppHeader, PageContainer } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThemeToggle,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard" as const },
  { label: "Inventory", href: "/inventory" as const },
  { label: "Orders", href: "/orders" as const },
  { label: "Catalog", href: "/catalog" as const },
];

/**
 * Example composition showing how the core layout pieces work together
 * for the operations dashboard. In real usage, individual tabs would be
 * populated with live data visualizations.
 */
export function DashboardShell() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader navigation={navigationItems} />
      <PageContainer className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Operations overview
            </h1>
            <p className="text-muted-foreground">Monitor fulfillment health across every store.</p>
          </div>
          <ThemeToggle />
        </header>

        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="w-full justify-start overflow-auto">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="picking">Picking</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Order flow</CardTitle>
                <CardDescription>Real-time order velocity across channels.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Metric label="Open" value="32" trend="+12%" tone="info" />
                <Metric label="Picking" value="18" trend="-3%" tone="warning" />
                <Metric label="Ready to ship" value="11" trend="+7%" tone="success" />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle>Inventory health</CardTitle>
                <CardDescription>Highlights low stock and aging lots.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Metric label="Lots under min" value="24" trend="+5%" tone="destructive" />
                <Metric label="Aging SKUs" value="67" trend="+2%" tone="warning" />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="picking">
            <Card>
              <CardHeader>
                <CardTitle>Picking performance</CardTitle>
                <CardDescription>Track picker velocity and current sessions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Metric label="Active pickers" value="5" trend="+1" tone="info" />
                <Metric label="Avg pick time" value="3m 21s" trend="-12%" tone="success" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  trend: string;
  tone: "success" | "warning" | "info" | "destructive";
}

function Metric({ label, value, trend, tone }: MetricProps) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-subtle">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p
        className={cn(
          "text-sm font-medium",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "info" && "text-info",
          tone === "destructive" && "text-destructive",
        )}
      >
        {trend}
      </p>
    </div>
  );
}
