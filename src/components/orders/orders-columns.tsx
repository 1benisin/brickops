"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { createColumn } from "@/components/ui/data-table/column-definitions";
import { formatRelativeTime } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

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
    createColumn({
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
    createColumn({
      id: "dateOrdered",
      accessorKey: "dateOrdered",
      meta: {
        label: "Date Ordered",
        filterType: "date",
      },
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
    createColumn({
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
    createColumn({
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
    createColumn({
      id: "totalCount",
      accessorKey: "totalCount",
      meta: {
        label: "Items",
        filterType: "number",
      },
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
    // Unique Count column
    createColumn({
      id: "uniqueCount",
      accessorKey: "uniqueCount",
      meta: {
        label: "Unique Items",
        filterType: "number",
      },
      header: () => <div className="text-right">Unique</div>,
      enableSorting: true,
      enableColumnFilter: true,
      size: 100,
      minSize: 80,
      maxSize: 150,
      cell: ({ row }) => {
        const count = row.getValue("uniqueCount") as number;
        return <div className="text-right font-mono">{count.toLocaleString()}</div>;
      },
    }),
    // Grand Total column
    createColumn({
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
    createColumn({
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
    createColumn({
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
    createColumn({
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
    createColumn({
      id: "dateStatusChanged",
      accessorKey: "dateStatusChanged",
      meta: {
        label: "Status Changed",
        filterType: "date",
      },
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
    createColumn({
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
    createColumn({
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
