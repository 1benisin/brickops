"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SyncStatusIndicator } from "@/components/inventory/SyncStatusIndicator";
import type { Infer } from "convex/values";
import type { listInventoryItemsReturns } from "@/convex/inventory/validators";
import { formatRelativeTime } from "@/lib/utils";

// Type for inventory item based on the Convex validator
export type InventoryItem = Infer<typeof listInventoryItemsReturns>[0];

// Type for marketplace sync configuration
export type MarketplaceSyncConfig = {
  showBricklinkSync: boolean;
  showBrickowlSync: boolean;
};

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

// Status badge component
const StatusBadge = ({ status }: { status: InventoryItem["status"] }) => {
  const variants = {
    available: "bg-green-500/10 text-green-700 border-green-200",
    reserved: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    sold: "bg-gray-500/10 text-gray-700 border-gray-200",
  };

  return (
    <Badge variant="outline" className={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

// Condition badge component
const ConditionBadge = ({ condition }: { condition: InventoryItem["condition"] }) => {
  const variants = {
    new: "bg-green-500/10 text-green-700 border-green-200",
    used: "bg-gray-500/10 text-gray-700 border-gray-200",
  };

  return (
    <Badge variant="outline" className={variants[condition]}>
      {condition.charAt(0).toUpperCase() + condition.slice(1)}
    </Badge>
  );
};

export const createColumns = (syncConfig: MarketplaceSyncConfig): ColumnDef<InventoryItem>[] => {
  const baseColumns: ColumnDef<InventoryItem>[] = [
    // Selection column
    {
      id: "select",
      meta: { label: "Select" },
      size: 40,
      minSize: 40,
      maxSize: 40,
      enableResizing: false,
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    // Part Number column
    {
      id: "partNumber",
      accessorKey: "partNumber",
      meta: { label: "Part Number" },
      header: "Part Number",
      size: 120,
      minSize: 80,
      maxSize: 300,
      cell: ({ row }) => <div className="font-medium font-mono">{row.getValue("partNumber")}</div>,
    },
    // Name column
    {
      id: "name",
      accessorKey: "name",
      meta: { label: "Name" },
      header: "Name",
      size: 200,
      minSize: 100,
      maxSize: 400,
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate" title={row.getValue("name")}>
          {row.getValue("name")}
        </div>
      ),
    },
    // Color ID column
    {
      id: "colorId",
      accessorKey: "colorId",
      meta: { label: "Color" },
      header: "Color",
      size: 100,
      minSize: 60,
      maxSize: 200,
      cell: ({ row }) => <div className="font-mono text-sm">{row.getValue("colorId")}</div>,
    },
    // Location column
    {
      id: "location",
      accessorKey: "location",
      meta: { label: "Location" },
      header: "Location",
      size: 120,
      minSize: 80,
      maxSize: 250,
      cell: ({ row }) => (
        <div className="max-w-[120px] truncate" title={row.getValue("location")}>
          {row.getValue("location")}
        </div>
      ),
    },
    // Condition column
    {
      id: "condition",
      accessorKey: "condition",
      meta: { label: "Condition" },
      header: "Condition",
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => <ConditionBadge condition={row.getValue("condition")} />,
    },
    // Available Quantity column
    {
      id: "quantityAvailable",
      accessorKey: "quantityAvailable",
      meta: { label: "Available" },
      header: () => <div className="text-right">Available</div>,
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => {
        const quantity = row.getValue("quantityAvailable") as number;
        return <div className="text-right font-mono font-medium">{quantity.toLocaleString()}</div>;
      },
    },
    // Date Created column
    {
      id: "createdAt",
      accessorKey: "createdAt",
      meta: { label: "Date Created" },
      header: "Date Created",
      size: 150,
      minSize: 100,
      maxSize: 250,
      cell: ({ row }) => {
        const timestamp = row.getValue("createdAt") as number;
        return <div className="text-sm text-muted-foreground">{formatRelativeTime(timestamp)}</div>;
      },
    },
    // Reserved Quantity column (only show if > 0)
    {
      id: "quantityReserved",
      accessorKey: "quantityReserved",
      meta: { label: "Reserved" },
      header: () => <div className="text-right">Reserved</div>,
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => {
        const quantity = (row.getValue("quantityReserved") as number) || 0;
        if (quantity === 0) return null;
        return (
          <div className="text-right font-mono text-yellow-700">{quantity.toLocaleString()}</div>
        );
      },
    },
    // Status column
    {
      id: "status",
      accessorKey: "status",
      meta: { label: "Status" },
      header: "Status",
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    // Unit Price column (only show if set)
    {
      id: "price",
      accessorKey: "price",
      meta: { label: "Unit Price" },
      header: () => <div className="text-right">Unit Price</div>,
      size: 120,
      minSize: 90,
      maxSize: 180,
      cell: ({ row }) => {
        const price = row.getValue("price") as number | undefined;
        if (!price) return null;
        return <div className="text-right font-mono font-medium">{formatCurrency(price)}</div>;
      },
    },
    // Total Price column (unit price × quantity available)
    {
      id: "totalPrice",
      meta: { label: "Total Price" },
      header: () => <div className="text-right">Total Price</div>,
      size: 130,
      minSize: 100,
      maxSize: 200,
      cell: ({ row }) => {
        const price = row.getValue("price") as number | undefined;
        const quantity = row.getValue("quantityAvailable") as number;
        if (!price) return null;
        const total = price * quantity;
        return <div className="text-right font-mono font-semibold">{formatCurrency(total)}</div>;
      },
    },
    // Last Updated column
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      meta: { label: "Last Updated" },
      header: "Last Updated",
      size: 150,
      minSize: 100,
      maxSize: 250,
      cell: ({ row }) => {
        const updatedAt = row.getValue("updatedAt") as number | undefined;
        const createdAt = row.original.createdAt;
        const timestamp = updatedAt || createdAt;
        return <div className="text-sm text-muted-foreground">{formatRelativeTime(timestamp)}</div>;
      },
    },
  ];

  // Conditionally add sync status columns based on marketplace configuration
  const syncColumns: ColumnDef<InventoryItem>[] = [];

  if (syncConfig.showBricklinkSync) {
    syncColumns.push({
      id: "bricklinkSyncStatus",
      header: "BrickLink Sync",
      size: 130,
      minSize: 100,
      maxSize: 200,
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <SyncStatusIndicator
            item={{
              bricklinkSyncStatus: item.bricklinkSyncStatus,
              brickowlSyncStatus: item.brickowlSyncStatus,
              bricklinkSyncError: item.bricklinkSyncError,
              brickowlSyncError: item.brickowlSyncError,
            }}
            marketplace="bricklink"
          />
        );
      },
    });
  }

  if (syncConfig.showBrickowlSync) {
    syncColumns.push({
      id: "brickowlSyncStatus",
      header: "BrickOwl Sync",
      size: 130,
      minSize: 100,
      maxSize: 200,
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <SyncStatusIndicator
            item={{
              bricklinkSyncStatus: item.bricklinkSyncStatus,
              brickowlSyncStatus: item.brickowlSyncStatus,
              bricklinkSyncError: item.bricklinkSyncError,
              brickowlSyncError: item.brickowlSyncError,
            }}
            marketplace="brickowl"
          />
        );
      },
    });
  }

  // Actions column (always at the end)
  const actionsColumn: ColumnDef<InventoryItem> = {
    id: "actions",
    size: 60,
    minSize: 60,
    maxSize: 60,
    enableResizing: false,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const item = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(item.partNumber)}>
              Copy part number
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View details</DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sync to BrickLink</DropdownMenuItem>
            <DropdownMenuItem>Sync to BrickOwl</DropdownMenuItem>
            <DropdownMenuItem>View history</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  };

  // Combine all columns: base + sync columns + actions
  return [...baseColumns, ...syncColumns, actionsColumn];
};
