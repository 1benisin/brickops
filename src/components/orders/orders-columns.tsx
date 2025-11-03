"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  createColumn,
  type EnhancedColumnMeta,
} from "@/components/ui/data-table/column-definitions";
import {
  manualNumberRangeFilter,
  manualDateRangeFilter,
} from "@/components/ui/data-table/utils/filter-state";
import { formatRelativeTime } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

const createOrderColumn = <TValue = unknown,>(
  config: ColumnDef<Order, TValue> & { meta?: EnhancedColumnMeta<Order, TValue> },
) => createColumn<Order, TValue>(config);

// Type definition for Order from Convex schema
export type Order = Doc<"bricklinkOrders">;

// Helper function to format currency
const formatCurrency = (amount: number, currencyCode: string = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, string> = {
    PENDING: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    READY: "bg-blue-500/10 text-blue-700 border-blue-200",
    COMPLETED: "bg-green-500/10 text-green-700 border-green-200",
    UPDATED: "bg-purple-500/10 text-purple-700 border-purple-200",
    PAID: "bg-green-500/10 text-green-700 border-green-200",
    SHIPPED: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
    RECEIVED: "bg-teal-500/10 text-teal-700 border-teal-200",
    CANCELLED: "bg-red-500/10 text-red-700 border-red-200",
    PURGED: "bg-gray-500/10 text-gray-700 border-gray-200",
  };

  const variantClass = variants[status] || "bg-gray-500/10 text-gray-700 border-gray-200";

  return (
    <Badge variant="outline" className={variantClass}>
      {status}
    </Badge>
  );
};

// Payment status badge component
const PaymentStatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;

  const variants: Record<string, string> = {
    Sent: "bg-blue-500/10 text-blue-700 border-blue-200",
    Received: "bg-green-500/10 text-green-700 border-green-200",
    Cleared: "bg-green-500/10 text-green-700 border-green-200",
    Bounced: "bg-red-500/10 text-red-700 border-red-200",
    Returned: "bg-orange-500/10 text-orange-700 border-orange-200",
  };

  const variantClass = variants[status] || "bg-gray-500/10 text-gray-700 border-gray-200";

  return (
    <Badge variant="outline" className={variantClass}>
      {status}
    </Badge>
  );
};

