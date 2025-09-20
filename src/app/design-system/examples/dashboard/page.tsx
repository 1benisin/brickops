import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/examples/dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard Shell Example",
};

export default function DashboardExamplePage() {
  return <DashboardShell />;
}
