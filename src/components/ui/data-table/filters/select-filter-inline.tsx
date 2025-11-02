"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SelectFilterOption {
  label: string;
  value: string;
}

interface SelectFilterInlineProps {
  columnId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  options: SelectFilterOption[];
  placeholder?: string;
}

export function SelectFilterInline({
  columnId,
  value,
  onChange,
  options,
  placeholder = "All",
}: SelectFilterInlineProps) {
  return (
    <Select
      value={value || ""}
      onValueChange={(val) => onChange(val || undefined)}
    >
      <SelectTrigger id={`${columnId}-select-inline`} className="h-7 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

