"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

import { AuthenticatedHeader } from "@/components/layout/AuthenticatedHeader";
import type { NavigationItem } from "@/components/layout/AppNavigation";
import { api } from "@/convex/_generated/api";

const NAVIGATION: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Inventory", href: "/inventory" },
  { label: "Orders", href: "/orders" },
  { label: "Catalog", href: "/catalog" },
  { label: "Identify", href: "/identify" },
  { label: "Settings", href: "/settings" },
] as const;

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [isPending, startTransition] = useTransition();

  // Use getAuthState which doesn't throw - it returns auth state even if user doesn't exist
  const authState = useQuery(api.users.queries.getAuthState);

  // Redirect to login if user is not authenticated or doesn't exist
  useEffect(() => {
    if (authState === undefined) {
      // Still loading, wait
      return;
    }

    if (
      authState.isAuthenticated === false ||
      (authState.isAuthenticated === true && authState.user === null)
    ) {
      // User is not authenticated or doesn't exist in database
      router.replace("/login");
    }
  }, [authState, router]);

  const handleSignOut = () => {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      await signOut();
      router.replace("/login");
    });
  };

  // Don't render content if user is not authenticated or doesn't exist
  if (
    authState === undefined ||
    authState.isAuthenticated === false ||
    (authState.isAuthenticated === true && authState.user === null)
  ) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <AuthenticatedHeader navigation={NAVIGATION} onSignOut={handleSignOut} />
      <main className="flex-1">
        <div className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 print:p-0">{children}</div>
      </main>
    </div>
  );
}
