"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

/**
 * Compact toggle that switches between light and dark modes
 * using the shared ThemeProvider configuration.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  if (!isMounted) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground",
          className,
        )}
      >
        <Sun className="size-4" />
      </span>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "focus-ring group relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors",
        className,
      )}
      aria-label={`Activate ${isDark ? "light" : "dark"} mode`}
    >
      <Sun className="size-[1.1rem] rotate-0 scale-100 transition-all group-hover:scale-110 group-active:scale-95 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-[1.1rem] rotate-90 scale-0 transition-all group-hover:scale-110 group-active:scale-95 dark:rotate-0 dark:scale-100" />
    </button>
  );
}
