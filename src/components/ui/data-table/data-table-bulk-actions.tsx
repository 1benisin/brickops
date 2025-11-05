"use client";

import * as React from "react";

interface DataTableBulkActionsProps<TData> {
  selectedCount: number;
  children?: React.ReactNode;
}

export function DataTableBulkActions<TData>({
  selectedCount,
  children,
}: DataTableBulkActionsProps<TData>) {
  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded-md mb-2">
      <div className="text-sm text-muted-foreground">
        {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
      </div>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}

