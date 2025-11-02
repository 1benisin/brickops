"use client";

import * as React from "react";
import { Column, Table } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SortableColumnItemProps<TData> {
  column: Column<TData>;
  table: Table<TData>;
}

export function SortableColumnItem<TData>({ column, table }: SortableColumnItemProps<TData>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [width, setWidth] = React.useState(column.getSize());
  const [isEditingWidth, setIsEditingWidth] = React.useState(false);

  // Debounced width update
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (width !== column.getSize()) {
        table.setColumnSizing((old) => ({
          ...old,
          [column.id]: width,
        }));
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [width, column, table]);

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      // Allow any numeric input while editing; clamp on blur/confirm
      setWidth(value);
    }
  };

  const applyClampedWidth = React.useCallback(() => {
    const minSize = (column.columnDef.minSize as number) || 40;
    const maxSize = (column.columnDef.maxSize as number) || 1000;
    const numeric = typeof width === "number" ? width : minSize;
    const clamped = Math.max(minSize, Math.min(maxSize, numeric));
    setWidth(clamped);
    table.setColumnSizing((old) => ({
      ...old,
      [column.id]: clamped,
    }));
    setIsEditingWidth(false);
  }, [column, table, width]);

  type ColumnMeta = { meta?: { label?: string } };
  const columnName =
    (column.columnDef as unknown as ColumnMeta).meta?.label ||
    (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md hover:bg-accent transition-colors",
        isDragging && "opacity-50 bg-accent",
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        aria-label={`Drag to reorder ${columnName} column`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Visibility Toggle (Eye icon) */}
      <button
        type="button"
        onClick={() => column.toggleVisibility(!column.getIsVisible())}
        aria-pressed={column.getIsVisible()}
        aria-label={`Toggle ${columnName} column visibility`}
        className="p-1 rounded hover:bg-accent transition-colors"
      >
        {column.getIsVisible() ? (
          <Eye className={cn("h-4 w-4 text-emerald-600")} aria-hidden="true" />
        ) : (
          <EyeOff className={cn("h-4 w-4 text-red-600")} aria-hidden="true" />
        )}
      </button>

      {/* Column Name */}
      <div className="flex-1 text-sm font-medium truncate" title={columnName}>
        {columnName}
      </div>

      {/* Width Display/Edit */}
      <div className="flex items-center gap-1">
        {isEditingWidth ? (
          <Input
            type="number"
            value={width}
            onChange={handleWidthChange}
            onBlur={applyClampedWidth}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") applyClampedWidth();
            }}
            className="w-20 h-7 text-xs"
            min={(column.columnDef.minSize as number) || 40}
            max={(column.columnDef.maxSize as number) || 1000}
            aria-label={`Edit ${columnName} column width`}
          />
        ) : (
          <button
            onClick={() => setIsEditingWidth(true)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
            title="Click to edit width"
            aria-label={`${columnName} column width: ${width} pixels. Click to edit.`}
          >
            {width}px
          </button>
        )}
      </div>

      {/* Spacer for alignment */}
    </div>
  );
}
