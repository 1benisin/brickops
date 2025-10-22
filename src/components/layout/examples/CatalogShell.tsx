"use client";

import { AppHeader, PageContainer } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard" as const },
  { label: "Inventory", href: "/inventory" as const },
  { label: "Orders", href: "/orders" as const },
  { label: "Catalog", href: "/catalog" as const },
];

const catalogRows = [
  { sku: "3001", name: "2x4 Brick", color: "Dark bluish gray", stock: 1200, reserved: 340 },
  { sku: "3023", name: "Plate 1x2", color: "Bright red", stock: 740, reserved: 120 },
  { sku: "3037", name: "Slope 45° 2x4", color: "Black", stock: 312, reserved: 80 },
];

/**
 * Demonstrates catalog browsing with filter/search controls and tabular
 * data, leveraging shadcn/ui primitives for consistency.
 */
export function CatalogShell() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader navigation={navigationItems} />
      <PageContainer className="space-y-6">
        <Card>
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Catalog search</CardTitle>
              <CardDescription>Filter by SKU, color, or part category.</CardDescription>
            </div>
            <Input
              type="search"
              placeholder="Search catalog…"
              className="w-full"
              aria-label="Search catalog"
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Part name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogRows.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.color}</TableCell>
                    <TableCell className="text-right font-medium">{row.stock}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.reserved}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
}
