import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrickOps",
  description: "Operational tooling for brick-and-mortar retail teams",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-950 text-slate-100">
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
