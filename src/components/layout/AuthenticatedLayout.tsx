"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { AuthenticatedHeader } from "@/components/layout/AuthenticatedHeader";
import type { NavigationItem } from "@/components/layout/AppNavigation";

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

  const handleSignOut = () => {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      await signOut();
      router.replace("/login");
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <AuthenticatedHeader navigation={NAVIGATION} onSignOut={handleSignOut} />
      <main className="flex-1">
        <div className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
