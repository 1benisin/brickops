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
  const [committedFrom, setCommittedFrom] = React.useState<Date | undefined>(
    value?.start ? new Date(value.start) : undefined,
  );
  const [committedTo, setCommittedTo] = React.useState<Date | undefined>(
    value?.end ? new Date(value.end) : undefined,
  );
  const [draftFrom, setDraftFrom] = React.useState<Date | undefined>(committedFrom);
  const [draftTo, setDraftTo] = React.useState<Date | undefined>(committedTo);
  const [open, setOpen] = React.useState(false);

  // Sync internal state with external value prop
  React.useEffect(() => {
    const newFrom = value?.start ? new Date(value.start) : undefined;
    const newTo = value?.end ? new Date(value.end) : undefined;

    if (newFrom?.getTime() !== committedFrom?.getTime()) {
      setCommittedFrom(newFrom);
    }
    if (newTo?.getTime() !== committedTo?.getTime()) {
      setCommittedTo(newTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.start, value?.end]);

  React.useEffect(() => {
    if (open) {
      setDraftFrom(committedFrom);
      setDraftTo(committedTo);
    }
  }, [open, committedFrom, committedTo]);

  // Store latest onChange in ref to avoid dependency issues
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Track previous computed values to avoid unnecessary onChange calls
  const prevComputedRef = React.useRef<{ start?: number; end?: number } | undefined>(value);

  React.useEffect(() => {
    const computed =
      committedFrom || committedTo
        ? {
            start: committedFrom ? committedFrom.getTime() : undefined,
            end: committedTo ? committedTo.getTime() : undefined,
          }
        : undefined;

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
  }, [committedFrom, committedTo]);

  const handleApply = React.useCallback(() => {
    setCommittedFrom(draftFrom);
    setCommittedTo(draftTo);
    setOpen(false);
  }, [draftFrom, draftTo]);

  const handleClear = React.useCallback(() => {
    setDraftFrom(undefined);
    setDraftTo(undefined);
    setCommittedFrom(undefined);
    setCommittedTo(undefined);
    setOpen(false);
  }, []);

  const summaryLabel = React.useMemo(() => {
    if (committedFrom && committedTo) {
      return `${format(committedFrom, "MM/dd")} - ${format(committedTo, "MM/dd")}`;
    }
    if (committedFrom) {
      return format(committedFrom, "MM/dd/yyyy");
    }
    if (committedTo) {
      return format(committedTo, "MM/dd/yyyy");
    }
    return "Date range";
  }, [committedFrom, committedTo]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={`${columnId}-date-filter-inline`}
          variant="outline"
          size="sm"
          className={cn(
            "w-full h-7 justify-start text-left font-normal text-xs",
            !committedFrom && !committedTo && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          <span className="truncate">{summaryLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{ from: draftFrom, to: draftTo }}
          onSelect={(range) => {
            setDraftFrom(range?.from);
            setDraftTo(range?.to);
          }}
          numberOfMonths={2}
        />
        <div className="flex items-center justify-end gap-2 border-t p-3">
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
