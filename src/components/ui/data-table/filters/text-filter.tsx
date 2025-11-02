"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface TextFilterProps {
  columnId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  debounceMs?: number; // Default: 300
}

function TextFilterComponent({
  columnId,
  value,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
}: TextFilterProps) {
  const [inputValue, setInputValue] = React.useState<string>(value || "");
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Sync with external value changes
  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer for debounced onChange
    debounceTimerRef.current = setTimeout(() => {
      onChange(newValue.trim() || undefined);
    }, debounceMs);
  };

  const handleClear = () => {
    setInputValue("");
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onChange(undefined);
  };

  return (
    <div className="relative">
      <Input
        id={`${columnId}-filter-input`}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className="pr-8 h-7 text-xs"
      />
      {inputValue && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
          onClick={handleClear}
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent re-renders but props haven't changed
// React.memo's default shallow comparison is sufficient here
export const TextFilter = React.memo(TextFilterComponent);
