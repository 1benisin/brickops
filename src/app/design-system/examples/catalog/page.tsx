import type { Metadata } from "next";
import { CatalogShell } from "@/components/layout/examples/catalog-shell";

export const metadata: Metadata = {
  title: "Catalog Shell Example",
};

export default function CatalogExamplePage() {
  return <CatalogShell />;
}
