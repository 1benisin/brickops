"use client";

import { Header, flexRender, type Table } from "@tanstack/react-table";
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
  onFilterChange?: (columnId: string, value: any) => void; // Legacy callback
  filterValue?: any;
  table?: Table<TData>; // Table instance for header functions that need it
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

  const columnMeta = header.column.columnDef.meta as any;

  const canSort = enableSorting && header.column.getCanSort();
  const sortDirection = header.column.getIsSorted();
  const canFilter = enableFiltering && header.column.getCanFilter();
  const filterType = columnMeta?.filterType;
  const filterOptions = columnMeta?.filterOptions;
  const filterConfig = columnMeta?.filterConfig;
  const headerWrapperClassName = columnMeta?.headerWrapperClassName;
  const headerContainerClassName = columnMeta?.headerContainerClassName;
  const headerButtonClassName = columnMeta?.headerButtonClassName;

  // Guard: ensure column definition exists before rendering
  if (!header.column?.columnDef) {
    return null;
  }

  // Use header.getContext() which returns the proper HeaderContext with all required properties
  // This is the correct way according to TanStack Table documentation
  const headerContext = header.getContext();

  const headerContent = flexRender(header.column.columnDef.header, headerContext);

  return (
    <div className={cn("flex flex-col", headerWrapperClassName)}>
      {/* Header with sort button */}
      <div className="w-full">
        {canSort ? (
          <Button
            variant="ghost"
            className={cn(
              "w-full h-7 justify-between px-3 text-left font-normal text-xs hover:bg-accent",
              sortDirection && "bg-accent",
              headerButtonClassName,
            )}
            onClick={() => {
              // Only call parent callback - parent handles both UI state and sorting
              // Don't call toggleSorting() to avoid double state updates
              onSort?.(header.column.id);
            }}
          >
            <span className="truncate">{headerContent}</span>
            <span className="ml-2 flex-shrink-0">
              {sortDirection === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : sortDirection === "desc" ? (
                <ArrowDown className="h-3 w-3" />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-50" />
              )}
            </span>
          </Button>
        ) : (
          <div
            className={cn(
              "h-7 flex items-center px-3 text-xs font-normal",
              headerContainerClassName,
            )}
          >
            {headerContent}
          </div>
        )}
      </div>

      {/* Inline filter input below header */}
      {canFilter && filterType && (
        <div className="mt-1">
          {filterType === "text" && (
            <TextFilter
              columnId={header.column.id}
              value={filterValue ?? header.column.getFilterValue()}
              onChange={(value) => {
                // Use TanStack Table's built-in filter API if table is available
                if (table) {
                  header.column.setFilterValue(value || undefined);
                } else {
                  // Fallback to legacy callback
                  onFilterChange?.(header.column.id, value);
                }
              }}
              placeholder={(header.column.columnDef.meta as any)?.filterPlaceholder || "Search..."}
            />
          )}
          {filterType === "number" && (
            <NumberRangeFilterInline
              columnId={header.column.id}
              value={filterValue ?? header.column.getFilterValue()}
              onChange={(value) => {
                if (table) {
                  header.column.setFilterValue(value || undefined);
                } else {
                  onFilterChange?.(header.column.id, value);
                }
              }}
              currency={filterConfig?.currency}
              step={filterConfig?.step}
            />
          )}
          {filterType === "date" && (
            <DateRangeFilterInline
              columnId={header.column.id}
              value={filterValue ?? header.column.getFilterValue()}
              onChange={(value: { start?: number; end?: number } | undefined) => {
                if (table) {
                  header.column.setFilterValue(value || undefined);
                } else {
                  onFilterChange?.(header.column.id, value);
                }
              }}
            />
          )}
          {filterType === "select" && filterOptions && (
            <SelectFilterInline
              columnId={header.column.id}
              value={filterValue ?? header.column.getFilterValue()}
              onChange={(value: string | undefined) => {
                if (table) {
                  header.column.setFilterValue(
                    value === "__all__" ? undefined : value || undefined,
                  );
                } else {
                  onFilterChange?.(header.column.id, value);
                }
              }}
              options={filterOptions}
            />
          )}
        </div>
      )}
    </div>
  );
}
