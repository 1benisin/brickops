"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

interface NumberRangeFilterInlineProps {
  columnId: string;
  value?: { min?: number; max?: number };
  onChange: (value: { min?: number; max?: number } | undefined) => void;
  currency?: boolean;
  step?: number;
}

export function NumberRangeFilterInline({
  columnId,
  value,
  onChange,
  currency = false,
  step = 1,
}: NumberRangeFilterInlineProps) {
  const [min, setMin] = React.useState<string>(
    value?.min?.toString() || ""
  );
  const [max, setMax] = React.useState<string>(
    value?.max?.toString() || ""
  );

  React.useEffect(() => {
    if (value?.min !== undefined) {
      setMin(value.min.toString());
    } else if (!value) {
      setMin("");
    }
    if (value?.max !== undefined) {
      setMax(value.max.toString());
    } else if (!value) {
      setMax("");
    }
  }, [value]);

  React.useEffect(() => {
    const minNum = min === "" ? undefined : parseFloat(min);
    const maxNum = max === "" ? undefined : parseFloat(max);

    // Validate min <= max
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      return; // Don't update if invalid
    }

    // Only call onChange if there's a value or if clearing
    if (minNum !== undefined || maxNum !== undefined) {
      onChange({ min: minNum, max: maxNum });
    } else if (min === "" && max === "") {
      onChange(undefined);
    }
  }, [min, max, onChange]);

  return (
    <div className="flex gap-1">
      <Input
        id={`${columnId}-min`}
        type="number"
        step={step}
        value={min}
        onChange={(e) => setMin(e.target.value)}
        placeholder="Min"
        className="h-7 text-xs"
      />
      <Input
        id={`${columnId}-max`}
        type="number"
        step={step}
        value={max}
        onChange={(e) => setMax(e.target.value)}
        placeholder="Max"
        className="h-7 text-xs"
      />
    </div>
  );
}

