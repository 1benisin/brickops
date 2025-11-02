"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";

interface DataTableToolbarProps {
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  placeholder?: string;
}

export function DataTableToolbar({
  globalFilter = "",
  onGlobalFilterChange,
  placeholder = "Search...",
}: DataTableToolbarProps) {
  const [value, setValue] = React.useState(globalFilter);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  // Debounce filter input (300ms)
  React.useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onGlobalFilterChange?.(value);
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, onGlobalFilterChange]);

  // Sync with external filter changes
  React.useEffect(() => {
    if (globalFilter !== value) {
      setValue(globalFilter);
    }
  }, [globalFilter]);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex flex-1 items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-8"
          />
        </div>
        {value && (
          <Button
            variant="ghost"
            onClick={() => {
              setValue("");
              onGlobalFilterChange?.("");
            }}
            className="h-8 px-2 lg:px-3"
          >
            Clear
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

