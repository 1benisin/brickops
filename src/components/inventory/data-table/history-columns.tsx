"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

// Type for inventory history entry
export interface InventoryHistoryEntry {
  _id: string;
  itemId: string;
  action: "create" | "update" | "delete";
  timestamp: number;
  actorFirstName?: string;
  actorLastName?: string;
  actorEmail?: string;
  newData?: {
    partNumber?: string;
    colorId?: number;
    location?: string;
    quantityAvailable?: number;
    quantityReserved?: number;
  };
  oldData?: {
    partNumber?: string;
    colorId?: number;
    location?: string;
    quantityAvailable?: number;
    quantityReserved?: number;
  };
  reason?: string;
  source?: "user" | "bricklink" | "order";
  relatedOrderId?: string;
  stateType?: "new" | "old"; // Added to distinguish rows
}

// Helper to get actor display name
const getActorName = (firstName?: string, lastName?: string, email?: string): string => {
  if (firstName || lastName) {
    return `${firstName ?? ""} ${lastName ?? ""}`.trim();
  }
  return email || "Unknown user";
};

// Helper to format quantity with locale
const formatQuantity = (quantity?: number): string => {
  if (quantity === undefined) return "—";
  return quantity.toLocaleString();
};

// Helper to determine if a field changed and in which direction
const getFieldChangeType = (
  oldValue: string | number | undefined | null,
  newValue: string | number | undefined | null,
  isNumeric: boolean = false,
): "added" | "removed" | "increased" | "decreased" | "changed" | "unchanged" => {
  // Both undefined/null
  if (
    (oldValue === undefined || oldValue === null) &&
    (newValue === undefined || newValue === null)
  ) {
    return "unchanged";
  }

  // Was added (didn't exist before)
  if (oldValue === undefined || oldValue === null) {
    return "added";
  }

  // Was removed (doesn't exist now)
  if (newValue === undefined || newValue === null) {
    return "removed";
  }

  // Check if values are the same
  if (oldValue === newValue) {
    return "unchanged";
  }

  // Value changed - check if numeric
  if (isNumeric) {
    if ((newValue as number) > (oldValue as number)) return "increased";
    if ((newValue as number) < (oldValue as number)) return "decreased";
  }

  return "changed"; // non-numeric field changed
};

// Helper function to get cell background color based on change type and state
const getCellHighlightClass = (
  changeType: "added" | "removed" | "increased" | "decreased" | "changed" | "unchanged",
  stateType?: "new" | "old",
): string => {
  if (changeType === "unchanged") return "";

  // Highlight changes on the appropriate row type
  if (stateType === "new") {
    // Show green for added/increased on NEW STATE row
    if (changeType === "added" || changeType === "increased") {
      return "bg-green-200/50 dark:bg-green-800/40";
    }
    // Show blue for changed values on NEW STATE row
    if (changeType === "changed") {
      return "bg-blue-200/50 dark:bg-blue-800/40";
    }
  } else if (stateType === "old") {
    // Show red for removed/decreased on OLD STATE row
    if (changeType === "removed" || changeType === "decreased") {
      return "bg-red-200/50 dark:bg-red-800/40";
    }
  }

  return "";
};

