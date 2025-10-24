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

export const columns: ColumnDef<InventoryItem>[] = [
  // Selection column
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
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
    enableSorting: false,
    enableHiding: false,
  },
  // Part Number column
  {
    accessorKey: "partNumber",
    header: "Part Number",
    cell: ({ row }) => <div className="font-medium font-mono">{row.getValue("partNumber")}</div>,
  },
  // Name column
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate" title={row.getValue("name")}>
        {row.getValue("name")}
      </div>
    ),
  },
  // Color ID column
  {
    accessorKey: "colorId",
    header: "Color",
    cell: ({ row }) => <div className="font-mono text-sm">{row.getValue("colorId")}</div>,
  },
  // Location column
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => (
      <div className="max-w-[120px] truncate" title={row.getValue("location")}>
        {row.getValue("location")}
      </div>
    ),
  },
  // Condition column
  {
    accessorKey: "condition",
    header: "Condition",
    cell: ({ row }) => <ConditionBadge condition={row.getValue("condition")} />,
  },
  // Available Quantity column
  {
    accessorKey: "quantityAvailable",
    header: () => <div className="text-right">Available</div>,
    cell: ({ row }) => {
      const quantity = row.getValue("quantityAvailable") as number;
      return <div className="text-right font-mono font-medium">{quantity.toLocaleString()}</div>;
    },
  },
  // Date Created column
  {
    accessorKey: "createdAt",
    header: "Date Created",
    cell: ({ row }) => {
      const timestamp = row.getValue("createdAt") as number;
      return <div className="text-sm text-muted-foreground">{formatRelativeTime(timestamp)}</div>;
    },
  },
  // Reserved Quantity column (only show if > 0)
  {
    accessorKey: "quantityReserved",
    header: () => <div className="text-right">Reserved</div>,
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
  },
  // Sync Status column
  {
    id: "syncStatus",
    header: "Sync Status",
    cell: ({ row }) => {
      const item = row.original;
      return (
        <div className="flex items-center gap-2">
          <SyncStatusIndicator
            item={{
              bricklinkSyncStatus: item.bricklinkSyncStatus,
              brickowlSyncStatus: item.brickowlSyncStatus,
              bricklinkSyncError: item.bricklinkSyncError,
              brickowlSyncError: item.brickowlSyncError,
            }}
            marketplace="bricklink"
          />
          <SyncStatusIndicator
            item={{
              bricklinkSyncStatus: item.bricklinkSyncStatus,
              brickowlSyncStatus: item.brickowlSyncStatus,
              bricklinkSyncError: item.bricklinkSyncError,
              brickowlSyncError: item.brickowlSyncError,
            }}
            marketplace="brickowl"
          />
        </div>
      );
    },
    enableSorting: false,
  },
  // Price column (only show if set)
  {
    accessorKey: "price",
    header: () => <div className="text-right">Price</div>,
    cell: ({ row }) => {
      const price = row.getValue("price") as number | undefined;
      if (!price) return null;
      return <div className="text-right font-mono font-medium">{formatCurrency(price)}</div>;
    },
  },
  // Last Updated column
  {
    accessorKey: "updatedAt",
    header: "Last Updated",
    cell: ({ row }) => {
      const updatedAt = row.getValue("updatedAt") as number | undefined;
      const createdAt = row.original.createdAt;
      const timestamp = updatedAt || createdAt;
      return <div className="text-sm text-muted-foreground">{formatRelativeTime(timestamp)}</div>;
    },
  },
  // Actions column
  {
    id: "actions",
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
    enableSorting: false,
    enableHiding: false,
  },
];
