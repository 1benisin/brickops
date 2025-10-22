import type { ReactNode } from "react";

import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";

export default function AuthenticatedRootLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
