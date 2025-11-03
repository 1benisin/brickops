"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberRangeFilterProps {
  columnId: string;
  value?: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number } | undefined) => void;
  placeholder?: { min?: string; max?: string };
  currency?: boolean;
  step?: number;
}

export function NumberRangeFilter({
  columnId,
  value,
  onChange,
  placeholder,
  currency = false,
  step = 1,
}: NumberRangeFilterProps) {
  const [min, setMin] = React.useState<string>(value?.min?.toString() || "");
  const [max, setMax] = React.useState<string>(value?.max?.toString() || "");

  React.useEffect(() => {
    const minNum = min === "" ? undefined : parseFloat(min);
    const maxNum = max === "" ? undefined : parseFloat(max);

    // Validate min <= max
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      return; // Don't update if invalid
    }

    // Only pass filter value if at least one is defined, otherwise pass undefined to clear filter
    if (minNum !== undefined || maxNum !== undefined) {
      onChange({ min: minNum, max: maxNum });
    } else {
      onChange(undefined); // Clear filter when both are empty
    }
  }, [min, max, onChange]);

  const formatDisplayValue = (val: string) => {
    if (currency && val) {
      return val;
    }
    return val;
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-min`}>Min</Label>
        <Input
          id={`${columnId}-min`}
          type="number"
          step={step}
          value={formatDisplayValue(min)}
          onChange={(e) => setMin(e.target.value)}
          placeholder={placeholder?.min || "Min"}
          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${columnId}-max`}>Max</Label>
        <Input
          id={`${columnId}-max`}
          type="number"
          step={step}
          value={formatDisplayValue(max)}
          onChange={(e) => setMax(e.target.value)}
          placeholder={placeholder?.max || "Max"}
          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}
