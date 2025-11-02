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

const ALL_OPTION_VALUE = "__all__";

export function SelectFilterInline({
  columnId,
  value,
  onChange,
  options,
  placeholder = "All",
}: SelectFilterInlineProps) {
  // Convert undefined/null to the special "all" value for the Select component
  const selectValue = value || ALL_OPTION_VALUE;

  const handleValueChange = (val: string) => {
    // Convert the special "all" value back to undefined
    if (val === ALL_OPTION_VALUE) {
      onChange(undefined);
    } else {
      onChange(val);
    }
  };

  return (
    <Select value={selectValue} onValueChange={handleValueChange}>
      <SelectTrigger id={`${columnId}-select-inline`} className="h-7 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OPTION_VALUE}>All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

