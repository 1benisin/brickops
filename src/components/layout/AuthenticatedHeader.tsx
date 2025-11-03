"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";

import { AppNavigation, type NavigationItem } from "@/components/layout/AppNavigation";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ThemeToggle,
} from "@/components/ui";

interface AuthenticatedHeaderProps {
  navigation: NavigationItem[];
  onSignOut: () => void;
}

export function AuthenticatedHeader({ navigation, onSignOut }: AuthenticatedHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
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
          <Button
            type="button"
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={onSignOut}
          >
            <LogOut className="mr-2 size-4" />
            Sign out
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
                <SheetDescription>Access navigation links and sign out options</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4">
                <AppNavigation
                  items={navigation}
                  orientation="vertical"
                  onNavigate={() => setOpen(false)}
                />
                <Button type="button" variant="outline" onClick={onSignOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
