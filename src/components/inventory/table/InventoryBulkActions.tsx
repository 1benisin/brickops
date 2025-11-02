"use client";

import { Button } from "@/components/ui/button";
import { Trash2, Archive } from "lucide-react";
import type { InventoryItem } from "@/types/inventory";

interface InventoryBulkActionsProps {
  selectedRows: InventoryItem[];
}

export function InventoryBulkActions({ selectedRows }: InventoryBulkActionsProps) {
  const handleDelete = () => {
    // TODO: Implement delete action
    console.log("Delete", selectedRows);
    // Could call a mutation here to delete selected items
  };

  const handleArchive = () => {
    // TODO: Implement archive action
    console.log("Archive", selectedRows);
    // Could call a mutation here to archive selected items
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleArchive}
        disabled={selectedRows.length === 0}
      >
        <Archive className="mr-2 h-4 w-4" />
        Archive ({selectedRows.length})
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={selectedRows.length === 0}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete ({selectedRows.length})
      </Button>
    </>
  );
}

