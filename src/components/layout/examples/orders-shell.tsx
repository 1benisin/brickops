"use client";

import { AppHeader, PageContainer } from "@/components/layout";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard" as const },
  { label: "Inventory", href: "/inventory" as const },
  { label: "Orders", href: "/orders" as const },
  { label: "Catalog", href: "/catalog" as const },
];

const orderRows = [
  { id: "BO-1043", customer: "BrickLink #44210", items: 18, status: "Picking", sla: "2h" },
  { id: "BO-1041", customer: "BrickOwl #39877", items: 9, status: "Ready to ship", sla: "35m" },
  { id: "BO-1039", customer: "BrickLink #44102", items: 27, status: "Packed", sla: "On time" },
];

/**
 * Example order management view with prioritized queues surfaced through
 * tabs and actionable tables.
 */
export function OrdersShell() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader navigation={navigationItems} />
      <PageContainer className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Orders</h1>
            <p className="text-muted-foreground">
              Track marketplace orders, picking progress, and fulfillment status.
            </p>
          </div>
          <Button variant="default">Start pick session</Button>
        </header>

        <Tabs defaultValue="priority" className="w-full">
          <TabsList className="w-full justify-start overflow-auto">
            <TabsTrigger value="priority">Priority queue</TabsTrigger>
            <TabsTrigger value="recent">Recently updated</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
          </TabsList>
          <TabsContent value="priority">
            <Card>
              <CardHeader>
                <CardTitle>Priority orders</CardTitle>
                <CardDescription>Orders breaching SLA are surfaced automatically.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Line items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.id}</TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell className="text-right">{row.items}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right">{row.sla}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="recent">
            <Card>
              <CardHeader>
                <CardTitle>Recent updates</CardTitle>
                <CardDescription>
                  Most recent status changes across all marketplaces.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Integrate Convex functions to fetch live status deltas here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="issues">
            <Card>
              <CardHeader>
                <CardTitle>Issues</CardTitle>
                <CardDescription>Automatically generated picking blockers.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Surface issue tickets from the picking workflow store.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}
