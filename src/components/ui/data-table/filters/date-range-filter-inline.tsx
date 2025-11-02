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

export function DateRangeFilterInline({
  columnId,
  value,
  onChange,
}: DateRangeFilterInlineProps) {
  const [from, setFrom] = React.useState<Date | undefined>(
    value?.start ? new Date(value.start) : undefined
  );
  const [to, setTo] = React.useState<Date | undefined>(
    value?.end ? new Date(value.end) : undefined
  );

  // Sync with external value changes (e.g., when filter is cleared)
  React.useEffect(() => {
    setFrom(value?.start ? new Date(value.start) : undefined);
    setTo(value?.end ? new Date(value.end) : undefined);
  }, [value?.start, value?.end]);

  React.useEffect(() => {
    if (from || to) {
      onChange({
        start: from ? from.getTime() : undefined,
        end: to ? to.getTime() : undefined,
      });
    } else {
      onChange(undefined);
    }
  }, [from, to, onChange]);

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