export const createHistoryColumns = (): ColumnDef<InventoryHistoryEntry>[] => [
  {
    id: "stateLabel",
    meta: { label: "State" },
    header: "State",
    size: 90,
    minSize: 80,
    maxSize: 120,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const label = stateType === "new" ? "NEW STATE" : "OLD STATE";
      const colorClass =
        stateType === "new"
          ? "bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"
          : "bg-red-500/10 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700";
      return <Badge className={`font-semibold text-xs ${colorClass}`}>{label}</Badge>;
    },
  },
  {
    id: "timestamp",
    accessorKey: "timestamp",
    meta: { label: "When" },
    header: "When",
    size: 140,
    minSize: 120,
    maxSize: 200,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show timestamp on new state rows to avoid duplication
      if (stateType === "old") return null;
      return (
        <div className="text-sm font-medium">{formatRelativeTime(row.original.timestamp)}</div>
      );
    },
  },
  {
    id: "actor",
    meta: { label: "Actor" },
    header: "Actor",
    size: 150,
    minSize: 120,
    maxSize: 250,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show actor on new state rows
      if (stateType === "old") return null;
      const name = getActorName(row.original.actorFirstName, row.original.actorLastName);
      return <div className="text-sm">{name}</div>;
    },
  },
  {
    id: "action",
    accessorKey: "action",
    meta: { label: "Action" },
    header: "Action",
    size: 100,
    minSize: 80,
    maxSize: 150,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show action on new state rows
      if (stateType === "old") return null;
      const action = row.getValue("action") as string;
      const variants = {
        create:
          "bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400",
        update:
          "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
        delete: "bg-red-500/10 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
      };
      return (
        <Badge variant="outline" className={variants[action as keyof typeof variants]}>
          {action.toUpperCase()}
        </Badge>
      );
    },
  },
  {
    id: "itemId",
    meta: { label: "Item ID" },
    header: "Item ID",
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show on new state rows
      if (stateType === "old") return null;
      const itemId = String(row.original.itemId);
      return (
        <div className="font-mono text-sm truncate" title={itemId}>
          {itemId}
        </div>
      );
    },
  },
  {
    id: "partNumber",
    meta: { label: "Part Number" },
    header: "Part Number",
    size: 130,
    minSize: 100,
    maxSize: 220,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const oldValue = row.original.oldData?.partNumber;
      const newValue = row.original.newData?.partNumber;
      const changeType = getFieldChangeType(oldValue, newValue);
      const displayValue = stateType === "new" ? newValue : oldValue;
      const bgClass = getCellHighlightClass(changeType, stateType);

      return (
        <div className={`font-mono text-sm ${bgClass} px-2 py-1 rounded`}>
          {displayValue || "—"}
        </div>
      );
    },
  },
  {
    id: "colorId",
    meta: { label: "Color" },
    header: "Color",
    size: 100,
    minSize: 80,
    maxSize: 150,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const oldValue = row.original.oldData?.colorId;
      const newValue = row.original.newData?.colorId;
      const changeType = getFieldChangeType(oldValue, newValue);
      const displayValue = stateType === "new" ? newValue : oldValue;
      const bgClass = getCellHighlightClass(changeType, stateType);

      return (
        <div className={`font-mono text-sm ${bgClass} px-2 py-1 rounded`}>
          {displayValue !== undefined ? String(displayValue) : "—"}
        </div>
      );
    },
  },
  {
    id: "location",
    meta: { label: "Location" },
    header: "Location",
    size: 140,
    minSize: 100,
    maxSize: 250,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const oldValue = row.original.oldData?.location;
      const newValue = row.original.newData?.location;
      const changeType = getFieldChangeType(oldValue, newValue);
      const displayValue = stateType === "new" ? newValue : oldValue;
      const bgClass = getCellHighlightClass(changeType, stateType);

      return (
        <div
          className={`max-w-[140px] truncate text-sm ${bgClass} px-2 py-1 rounded`}
          title={displayValue || ""}
        >
          {displayValue || "—"}
        </div>
      );
    },
  },
  {
    id: "quantityAvailable",
    meta: { label: "Available" },
    header: () => <div className="text-right">Available</div>,
    size: 110,
    minSize: 90,
    maxSize: 160,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const oldValue = row.original.oldData?.quantityAvailable;
      const newValue = row.original.newData?.quantityAvailable;
      const changeType = getFieldChangeType(oldValue, newValue, true); // numeric comparison
      const displayValue = stateType === "new" ? newValue : oldValue;
      const bgClass = getCellHighlightClass(changeType, stateType);

      return (
        <div className={`text-right font-mono text-sm ${bgClass} px-2 py-1 rounded`}>
          {formatQuantity(displayValue)}
        </div>
      );
    },
  },
  {
    id: "quantityReserved",
    meta: { label: "Reserved" },
    header: () => <div className="text-right">Reserved</div>,
    size: 110,
    minSize: 90,
    maxSize: 160,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      const oldValue = row.original.oldData?.quantityReserved;
      const newValue = row.original.newData?.quantityReserved;
      const changeType = getFieldChangeType(oldValue, newValue, true); // numeric comparison
      const displayValue = stateType === "new" ? newValue : oldValue;
      const bgClass = getCellHighlightClass(changeType, stateType);
      const quantity = (displayValue as number) || 0;

      if (quantity === 0) {
        return <div className={`text-right text-sm ${bgClass} px-2 py-1 rounded`}>—</div>;
      }

      return (
        <div
          className={`text-right font-mono text-sm text-yellow-700 dark:text-yellow-400 ${bgClass} px-2 py-1 rounded`}
        >
          {formatQuantity(displayValue)}
        </div>
      );
    },
  },
  {
    id: "reason",
    meta: { label: "Reason" },
    header: "Reason",
    size: 200,
    minSize: 150,
    maxSize: 350,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show reason on new state rows
      if (stateType === "old") return null;
      const value = row.original.reason;
      return (
        <div className="max-w-[200px] truncate text-sm text-muted-foreground" title={value || ""}>
          {value || "—"}
        </div>
      );
    },
  },
  {
    id: "source",
    meta: { label: "Source" },
    header: "Source",
    size: 120,
    minSize: 100,
    maxSize: 180,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show source on new state rows
      if (stateType === "old") return null;
      const source = row.original.source;
      const variants: Record<string, string> = {
        user: "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
        bricklink:
          "bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400",
        order:
          "bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
      };
      return (
        <Badge variant="outline" className={variants[source as keyof typeof variants] || ""}>
          {source?.toUpperCase() || "—"}
        </Badge>
      );
    },
  },
  {
    id: "relatedOrderId",
    meta: { label: "Order ID" },
    header: "Order ID",
    size: 180,
    minSize: 150,
    maxSize: 280,
    enableSorting: false,
    cell: ({ row }) => {
      const stateType = row.original.stateType;
      // Only show on new state rows
      if (stateType === "old") return null;
      const orderId = row.original.relatedOrderId;
      return (
        <div className="font-mono text-sm truncate text-muted-foreground" title={orderId || ""}>
          {orderId || "—"}
        </div>
      );
    },
  },
];
