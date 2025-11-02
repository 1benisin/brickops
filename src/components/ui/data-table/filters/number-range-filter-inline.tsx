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
  const [min, setMin] = React.useState<string>(value?.min?.toString() || "");
  const [max, setMax] = React.useState<string>(value?.max?.toString() || "");

  // Sync internal state with external value prop
  React.useEffect(() => {
    if (value?.min !== undefined && value.min.toString() !== min) {
      setMin(value.min.toString());
    } else if (!value && min !== "") {
      setMin("");
    }
    if (value?.max !== undefined && value.max.toString() !== max) {
      setMax(value.max.toString());
    } else if (!value && max !== "") {
      setMax("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // Only depend on value prop, not min/max to avoid loops

  // Store latest onChange in ref to avoid dependency issues
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track previous computed values to avoid unnecessary onChange calls
  const prevComputedRef = React.useRef<{ min?: number; max?: number } | undefined>(value);

  React.useEffect(() => {
    const minNum = min === "" ? undefined : parseFloat(min);
    const maxNum = max === "" ? undefined : parseFloat(max);

    // Validate min <= max
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      return; // Don't update if invalid
    }

    // Only call onChange if computed values actually changed
    const computed =
      minNum !== undefined || maxNum !== undefined ? { min: minNum, max: maxNum } : undefined;

    const prevComputed = prevComputedRef.current;
    const hasChanged =
      computed?.min !== prevComputed?.min ||
      computed?.max !== prevComputed?.max ||
      (computed === undefined) !== (prevComputed === undefined);

    if (hasChanged) {
      prevComputedRef.current = computed;
      onChangeRef.current(computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]); // Removed onChange from deps to prevent infinite loops

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
