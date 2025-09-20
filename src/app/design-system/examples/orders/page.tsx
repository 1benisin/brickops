import type { Metadata } from "next";
import { OrdersShell } from "@/components/layout/examples/orders-shell";

export const metadata: Metadata = {
  title: "Orders Shell Example",
};

export default function OrdersExamplePage() {
  return <OrdersShell />;
}
