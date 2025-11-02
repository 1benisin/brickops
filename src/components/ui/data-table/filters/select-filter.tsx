"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SelectFilterOption {
  label: string;
  value: string;
}

interface SelectFilterProps {
  columnId: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  options: SelectFilterOption[];
  placeholder?: string;
}

export function SelectFilter({
  columnId,
  value,
  onChange,
  options,
  placeholder = "Select value...",
}: SelectFilterProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${columnId}-select`}>Filter</Label>
      <Select
        value={value || ""}
        onValueChange={(val) => onChange(val || undefined)}
      >
        <SelectTrigger id={`${columnId}-select`}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

