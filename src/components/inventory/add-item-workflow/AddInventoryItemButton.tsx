"use client";

import { Plus } from "lucide-react";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { SearchOrCaptureDialog } from "../dialogs/SearchOrCaptureDialog";
import { IdentificationResultsList } from "./IdentificationResultsList";
import { AddPartToInventoryDialog } from "../dialogs/AddPartToInventoryDialog";
import { useAddItemWorkflow } from "@/hooks/useAddItemWorkflow";

export interface AddInventoryItemButtonProps {
  /** Button styling variant */
  variant?: ButtonProps["variant"];
  /** Button size */
  size?: ButtonProps["size"];
  /** Additional CSS class names */
  className?: string;
}

/**
 * All-in-one button for adding inventory items through camera capture OR catalog search.
 * Encapsulates the entire workflow: camera/search → results → add to inventory
 *
 * Usage:
 * - General inventory: <AddInventoryItemButton onItemAdded={() => refetch()} />
 */
export function AddInventoryItemButton({
  variant = "default",
  size = "default",
  className,
}: AddInventoryItemButtonProps) {
  const {
    addItemStage,
    setAddItemStage,
    identificationResults,
    partNumberForAdd,
    handleAddItemsClick,
    handleIdentificationComplete,
    handleResultSelected,
    handleAddDialogClose,
    handleRetakePhoto,
  } = useAddItemWorkflow();

  return (
    <>
      {/* Trigger Button */}
      <Button onClick={handleAddItemsClick} variant={variant} size={size} className={className}>
        <Plus className="h-4 w-4 mr-2" />
        Add Item
      </Button>

      {/* Search or Capture Dialog (replaces CameraCapture) */}
      <SearchOrCaptureDialog
        open={addItemStage === "capturing"}
        onOpenChange={(open) => {
          if (!open) setAddItemStage("idle");
        }}
        onResults={handleIdentificationComplete}
        onError={(error) => {
          console.error("Search/capture error:", error);
          setAddItemStage("idle");
        }}
      />

      {/* Identification Results Sheet */}
      {identificationResults && (
        <IdentificationResultsList
          open={addItemStage === "viewing_results"}
          onOpenChange={(open) => {
            if (!open) setAddItemStage("idle");
          }}
          results={identificationResults}
          onSelectResult={handleResultSelected}
          onRetake={handleRetakePhoto}
        />
      )}

      {/* Add Part to Inventory Sheet */}
      <AddPartToInventoryDialog
        open={addItemStage === "adding_to_inventory"}
        onOpenChange={(open) => {
          if (!open) handleAddDialogClose();
        }}
        partNumber={partNumberForAdd}
      />
    </>
  );
}
