"use client";

import type { ReactNode } from "react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

import { getConvexClient } from "@/lib/convexClient";
import { ThemeProvider } from "./theme-provider";

const convexClient = getConvexClient();

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ConvexAuthNextjsProvider client={convexClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ConvexAuthNextjsProvider>
  );
}
