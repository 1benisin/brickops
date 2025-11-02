"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface DataTableBulkActionsProps<TData> {
  selectedCount: number;
  onClearSelection: () => void;
  children?: React.ReactNode;
}

export function DataTableBulkActions<TData>({
  selectedCount,
  onClearSelection,
  children,
}: DataTableBulkActionsProps<TData>) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded-md mb-2">
      <div className="text-sm text-muted-foreground">
        {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          aria-label="Clear selection"
        >
          <X className="h-4 w-4 mr-2" />
          Clear selection
        </Button>
      </div>
    </div>
  );
}

