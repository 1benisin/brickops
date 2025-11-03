"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { SlidersHorizontal } from "lucide-react";

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
  const [draftMin, setDraftMin] = React.useState<string>(min);
  const [draftMax, setDraftMax] = React.useState<string>(max);
  const [open, setOpen] = React.useState(false);

  // Sync committed filter value from external state
  React.useEffect(() => {
    const nextMin = value?.min !== undefined ? value.min.toString() : "";
    const nextMax = value?.max !== undefined ? value.max.toString() : "";

    setMin(nextMin);
    setMax(nextMax);
  }, [value?.min, value?.max]);

  // When the popover opens, copy committed values into draft inputs
  React.useEffect(() => {
    if (open) {
      setDraftMin(min);
      setDraftMax(max);
    }
  }, [open, min, max]);

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

  const handleApply = React.useCallback(() => {
    setMin(draftMin.trim());
    setMax(draftMax.trim());
    setOpen(false);
  }, [draftMin, draftMax]);

  const handleClear = React.useCallback(() => {
    setDraftMin("");
    setDraftMax("");
    setMin("");
    setMax("");
    setOpen(false);
  }, []);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
  }, []);

  const hasMin = min !== "";
  const hasMax = max !== "";
  const summary =
    hasMin || hasMax
      ? `${hasMin ? `≥ ${min}` : ""}${hasMin && hasMax ? " · " : ""}${hasMax ? `≤ ${max}` : ""}`
      : "Range";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant={hasMin || hasMax ? "default" : "outline"} size="sm" className="h-8 gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-xs font-medium">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-4 p-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${columnId}-popover-min`}>Min</Label>
            <Input
              id={`${columnId}-popover-min`}
              type="number"
              inputMode="decimal"
              step={step}
              value={draftMin}
              onChange={(e) => setDraftMin(e.target.value)}
              placeholder="Min"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleApply();
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${columnId}-popover-max`}>Max</Label>
            <Input
              id={`${columnId}-popover-max`}
              type="number"
              inputMode="decimal"
              step={step}
              value={draftMax}
              onChange={(e) => setDraftMax(e.target.value)}
              placeholder="Max"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleApply();
                }
              }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
