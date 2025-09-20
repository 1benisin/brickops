"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NavigationItem {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}

interface AppNavigationProps {
  items: NavigationItem[];
  orientation?: "horizontal" | "vertical";
  onNavigate?: () => void;
}

/**
 * Renders primary application navigation using shadcn/ui buttons so the
 * styling stays aligned with the global design tokens. Highlights the
 * currently active route using the Next.js pathname hook.
 */
export function AppNavigation({
  items,
  orientation = "horizontal",
  onNavigate,
}: AppNavigationProps) {
  const pathname = usePathname();
  const vertical = orientation === "vertical";
  const currentPath = pathname ?? "";

  return (
    <nav
      aria-label="Main"
      className={cn("flex w-full gap-2", vertical ? "flex-col" : "items-center")}
    >
      {items.map((item) => {
        const isActive = currentPath.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Button
            key={item.href}
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "justify-start gap-2",
              vertical ? "w-full" : "w-auto",
              isActive && "shadow-subtle",
            )}
            onClick={onNavigate}
          >
            <Link
              href={item.href}
              className="flex items-center gap-2"
              aria-current={isActive ? "page" : undefined}
            >
              {Icon ? <Icon className="size-4" aria-hidden /> : null}
              <span>{item.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
