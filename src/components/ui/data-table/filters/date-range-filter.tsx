"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

interface DateRangeFilterProps {
  columnId: string;
  value?: { start?: number; end?: number }; // Unix timestamps
  onChange: (value: { start?: number; end?: number }) => void;
}

export function DateRangeFilter({
  columnId,
  value,
  onChange,
}: DateRangeFilterProps) {
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
    onChange({
      start: from ? from.getTime() : undefined,
      end: to ? to.getTime() : undefined,
    });
  }, [from, to, onChange]);

  return (
    <div className="space-y-2">
      <Label>Date Range</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={`${columnId}-date-filter`}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !from && !to && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {from ? (
              to ? (
                <>
                  {format(from, "LLL dd, y")} - {format(to, "LLL dd, y")}
                </>
              ) : (
                format(from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
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
    </div>
  );
}

