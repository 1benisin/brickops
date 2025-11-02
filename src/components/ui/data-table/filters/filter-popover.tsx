"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterPopoverProps {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onApply?: () => void;
  onClear?: () => void;
  hasValue?: boolean;
}

export function FilterPopover({
  label,
  active = false,
  children,
  onApply,
  onClear,
  hasValue = false,
}: FilterPopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleApply = () => {
    onApply?.();
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 border-dashed",
            active && "border-solid bg-accent"
          )}
        >
          <Filter className="mr-2 h-4 w-4" />
          {label}
          {hasValue && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Active
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Filter by {label}</h4>
            {children}
          </div>
          <div className="flex items-center justify-end space-x-2">
            {hasValue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

