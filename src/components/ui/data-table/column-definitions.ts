import { ColumnDef } from "@tanstack/react-table";

export type ColumnFilterType = "text" | "number" | "date" | "select" | "boolean" | "custom";

export interface EnhancedColumnMeta<TData, TValue = unknown> {
  label?: string;
  description?: string;
  filterType?: ColumnFilterType;
  filterPlaceholder?: string;
  filterOptions?: Array<{ label: string; value: string }>; // For select filters
  filterConfig?: {
    min?: number;
    max?: number;
    step?: number;
    currency?: boolean; // For number filters
  };
  [key: string]: unknown;
}

// Helper to create typed columns with enhanced metadata
// Accepts both regular columns (with accessorKey) and computed columns (with accessorFn)
export function createColumn<TData, TValue = unknown>(
  config: ColumnDef<TData, TValue> & {
    meta?: EnhancedColumnMeta<TData, TValue>;
  },
): ColumnDef<TData, any> {
  return config as ColumnDef<TData, any>;
}

// Type guard for filter type
export function isValidFilterType(type: string): type is ColumnFilterType {
  return ["text", "number", "date", "select", "boolean", "custom"].includes(type);
}
