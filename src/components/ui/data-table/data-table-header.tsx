"use client";

import { Header, flexRender } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TextFilter } from "./filters/text-filter";
import { NumberRangeFilterInline } from "./filters/number-range-filter-inline";
import { DateRangeFilterInline } from "./filters/date-range-filter-inline";
import { SelectFilterInline } from "./filters/select-filter-inline";

interface DataTableHeaderProps<TData, TValue> {
  header: Header<TData, TValue>;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  onSort?: (columnId: string) => void;
  onFilterChange?: (columnId: string, value: any) => void;
  filterValue?: any;
  table?: any; // Table instance for header functions that need it
}

export function DataTableHeader<TData, TValue>({
  header,
  enableSorting = true,
  enableFiltering = true,
  onSort,
  onFilterChange,
  filterValue,
  table,
}: DataTableHeaderProps<TData, TValue>) {
  // Guard against undefined header or column
  if (!header || !header.column) {
    return null;
  }

  const canSort = enableSorting && header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();
  const canFilter = enableFiltering && header.column.getCanFilter();
  const filterType = (header.column.columnDef.meta as any)?.filterType;
  const filterOptions = (header.column.columnDef.meta as any)?.filterOptions;
  const filterConfig = (header.column.columnDef.meta as any)?.filterConfig;

  // Guard: ensure column definition exists before rendering
  if (!header.column?.columnDef) {
    return null;
  }

  // Use header.getContext() which returns the proper HeaderContext with all required properties
  // This is the correct way according to TanStack Table documentation
  const headerContext = header.getContext();

  const headerContent = flexRender(header.column.columnDef.header, headerContext);

  return (
    <div className="flex flex-col">
      {/* Header with sort button */}
      <div className="flex items-center space-x-2">
        {canSort ? (
          <Button
            variant="ghost"
            className={cn(
              "h-8 data-[state=open]:bg-accent -ml-3 hover:bg-accent",
              sortDirection && "bg-accent",
            )}
            onClick={() => {
              // Only call parent callback - parent handles both UI state and sorting
              // Don't call toggleSorting() to avoid double state updates
              onSort?.(header.column.id);
            }}
          >
            <span>{headerContent}</span>
            <span className="ml-2">
              {sortDirection === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : sortDirection === "desc" ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUpDown className="h-4 w-4 opacity-50" />
              )}
            </span>
          </Button>
        ) : (
          <div>{headerContent}</div>
        )}
      </div>

      {/* Inline filter input below header */}
      {canFilter && filterType && (
        <div className="mt-1">
          {filterType === "text" && (
            <TextFilter
              columnId={header.column.id}
              value={filterValue}
              onChange={(value) => onFilterChange?.(header.column.id, value)}
              placeholder={(header.column.columnDef.meta as any)?.filterPlaceholder || "Search..."}
            />
          )}
          {filterType === "number" && (
            <NumberRangeFilterInline
              columnId={header.column.id}
              value={filterValue}
              onChange={(value) => onFilterChange?.(header.column.id, value)}
              currency={filterConfig?.currency}
              step={filterConfig?.step}
            />
          )}
          {filterType === "date" && (
            <DateRangeFilterInline
              columnId={header.column.id}
              value={filterValue}
              onChange={(value: { start?: number; end?: number } | undefined) =>
                onFilterChange?.(header.column.id, value)
              }
            />
          )}
          {filterType === "select" && filterOptions && (
            <SelectFilterInline
              columnId={header.column.id}
              value={filterValue}
              onChange={(value: string | undefined) => onFilterChange?.(header.column.id, value)}
              options={filterOptions}
            />
          )}
        </div>
      )}
    </div>
  );
}
