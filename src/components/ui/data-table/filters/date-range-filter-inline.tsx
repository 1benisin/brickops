"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

interface DateRangeFilterInlineProps {
  columnId: string;
  value?: { start?: number; end?: number }; // Unix timestamps
  onChange: (value: { start?: number; end?: number } | undefined) => void;
}

export function DateRangeFilterInline({ columnId, value, onChange }: DateRangeFilterInlineProps) {
  const [from, setFrom] = React.useState<Date | undefined>(
    value?.start ? new Date(value.start) : undefined,
  );
  const [to, setTo] = React.useState<Date | undefined>(
    value?.end ? new Date(value.end) : undefined,
  );

  // Sync internal state with external value prop
  React.useEffect(() => {
    const newFrom = value?.start ? new Date(value.start) : undefined;
    const newTo = value?.end ? new Date(value.end) : undefined;

    // Only update if actually different
    if (newFrom?.getTime() !== from?.getTime()) {
      setFrom(newFrom);
    }
    if (newTo?.getTime() !== to?.getTime()) {
      setTo(newTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.start, value?.end]); // Only depend on value prop, not from/to to avoid loops

  // Store latest onChange in ref to avoid dependency issues
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track previous computed values to avoid unnecessary onChange calls
  const prevComputedRef = React.useRef<{ start?: number; end?: number } | undefined>(value);

  React.useEffect(() => {
    const computed =
      from || to
        ? {
            start: from ? from.getTime() : undefined,
            end: to ? to.getTime() : undefined,
          }
        : undefined;

    // Only call onChange if computed values actually changed
    const prevComputed = prevComputedRef.current;
    const hasChanged =
      computed?.start !== prevComputed?.start ||
      computed?.end !== prevComputed?.end ||
      (computed === undefined) !== (prevComputed === undefined);

    if (hasChanged) {
      prevComputedRef.current = computed;
      onChangeRef.current(computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]); // Removed onChange from deps to prevent infinite loops

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={`${columnId}-date-filter-inline`}
          variant="outline"
          size="sm"
          className={cn(
            "w-full h-7 justify-start text-left font-normal text-xs",
            !from && !to && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {from ? (
            to ? (
              <span className="truncate">
                {format(from, "MM/dd")} - {format(to, "MM/dd")}
              </span>
            ) : (
              format(from, "MM/dd/yyyy")
            )
          ) : (
            <span>Date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={(range) => {
            setFrom(range?.from);
            setTo(range?.to);
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
