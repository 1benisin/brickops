import React from "react";
import type { Doc } from "@/convex/_generated/dataModel";

interface PackagingSlipMessagesProps {
  order: Doc<"bricklinkOrders">;
}

export function PackagingSlipMessages({ order }: PackagingSlipMessagesProps) {
  if (!order.remarks) return null;

  return (
    <table className="w-full font-bold">
      <tbody>
        <tr>
          <td colSpan={3} style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ flexGrow: 1, borderTop: "2px solid black", margin: "10px" }}></div>
              <div>MESSAGE</div>
              <div style={{ flexGrow: 1, borderTop: "2px solid black", margin: "10px" }}></div>
            </div>
            {order.remarks}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

