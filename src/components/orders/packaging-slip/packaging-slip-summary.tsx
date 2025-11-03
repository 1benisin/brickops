import React from "react";
import { formatDate, formatPhoneNumber } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";

interface PackagingSlipSummaryProps {
  order: Doc<"bricklinkOrders">;
}

export function PackagingSlipSummary({ order }: PackagingSlipSummaryProps) {
  const formatCurrency = (amount: number, currencyCode: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  };

  // Parse shipping address JSON
  let shippingAddress: {
    name?: { full?: string; first?: string; last?: string };
    full?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    phone_number?: string;
  } | null = null;

  if (order.shippingAddress) {
    try {
      shippingAddress = JSON.parse(order.shippingAddress);
    } catch {
      // Invalid JSON, leave as null
    }
  }

  return (
    <table className="mt-4 w-full bg-gray-200 px-2 text-sm">
      <tbody>
        <tr className="flex">
          <td className="w-1/3 align-top">
            <table>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">User Name:</td>
                  <td>{order.buyerName}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Email:</td>
                  <td>{order.buyerEmail}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold" width="125">
                    Order Date:
                  </td>
                  <td>{formatDate(order.dateOrdered)}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Part Count:</td>
                  <td>{order.totalCount}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Lot Count:</td>
                  <td>{order.lotCount}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Payment By:</td>
                  <td>{order.paymentMethod || "-"}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Shipping Method:</td>
                  <td>{order.shippingMethod || "-"}</td>
                </tr>
              </tbody>
            </table>
          </td>
          <td className="w-1/3 align-top">
            <table className="w-full">
              <tbody>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Order #:</td>
                  <td style={{ fontWeight: "bold" }}>{order.orderId}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Marketplace:</td>
                  <td>BrickLink</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Order Status:</td>
                  <td>{order.status}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Order Subtotal:</td>
                  <td>{formatCurrency(order.costSubtotal, order.costCurrencyCode)}</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Shipping:</td>
                  <td>
                    {order.costShipping
                      ? formatCurrency(order.costShipping, order.costCurrencyCode)
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap align-top font-bold">Total:</td>
                  <td>{formatCurrency(order.costGrandTotal, order.costCurrencyCode)}</td>
                </tr>
              </tbody>
            </table>
          </td>
          <td className="text-l w-1/3 text-center font-bold">
            <hr />
            {shippingAddress?.name?.full && <div>{shippingAddress.name.full}</div>}
            {shippingAddress?.address1 && <div>{shippingAddress.address1}</div>}
            {shippingAddress?.address2 && <div>{shippingAddress.address2}</div>}
            {shippingAddress?.city && shippingAddress?.state && (
              <div>
                {shippingAddress.city}, {shippingAddress.state}{" "}
                {shippingAddress.postal_code || ""}
              </div>
            )}
            {shippingAddress?.phone_number && (
              <div>{formatPhoneNumber(shippingAddress.phone_number)}</div>
            )}
            <hr />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

