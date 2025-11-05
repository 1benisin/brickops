"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableColumnItem } from "./sortable-column-item";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
  onResetAll: () => void;
  className?: string;
}

export function DataTableViewOptions<TData>({
  table,
  onResetAll,
  className,
}: DataTableViewOptionsProps<TData>) {
  const allLeafColumns = table.getAllLeafColumns();
  const hideableColumns = allLeafColumns.filter((column) => column.getCanHide());
  const currentColumnOrder = table.getState().columnOrder;

  const fullColumnOrder = React.useMemo(() => {
    if (currentColumnOrder.length === 0) {
      return allLeafColumns.map((col) => col.id);
    }
    return currentColumnOrder;
  }, [currentColumnOrder, allLeafColumns]);

  // Handler for drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Work with the complete column order
      const completeOrder =
        fullColumnOrder.length > 0 ? fullColumnOrder : allLeafColumns.map((c) => c.id);

      const oldIndex = completeOrder.indexOf(active.id as string);
      const newIndex = completeOrder.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) return;

      // Create new order with all columns
      const newOrder = [...completeOrder];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as string);

      // Set the complete column order
      table.setColumnOrder(newOrder);
    }
  };

  // Get the column IDs to use for sorting (only hideable columns for display)
  const sortableColumnIds = React.useMemo(() => {
    // Filter the full column order to only show hideable columns
    const orderedHideableIds = fullColumnOrder.filter((id) => {
      const col = table.getColumn(id);
      return col && col.getCanHide();
    });

    // Defensive check: If filtering eliminated columns (stale IDs), fall back to current hideable columns
    if (orderedHideableIds.length > 0 && orderedHideableIds.length < hideableColumns.length) {
      console.warn(
        "[ColumnManager] Some saved column IDs not found in current table, using fallback",
      );
      return hideableColumns.map((c) => c.id);
    }

    // If we got results, use them; otherwise fall back to current hideable columns
    return orderedHideableIds.length > 0 ? orderedHideableIds : hideableColumns.map((c) => c.id);
  }, [fullColumnOrder, hideableColumns, table]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className || "ml-auto mb-2"}>
          <Settings2 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[350px]">
        <div className="p-2">
          <div className="text-sm font-medium mb-2">Customize Columns</div>
          <div className="text-xs text-muted-foreground mb-3">
            Toggle visibility, adjust width, and reorder columns
          </div>
          <Separator className="mb-2" />

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableColumnIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {sortableColumnIds.map((columnId) => {
                  const column = table.getColumn(columnId);
                  if (!column || !column.getCanHide()) return null;

                  return <SortableColumnItem key={column.id} column={column} table={table} />;
                })}
              </div>
            </SortableContext>
          </DndContext>

          <Separator className="my-2" />

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.resetColumnVisibility()}
                className="flex-1"
              >
                Reset Visibility
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.resetColumnSizing()}
                className="flex-1"
              >
                Reset Sizes
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Reset all table state and clear localStorage
                onResetAll();
              }}
              className="w-full"
            >
              Reset All
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
