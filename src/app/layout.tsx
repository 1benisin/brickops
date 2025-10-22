import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrickOps",
  description: "Operational tooling for brick-and-mortar retail teams",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ConvexAuthNextjsServerProvider>
          <AppProviders>
            <main className="min-h-screen">{children}</main>
          </AppProviders>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
