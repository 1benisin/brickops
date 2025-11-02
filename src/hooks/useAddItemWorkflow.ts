import { useState } from "react";
import type {
  UnifiedSearchResult,
  UnifiedResultItem,
} from "@/components/inventory/dialogs/SearchOrCaptureDialog";

export type AddItemWorkflowStage = "idle" | "capturing" | "viewing_results" | "adding_to_inventory";

/**
 * Custom hook to manage the add item workflow
 * Handles: camera capture OR catalog search → identification results → add to inventory dialog
 */
export function useAddItemWorkflow() {
  const [addItemStage, setAddItemStage] = useState<AddItemWorkflowStage>("idle");
  const [identificationResults, setIdentificationResults] = useState<UnifiedSearchResult | null>(
    null,
  );
  const [partNumberForAdd, setPartNumberForAdd] = useState<string | null>(null);

  const handleAddItemsClick = () => {
    setAddItemStage("capturing");
  };

  const handleIdentificationComplete = (results: UnifiedSearchResult) => {
    setIdentificationResults(results);
    setAddItemStage("viewing_results");
  };

  const handleResultSelected = (item: UnifiedResultItem) => {
    // Store the part number and proceed to add dialog
    setPartNumberForAdd(item.id); // 'id' is the part number in both camera and search results
    setAddItemStage("adding_to_inventory");
  };

  const handleAddDialogClose = () => {
    setAddItemStage("idle");
    setIdentificationResults(null);
    setPartNumberForAdd(null);
  };

  const handleRetakePhoto = () => {
    setIdentificationResults(null);
    setAddItemStage("capturing");
  };

  return {
    addItemStage,
    setAddItemStage,
    identificationResults,
    partNumberForAdd,
    handleAddItemsClick,
    handleIdentificationComplete,
    handleResultSelected,
    handleAddDialogClose,
    handleRetakePhoto,
  };
}
