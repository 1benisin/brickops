import { useState } from "react";
import type {
  PartIdentificationResult,
  PartIdentificationItem,
} from "@/lib/services/part-identification-service";

export type AddItemWorkflowStage = "idle" | "capturing" | "viewing_results" | "adding_to_inventory";

/**
 * Custom hook to manage the add item camera workflow
 * Handles: camera capture → identification results → add to inventory dialog
 */
export function useAddItemWorkflow() {
  const [addItemStage, setAddItemStage] = useState<AddItemWorkflowStage>("idle");
  const [identificationResults, setIdentificationResults] =
    useState<PartIdentificationResult | null>(null);
  const [partNumberForAdd, setPartNumberForAdd] = useState<string | null>(null);

  const handleAddItemsClick = () => {
    setAddItemStage("capturing");
  };

  const handleIdentificationComplete = (results: PartIdentificationResult) => {
    setIdentificationResults(results);
    setAddItemStage("viewing_results");
  };

  const handleResultSelected = (item: PartIdentificationItem) => {
    // Store the part number and proceed to add dialog
    setPartNumberForAdd(item.id); // Brickognize returns part number as 'id'
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
