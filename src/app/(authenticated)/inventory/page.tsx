"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ArrowUpDown } from "lucide-react";
import { FileSelector } from "@/components/inventory/FileSelector";
import { SyncStatusIndicator } from "@/components/inventory/SyncStatusIndicator";
import { AddInventoryItemButton } from "@/components/inventory/AddInventoryItemButton";

type SortDirection = "asc" | "desc";

export default function InventoryPage() {
  const router = useRouter();
  const currentUser = useQuery(api.users.queries.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  const items = useQuery(
    api.inventory.queries.listInventoryItems,
    businessAccountId ? { businessAccountId } : "skip",
  );
  const totals = useQuery(
    api.inventory.queries.getInventoryTotals,
    businessAccountId ? { businessAccountId } : "skip",
  );
  const syncSettings = useQuery(api.marketplace.mutations.getSyncSettings);

  const [auditItemId, setAuditItemId] = useState<Id<"inventoryItems"> | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<Id<"inventoryFiles"> | "none">("none");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const auditLogs = useQuery(
    api.inventory.queries.listInventoryHistory,
    businessAccountId && auditItemId
      ? { businessAccountId, itemId: auditItemId, limit: 20 }
      : "skip",
  );

  // Sort items by date created
  const sortedItems = useMemo(() => {
    if (!items) return [];

    const sorted = [...items].sort((a, b) => {
      const comparison = a.createdAt - b.createdAt;
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [items, sortDirection]);

  const toggleSort = () => {
    setSortDirection(sortDirection === "asc" ? "desc" : "asc");
  };

  const deleteInventoryItem = useMutation(api.inventory.mutations.deleteInventoryItem);

  const handleFileSelect = (value: Id<"inventoryFiles"> | "none" | undefined) => {
    if (!value || value === "none") {
      setSelectedFileId("none");
      return;
    }

    setSelectedFileId(value);
    router.push(`/inventory/files/${encodeURIComponent(value as unknown as string)}`);
  };

  const handleDelete = async (itemId: Id<"inventoryItems">) => {
    await deleteInventoryItem({ itemId, reason: "user-request" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <AddInventoryItemButton />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Totals</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div>Items: {totals?.counts.items ?? 0}</div>
            <div>Available: {totals?.totals.available ?? 0}</div>
            <div>Reserved: {totals?.totals.reserved ?? 0}</div>
            <div>Sold: {totals?.totals.sold ?? 0}</div>
          </CardContent>
        </Card>
        {businessAccountId && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Inventory Files</CardTitle>
              <CardDescription>
                Jump into file-based batches for marketplace syncing or create a new file.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileSelector
                value={selectedFileId}
                onChange={handleFileSelect}
                label="Select an inventory file"
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => router.push("/inventory/files")}>
                  Manage Files
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Avail</TableHead>
                <TableHead className="text-right">Resv</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Sync Status</TableHead>
                <TableHead className="cursor-pointer" onClick={toggleSort}>
                  <div className="flex items-center gap-2">
                    Date Created
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sortedItems ?? []).map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.partNumber}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.colorId}</TableCell>
                  <TableCell>{item.location}</TableCell>
                  <TableCell className="text-right">{item.quantityAvailable}</TableCell>
                  <TableCell className="text-right">{item.quantityReserved ?? 0}</TableCell>
                  <TableCell className="text-right">{item.quantitySold ?? 0}</TableCell>
                  <TableCell>{item.status ?? "available"}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <SyncStatusIndicator
                        item={item}
                        marketplace="bricklink"
                        syncEnabled={
                          syncSettings?.find((s) => s.provider === "bricklink")?.syncEnabled ?? true
                        }
                      />
                      <SyncStatusIndicator
                        item={item}
                        marketplace="brickowl"
                        syncEnabled={
                          syncSettings?.find((s) => s.provider === "brickowl")?.syncEnabled ?? true
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAuditItemId(item._id)}
                          >
                            History
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Audit History - {item.name}</SheetTitle>
                          </SheetHeader>
                          <div className="mt-4 space-y-3">
                            {(auditLogs ?? []).map((log) => (
                              <div key={log._id} className="border-b pb-2">
                                <div className="text-sm font-medium">{log.changeType}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleString()}
                                </div>
                                {log.deltaAvailable && (
                                  <div className="text-xs">
                                    Available: {log.deltaAvailable > 0 ? "+" : ""}
                                    {log.deltaAvailable}
                                  </div>
                                )}
                                {log.deltaReserved && (
                                  <div className="text-xs">
                                    Reserved: {log.deltaReserved > 0 ? "+" : ""}
                                    {log.deltaReserved}
                                  </div>
                                )}
                                {log.deltaSold && (
                                  <div className="text-xs">
                                    Sold: {log.deltaSold > 0 ? "+" : ""}
                                    {log.deltaSold}
                                  </div>
                                )}
                                {log.reason && (
                                  <div className="text-xs text-muted-foreground">
                                    Reason: {log.reason}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </SheetContent>
                      </Sheet>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
