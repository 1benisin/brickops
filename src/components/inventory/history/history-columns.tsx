"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime, bestTextOn } from "@/lib/utils";
import { useGetPartColors } from "@/hooks/useGetPartColors";

// Type for unified history entry
export interface UnifiedHistoryEntry {
  _id: string;
  changeType: "quantity" | "location";
  timestamp: number;
  userId?: string;
  itemId: string;
  reason: string;
  source: "user" | "bricklink" | "brickowl";
  correlationId?: string;
  // Quantity-specific fields
  deltaAvailable?: number;
  preAvailable?: number;
  postAvailable?: number;
  seq?: number;
  orderId?: string;
  // Location-specific fields
  fromLocation?: string;
  toLocation?: string;
  // Enriched fields
  item: {
    _id: string;
    partNumber: string;
    name: string;
    colorId: string;
    location: string;
    condition: "new" | "used";
    price?: number;
    quantityAvailable: number;
    quantityReserved?: number;
  };
  partName?: string;
  actor?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

// Helper function to format currency
const formatCurrency = (amount: number | undefined) => {
  if (amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

// Helper function to format quantity
const formatQuantity = (quantity: number | undefined) => {
  if (quantity === undefined) return "—";
  return quantity.toLocaleString();
};

// Helper to get actor display name
const getActorName = (actor?: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): string => {
  if (!actor) return "Unknown";
  if (actor.firstName || actor.lastName) {
    return `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim();
  }
  return actor.email || "Unknown";
};

// Condition badge component
const ConditionBadge = ({ condition }: { condition: "new" | "used" }) => {
  const variants = {
    new: "bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700",
    used: "bg-gray-500/10 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-700",
  };

  return (
    <Badge variant="outline" className={variants[condition]}>
      {condition.charAt(0).toUpperCase() + condition.slice(1)}
    </Badge>
  );
};

// Color badge component
const PartColorBadge = ({ partNumber, colorId }: { partNumber: string; colorId: string }) => {
  const { data: colors } = useGetPartColors(partNumber);

  const selectedColor = colors?.find((c) => String(c.colorId) === colorId);
  if (!selectedColor) {
    return <span className="text-muted-foreground text-sm">{colorId}</span>;
  }

  const bgColor = `#${selectedColor.hexCode || "ffffff"}`;
  const { color: textColor } = bestTextOn(bgColor);

  return (
    <div
      className="inline-flex items-center rounded px-2 py-1 text-sm font-medium"
      style={{
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      {selectedColor.name || `Color ${colorId}`}
    </div>
  );
};

export const createHistoryColumns = (): ColumnDef<UnifiedHistoryEntry>[] => [
  {
    id: "changeType",
    accessorKey: "changeType",
    meta: { label: "Change Type" },
    header: "Type",
    size: 110,
    minSize: 90,
    maxSize: 150,
    cell: ({ row }) => {
      const changeType = row.getValue("changeType") as "quantity" | "location";
      const variants = {
        quantity:
          "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700",
        location:
          "bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-700",
      };
      return (
        <Badge variant="outline" className={variants[changeType]}>
          {changeType.toUpperCase()}
        </Badge>
      );
    },
  },
  {
    id: "timestamp",
    accessorKey: "timestamp",
    meta: { label: "Timestamp" },
    header: "When",
    size: 140,
    minSize: 120,
    maxSize: 200,
    cell: ({ row }) => {
      const timestamp = row.getValue("timestamp") as number;
      return <div className="text-sm font-medium">{formatRelativeTime(timestamp)}</div>;
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
      const actor = row.original.actor;
      return <div className="text-sm">{getActorName(actor)}</div>;
    },
  },
  {
    id: "partNumber",
    meta: { label: "Part Number" },
    header: "Part Number",
    size: 130,
    minSize: 100,
    maxSize: 220,
    cell: ({ row }) => {
      const partNumber = row.original.item.partNumber;
      return <div className="font-mono text-sm">{partNumber}</div>;
    },
  },
  {
    id: "partName",
    meta: { label: "Part Name" },
    header: "Part Name",
    size: 200,
    minSize: 150,
    maxSize: 350,
    cell: ({ row }) => {
      const partName = row.original.partName || row.original.item.name;
      return (
        <div className="max-w-[200px] truncate text-sm" title={partName}>
          {partName || "—"}
        </div>
      );
    },
  },
  {
    id: "color",
    meta: { label: "Color" },
    header: "Color",
    size: 120,
    minSize: 100,
    maxSize: 200,
    cell: ({ row }) => {
      const item = row.original.item;
      return <PartColorBadge partNumber={item.partNumber} colorId={item.colorId} />;
    },
  },
  {
    id: "location",
    meta: { label: "Location" },
    header: "Location",
    size: 160,
    minSize: 120,
    maxSize: 300,
    cell: ({ row }) => {
      const entry = row.original;
      if (entry.changeType === "location") {
        const from = entry.fromLocation || "—";
        const to = entry.toLocation;
        return (
          <div className="text-sm">
            <span className="text-muted-foreground">{from}</span>
            <span className="mx-2">→</span>
            <span className="font-medium">{to}</span>
          </div>
        );
      }
      return (
        <div className="max-w-[140px] truncate text-sm" title={entry.item.location}>
          {entry.item.location}
        </div>
      );
    },
  },
  {
    id: "condition",
    meta: { label: "Condition" },
    header: "Condition",
    size: 100,
    minSize: 80,
    maxSize: 150,
    cell: ({ row }) => {
      return <ConditionBadge condition={row.original.item.condition} />;
    },
  },
  {
    id: "price",
    meta: { label: "Price" },
    header: () => <div className="text-right">Price</div>,
    size: 100,
    minSize: 90,
    maxSize: 150,
    cell: ({ row }) => {
      const price = row.original.item.price;
      return <div className="text-right font-mono text-sm">{formatCurrency(price)}</div>;
    },
  },
  {
    id: "quantityAfterChange",
    meta: { label: "Quantity After Change" },
    header: () => <div className="text-right">Qty After</div>,
    size: 110,
    minSize: 90,
    maxSize: 150,
    cell: ({ row }) => {
      const entry = row.original;
      if (entry.changeType === "quantity") {
        return (
          <div className="text-right font-mono text-sm font-medium">
            {formatQuantity(entry.postAvailable)}
          </div>
        );
      }
      // For location changes, show current quantity
      return (
        <div className="text-right font-mono text-sm text-muted-foreground">
          {formatQuantity(entry.item.quantityAvailable)}
        </div>
      );
    },
  },
  {
    id: "delta",
    meta: { label: "Delta" },
    header: () => <div className="text-right">Delta</div>,
    size: 90,
    minSize: 70,
    maxSize: 120,
    cell: ({ row }) => {
      const entry = row.original;
      if (entry.changeType !== "quantity" || entry.deltaAvailable === undefined) {
        return <div className="text-right text-sm text-muted-foreground">—</div>;
      }
      const delta = entry.deltaAvailable;
      const isPositive = delta > 0;
      const isNegative = delta < 0;
      const className = isPositive
        ? "text-green-700 dark:text-green-400"
        : isNegative
          ? "text-red-700 dark:text-red-400"
          : "text-muted-foreground";
      return (
        <div className={`text-right font-mono text-sm font-medium ${className}`}>
          {delta > 0 ? "+" : ""}
          {formatQuantity(delta)}
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
    cell: ({ row }) => {
      const reason = row.original.reason;
      return (
        <div className="max-w-[200px] truncate text-sm text-muted-foreground" title={reason}>
          {reason || "—"}
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
    cell: ({ row }) => {
      const source = row.original.source;
      const variants: Record<string, string> = {
        user: "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700",
        bricklink:
          "bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-700",
        brickowl:
          "bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700",
      };
      return (
        <Badge variant="outline" className={variants[source] || ""}>
          {source?.toUpperCase() || "—"}
        </Badge>
      );
    },
  },
];