export const createOrdersColumns = (): ColumnDef<Order>[] => {
  return [
    // Order ID column
    createOrderColumn({
      id: "orderId",
      accessorKey: "orderId",
      meta: {
        label: "Order ID",
        filterType: "text",
        filterPlaceholder: "Search order IDs...",
        textFilterMode: "contains",
      },
      header: "Order ID",
      enableSorting: true,
      enableColumnFilter: true,
      size: 150,
      minSize: 100,
      maxSize: 250,
      cell: ({ row }) => <div className="font-medium font-mono">{row.getValue("orderId")}</div>,
    }),
    // Date Ordered column
    createOrderColumn({
      id: "dateOrdered",
      accessorKey: "dateOrdered",
      meta: {
        label: "Date Ordered",
        filterType: "date",
      },
      filterFn: manualDateRangeFilter<Order>(),
      header: "Date Ordered",
      enableSorting: true,
      enableColumnFilter: true,
      size: 150,
      minSize: 120,
      maxSize: 250,
      cell: ({ row }) => {
        const timestamp = row.getValue("dateOrdered") as number;
        return <div className="text-sm">{formatRelativeTime(timestamp)}</div>;
      },
    }),
    // Buyer Name column
    createOrderColumn({
      id: "buyerName",
      accessorKey: "buyerName",
      meta: {
        label: "Buyer",
        filterType: "text",
        filterPlaceholder: "Search buyers...",
        textFilterMode: "contains",
      },
      header: "Buyer",
      enableSorting: true,
      enableColumnFilter: true,
      size: 180,
      minSize: 120,
      maxSize: 300,
      cell: ({ row }) => (
        <div className="w-full truncate" title={row.getValue("buyerName")}>
          {row.getValue("buyerName")}
        </div>
      ),
    }),
    // Status column
    createOrderColumn({
      id: "status",
      accessorKey: "status",
      meta: {
        label: "Status",
        filterType: "select",
        filterOptions: [
          { label: "Pending", value: "PENDING" },
          { label: "Ready", value: "READY" },
          { label: "Completed", value: "COMPLETED" },
          { label: "Shipped", value: "SHIPPED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      header: "Status",
      enableSorting: true,
      enableColumnFilter: true,
      size: 120,
      minSize: 100,
      maxSize: 180,
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    }),
    // Total Count column
    createOrderColumn({
      id: "totalCount",
      accessorKey: "totalCount",
      meta: {
        label: "Items",
        filterType: "number",
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Items</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => {
        const count = row.getValue("totalCount") as number;
        return <div className="text-right font-mono font-medium">{count.toLocaleString()}</div>;
      },
    }),
    // Lot Count column
    createOrderColumn({
      id: "lotCount",
      accessorFn: (row) => {
        // Handle migration: fallback to uniqueCount if lotCount doesn't exist yet
        return (row.lotCount ?? (row as { uniqueCount?: number }).uniqueCount ?? 0) as number;
      },
      meta: {
        label: "Lot Count",
        filterType: "number",
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Lots</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => {
        const count = row.getValue("lotCount") as number;
        return <div className="text-right font-mono">{count.toLocaleString()}</div>;
      },
    }),
    // Price per Lot column
    createOrderColumn({
      id: "pricePerLot",
      accessorFn: (row) => {
        const subtotal = row.costSubtotal ?? 0;
        const lotCount = row.lotCount ?? (row as { uniqueCount?: number }).uniqueCount ?? 0;
        return lotCount > 0 ? subtotal / lotCount : 0;
      },
      meta: {
        label: "Price per Lot",
        filterType: "number",
        filterConfig: {
          currency: true,
          step: 0.01,
        },
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Price/Lot</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 110,
      minSize: 90,
      maxSize: 150,
      cell: ({ row }) => {
        const order = row.original;
        const subtotal = order.costSubtotal ?? 0;
        const lotCount = order.lotCount ?? (order as { uniqueCount?: number }).uniqueCount ?? 0;
        const pricePerLot = lotCount > 0 ? subtotal / lotCount : 0;
        const currencyCode = order.costCurrencyCode || "USD";
        return (
          <div className="text-right text-sm font-mono">
            {formatCurrency(pricePerLot, currencyCode)}
          </div>
        );
      },
    }),
    // Price per Part column
    createOrderColumn({
      id: "pricePerPart",
      accessorFn: (row) => {
        const subtotal = row.costSubtotal ?? 0;
        const totalCount = row.totalCount ?? 0;
        return totalCount > 0 ? subtotal / totalCount : 0;
      },
      meta: {
        label: "Price per Part",
        filterType: "number",
        filterConfig: {
          currency: true,
          step: 0.01,
        },
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Price/Part</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 110,
      minSize: 90,
      maxSize: 150,
      cell: ({ row }) => {
        const order = row.original;
        const subtotal = order.costSubtotal ?? 0;
        const totalCount = order.totalCount ?? 0;
        const pricePerPart = totalCount > 0 ? subtotal / totalCount : 0;
        const currencyCode = order.costCurrencyCode || "USD";
        return (
          <div className="text-right text-sm font-mono">
            {formatCurrency(pricePerPart, currencyCode)}
          </div>
        );
      },
    }),
    // Grand Total column
    createOrderColumn({
      id: "costGrandTotal",
      accessorFn: (row) => row.costGrandTotal,
      meta: {
        label: "Grand Total",
        filterType: "number",
        filterConfig: {
          currency: true,
          step: 0.01,
        },
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Grand Total</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 130,
      minSize: 100,
      maxSize: 180,
      cell: ({ row }) => {
        const order = row.original;
        const amount = order.costGrandTotal;
        const currencyCode = order.costCurrencyCode || "USD";
        return <div className="text-right font-medium">{formatCurrency(amount, currencyCode)}</div>;
      },
    }),
    // Payment Status column
    createOrderColumn({
      id: "paymentStatus",
      accessorKey: "paymentStatus",
      meta: {
        label: "Payment Status",
        filterType: "select",
        filterOptions: [
          { label: "Sent", value: "Sent" },
          { label: "Received", value: "Received" },
          { label: "Cleared", value: "Cleared" },
          { label: "Bounced", value: "Bounced" },
        ],
      },
      header: "Payment Status",
      enableSorting: true,
      enableColumnFilter: true,
      size: 140,
      minSize: 120,
      maxSize: 200,
      cell: ({ row }) => <PaymentStatusBadge status={row.getValue("paymentStatus")} />,
    }),
    // Payment Method column
    createOrderColumn({
      id: "paymentMethod",
      accessorKey: "paymentMethod",
      meta: {
        label: "Payment Method",
        filterType: "text",
        filterPlaceholder: "Search payment methods...",
        textFilterMode: "contains",
      },
      header: "Payment Method",
      enableSorting: true,
      enableColumnFilter: true,
      size: 150,
      minSize: 120,
      maxSize: 250,
      cell: ({ row }) => {
        const method = row.getValue("paymentMethod") as string | undefined;
        if (!method) return null;
        return (
          <div className="w-full truncate text-sm text-muted-foreground" title={method}>
            {method}
          </div>
        );
      },
    }),
    // Shipping Method column
    createOrderColumn({
      id: "shippingMethod",
      accessorKey: "shippingMethod",
      meta: {
        label: "Shipping Method",
        filterType: "text",
        filterPlaceholder: "Search shipping methods...",
        textFilterMode: "contains",
      },
      header: "Shipping Method",
      enableSorting: true,
      enableColumnFilter: true,
      size: 150,
      minSize: 120,
      maxSize: 250,
      cell: ({ row }) => {
        const method = row.getValue("shippingMethod") as string | undefined;
        if (!method) return null;
        return (
          <div className="w-full truncate text-sm text-muted-foreground" title={method}>
            {method}
          </div>
        );
      },
    }),
    // Date Status Changed column
    createOrderColumn({
      id: "dateStatusChanged",
      accessorKey: "dateStatusChanged",
      meta: {
        label: "Status Changed",
        filterType: "date",
      },
      filterFn: manualDateRangeFilter<Order>(),
      header: "Status Changed",
      enableSorting: true,
      enableColumnFilter: true,
      size: 150,
      minSize: 120,
      maxSize: 250,
      cell: ({ row }) => {
        const timestamp = row.getValue("dateStatusChanged") as number;
        return <div className="text-sm text-muted-foreground">{formatRelativeTime(timestamp)}</div>;
      },
    }),
    // Subtotal column
    createOrderColumn({
      id: "costSubtotal",
      accessorFn: (row) => row.costSubtotal,
      meta: {
        label: "Subtotal",
        filterType: "number",
        filterConfig: {
          currency: true,
          step: 0.01,
        },
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Subtotal</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 120,
      minSize: 100,
      maxSize: 180,
      cell: ({ row }) => {
        const order = row.original;
        const amount = order.costSubtotal;
        const currencyCode = order.costCurrencyCode || "USD";
        return (
          <div className="text-right text-sm text-muted-foreground">
            {formatCurrency(amount, currencyCode)}
          </div>
        );
      },
    }),
    // Shipping Cost column
    createOrderColumn({
      id: "costShipping",
      accessorFn: (row) => row.costShipping,
      meta: {
        label: "Shipping Cost",
        filterType: "number",
        filterConfig: {
          currency: true,
          step: 0.01,
        },
      },
      filterFn: manualNumberRangeFilter<Order>(),
      header: () => <div className="text-right">Shipping</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 120,
      minSize: 100,
      maxSize: 180,
      cell: ({ row }) => {
        const order = row.original;
        const shipping = order.costShipping;
        if (!shipping) return null;
        const currencyCode = order.costCurrencyCode || "USD";
        return (
          <div className="text-right text-sm text-muted-foreground">
            {formatCurrency(shipping, currencyCode)}
          </div>
        );
      },
    }),
  ];
};
