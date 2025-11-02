/**
 * Filter State Utilities
 *
 * Converts between TanStack Table's ColumnFiltersState format and our QuerySpec filter format.
 * Handles different filter types based on column metadata (text, numberRange, dateRange, enum).
 */

import type { ColumnFiltersState } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import type { EnhancedColumnMeta } from "../column-definitions";

/**
 * Generic QuerySpec filter structure
 * Maps column IDs to their filter values based on filter type
 */
export type QuerySpecFilters = Record<
  string,
  | { kind: "contains"; value: string }
  | { kind: "prefix"; value: string }
  | { kind: "numberRange"; min?: number; max?: number }
  | { kind: "dateRange"; start?: number; end?: number }
  | { kind: "enum"; value: string }
>;

/**
 * Convert TanStack Table ColumnFiltersState to QuerySpec filters format
 *
 * @param columnFilters - TanStack Table column filters state (array format)
 * @param columns - Column definitions to determine filter types from meta
 * @returns QuerySpec filters object
 */
export function columnFiltersToQuerySpec<TData>(
  columnFilters: ColumnFiltersState,
  columns: ColumnDef<TData>[],
): QuerySpecFilters {
  const filters: QuerySpecFilters = {};

  // Create a map of columnId to column definition for quick lookup
  const columnMap = new Map<string, ColumnDef<TData>>();
  columns.forEach((col) => {
    if (col.id) {
      columnMap.set(col.id, col);
    }
  });

  // Process each filter from TanStack Table format
  for (const filter of columnFilters) {
    const columnDef = columnMap.get(filter.id);
    if (!columnDef) continue;

    const meta = (columnDef.meta as EnhancedColumnMeta<TData>) || {};
    const filterType = meta.filterType;

    // Skip if no value or empty string
    if (filter.value === undefined || filter.value === null || filter.value === "") {
      continue;
    }

    // Handle "__all__" from SelectFilterInline (means "no filter")
    if (filter.value === "__all__") {
      continue;
    }

    // Map based on filter type
    switch (filterType) {
      case "text": {
        if (typeof filter.value === "string") {
          const textMode = meta.textFilterMode === "contains" ? "contains" : "prefix";
          if (textMode === "contains") {
            const normalized = filter.value.trim().toLowerCase();
            if (normalized.length > 0) {
              filters[filter.id] = { kind: "contains", value: normalized };
            }
          } else {
            filters[filter.id] = { kind: "prefix", value: filter.value };
          }
        }
        break;
      }

      case "number": {
        // Number filters use range (min/max)
        if (typeof filter.value === "object" && filter.value !== null) {
          const rangeValue = filter.value as { min?: number; max?: number };
          filters[filter.id] = {
            kind: "numberRange",
            min: rangeValue.min,
            max: rangeValue.max,
          };
        }
        break;
      }

      case "date": {
        // Date filters use range (start/end timestamps)
        if (typeof filter.value === "object" && filter.value !== null) {
          const rangeValue = filter.value as { start?: number; end?: number };
          filters[filter.id] = {
            kind: "dateRange",
            start: rangeValue.start,
            end: rangeValue.end,
          };
        }
        break;
      }

      case "select": {
        // Select filters use enum (single value)
        if (typeof filter.value === "string") {
          filters[filter.id] = { kind: "enum", value: filter.value };
        }
        break;
      }

      default:
        // Unknown filter type - skip
        break;
    }
  }

  return filters;
}

/**
 * Convert QuerySpec filters to TanStack Table ColumnFiltersState format
 *
 * @param querySpecFilters - QuerySpec filters object
 * @param columns - Column definitions (for validation/type checking)
 * @returns TanStack Table column filters state (array format)
 */
export function querySpecToColumnFilters<TData>(
  querySpecFilters: QuerySpecFilters | undefined,
  columns: ColumnDef<TData>[],
): ColumnFiltersState {
  if (!querySpecFilters) {
    return [];
  }

  const columnFilters: ColumnFiltersState = [];

  // Create a map of columnId to column definition for quick lookup
  const columnMap = new Map<string, ColumnDef<TData>>();
  columns.forEach((col) => {
    if (col.id) {
      columnMap.set(col.id, col);
    }
  });

  // Convert each filter from QuerySpec format to TanStack format
  for (const [columnId, filter] of Object.entries(querySpecFilters)) {
    const columnDef = columnMap.get(columnId);
    if (!columnDef) continue;

    // Map based on filter kind
    switch (filter.kind) {
      case "contains":
      case "prefix": {
        // Text filter (contains or prefix)
        columnFilters.push({
          id: columnId,
          value: filter.value,
        });
        break;
      }

      case "numberRange": {
        // Number range filter
        columnFilters.push({
          id: columnId,
          value: {
            min: filter.min,
            max: filter.max,
          },
        });
        break;
      }

      case "dateRange": {
        // Date range filter
        columnFilters.push({
          id: columnId,
          value: {
            start: filter.start,
            end: filter.end,
          },
        });
        break;
      }

      case "enum": {
        // Enum/select filter
        columnFilters.push({
          id: columnId,
          value: filter.value,
        });
        break;
      }

      default:
        // Unknown filter kind - skip
        break;
    }
  }

  return columnFilters;
}

/**
 * Check if a filter type should be debounced
 *
 * @param filterType - The filter type from column metadata
 * @returns true if the filter type should be debounced (text filters)
 */
export function shouldDebounceFilter(filterType?: string): boolean {
  return filterType === "text";
}
