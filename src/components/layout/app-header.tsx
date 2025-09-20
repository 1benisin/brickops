"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { AppNavigation, type NavigationItem } from "@/components/layout/app-navigation";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ThemeToggle,
} from "@/components/ui";

interface AppHeaderProps {
  navigation: NavigationItem[];
}

/**
 * Provides the responsive application shell header. Desktop renders
 * inline navigation while mobile collapses items into a sheet.
 */
export function AppHeader({ navigation }: AppHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-subtle">
              BO
            </span>
            <span className="hidden sm:inline-block">BrickOps</span>
          </Link>
          <nav className="hidden md:flex">
            <AppNavigation items={navigation} />
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="secondary" className="hidden sm:inline-flex">
            <Link href="/identify">Identify Part</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="md:hidden"
                aria-label="Open navigation menu"
                aria-haspopup="dialog"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs">
              <SheetHeader className="pb-4 text-left">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <AppNavigation
                items={navigation}
                orientation="vertical"
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
