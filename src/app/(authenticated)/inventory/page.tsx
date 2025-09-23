"use client";

import { useMemo, useState, useTransition } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export default function InventoryPage() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  const items = useQuery(
    api.functions.inventory.listInventoryItems,
    businessAccountId ? { businessAccountId } : "skip",
  );
  const totals = useQuery(
    api.functions.inventory.getInventoryTotals,
    businessAccountId ? { businessAccountId } : "skip",
  );

  const [auditItemId, setAuditItemId] = useState<Id<"inventoryItems"> | null>(null);
  const auditLogs = useQuery(
    api.functions.inventory.listInventoryAuditLogs,
    businessAccountId && auditItemId
      ? { businessAccountId, itemId: auditItemId, limit: 20 }
      : "skip",
  );

  const addInventoryItem = useMutation(api.functions.inventory.addInventoryItem);
  const deleteInventoryItem = useMutation(api.functions.inventory.deleteInventoryItem);

  const [isSubmitting, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    colorId: "",
    location: "",
    quantityAvailable: 0,
    quantityReserved: 0,
    quantitySold: 0,
    status: "available" as "available" | "reserved" | "sold",
    condition: "new" as "new" | "used",
  });

  const canSubmit = useMemo(() => {
    return (
      !!businessAccountId &&
      form.sku.trim() !== "" &&
      form.name.trim() !== "" &&
      form.colorId.trim() !== "" &&
      form.location.trim() !== "" &&
      form.quantityAvailable >= 0 &&
      form.quantityReserved >= 0 &&
      form.quantitySold >= 0
    );
  }, [businessAccountId, form]);

  const handleCreate = () => {
    if (!businessAccountId || !canSubmit) return;
    startTransition(async () => {
      await addInventoryItem({
        businessAccountId,
        ...form,
      });
      setDialogOpen(false);
      setForm({
        sku: "",
        name: "",
        colorId: "",
        location: "",
        quantityAvailable: 0,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
      });
    });
  };

  const handleDelete = (itemId: Id<"inventoryItems">) => {
    startTransition(async () => {
      await deleteInventoryItem({ itemId, reason: "user-request" });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <Input
                placeholder="SKU"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                placeholder="Color ID"
                value={form.colorId}
                onChange={(e) => setForm((f) => ({ ...f, colorId: e.target.value }))}
              />
              <Input
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Qty Available"
                value={form.quantityAvailable}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantityAvailable: Number(e.target.value) }))
                }
              />
              <Input
                type="number"
                placeholder="Qty Reserved"
                value={form.quantityReserved}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantityReserved: Number(e.target.value) }))
                }
              />
              <Input
                type="number"
                placeholder="Qty Sold"
                value={form.quantitySold}
                onChange={(e) => setForm((f) => ({ ...f, quantitySold: Number(e.target.value) }))}
              />
              <Input
                placeholder="Status (available/reserved/sold)"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as "available" | "reserved" | "sold",
                  }))
                }
              />
              <Input
                placeholder="Condition (new/used)"
                value={form.condition}
                onChange={(e) =>
                  setForm((f) => ({ ...f, condition: e.target.value as "new" | "used" }))
                }
              />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Avail</TableHead>
                <TableHead className="text-right">Resv</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.sku}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.colorId}</TableCell>
                  <TableCell>{item.location}</TableCell>
                  <TableCell className="text-right">{item.quantityAvailable}</TableCell>
                  <TableCell className="text-right">{item.quantityReserved ?? 0}</TableCell>
                  <TableCell className="text-right">{item.quantitySold ?? 0}</TableCell>
                  <TableCell>{item.status ?? "available"}</TableCell>
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
