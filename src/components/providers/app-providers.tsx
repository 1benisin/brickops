"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

import { getConvexClient } from "@/lib/convexClient";
import { ThemeProvider } from "./theme-provider";

// Initialize Convex client on the client only to avoid SSR env pitfalls
// and ensure NEXT_PUBLIC_ vars are available when evaluated.

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const convexClient = useMemo(() => getConvexClient(), []);
  return (
    <ConvexAuthNextjsProvider client={convexClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ConvexAuthNextjsProvider>
  );
}
