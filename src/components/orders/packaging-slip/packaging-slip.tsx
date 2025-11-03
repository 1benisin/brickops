import React from "react";
import { PackagingSlipSummary } from "./packaging-slip-summary";
import { PackagingSlipItemsList } from "./packaging-slip-items-list";
import { PackagingSlipMessages } from "./packaging-slip-messages";
import type { Doc } from "@/convex/_generated/dataModel";

interface PackagingSlipProps {
  order: Doc<"bricklinkOrders">;
  items: Doc<"bricklinkOrderItems">[];
}

export function PackagingSlip({ order, items }: PackagingSlipProps) {
  return (
    <div className="mx-auto flex w-[960px] flex-col">
      <PackagingSlipSummary order={order} />
      <PackagingSlipItemsList items={items} />
      <PackagingSlipMessages order={order} />
    </div>
  );
}

