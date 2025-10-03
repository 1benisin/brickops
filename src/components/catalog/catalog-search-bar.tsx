"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CatalogSearchBarProps = {
  gridBin: string;
  partTitle: string;
  partId: string;
  onGridBinChange: (value: string) => void;
  onPartTitleChange: (value: string) => void;
  onPartIdChange: (value: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  isLoading?: boolean;
};

export function CatalogSearchBar({
  gridBin,
  partTitle,
  partId,
  onGridBinChange,
  onPartTitleChange,
  onPartIdChange,
  onSubmit,
  onClear,
  isLoading: _isLoading = false,
}: CatalogSearchBarProps) {
  const [localGridBin, setLocalGridBin] = useState(gridBin);
  const [localPartTitle, setLocalPartTitle] = useState(partTitle);
  const [localPartId, setLocalPartId] = useState(partId);
  const activeField: "bin" | "title" | "id" | null = localGridBin
    ? "bin"
    : localPartTitle
      ? "title"
      : localPartId
        ? "id"
        : null;

  // Keep local state in sync if parent props change externally (e.g., Clear action)
  useEffect(() => {
    setLocalGridBin(gridBin);
  }, [gridBin]);

  useEffect(() => {
    setLocalPartTitle(partTitle);
  }, [partTitle]);

  useEffect(() => {
    setLocalPartId(partId);
  }, [partId]);

  // Debounce notifying parent of changes for each input (300ms)
  useEffect(() => {
    if (localGridBin === gridBin) return;
    const id = window.setTimeout(() => onGridBinChange(localGridBin), 300);
    return () => window.clearTimeout(id);
  }, [localGridBin, gridBin, onGridBinChange]);

  useEffect(() => {
    if (localPartTitle === partTitle) return;
    const id = window.setTimeout(() => onPartTitleChange(localPartTitle), 300);
    return () => window.clearTimeout(id);
  }, [localPartTitle, partTitle, onPartTitleChange]);

  useEffect(() => {
    if (localPartId === partId) return;
    const id = window.setTimeout(() => onPartIdChange(localPartId), 300);
    return () => window.clearTimeout(id);
  }, [localPartId, partId, onPartIdChange]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.();
  };

  const handleClear = () => {
    setLocalGridBin("");
    setLocalPartTitle("");
    setLocalPartId("");
    onClear?.();
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 shadow-sm transition"
      onSubmit={handleSubmit}
      data-testid="catalog-search-form"
    >
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-12 sm:gap-3">
        <div className="flex flex-col gap-1 sm:col-span-6">
          <label
            htmlFor="catalog-search-title"
            className="text-xs font-medium text-muted-foreground"
          >
            By Part Name
          </label>
          <Input
            id="catalog-search-title"
            data-testid="catalog-search-title"
            placeholder="brick 2 x 2, slope, plate..."
            className={`w-full ${activeField && activeField !== "title" ? "opacity-50" : ""}`}
            disabled={activeField !== null && activeField !== "title"}
            value={localPartTitle}
            onChange={(event) => setLocalPartTitle(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-3">
          <label htmlFor="catalog-search-id" className="text-xs font-medium text-muted-foreground">
            By Part Id
          </label>
          <Input
            id="catalog-search-id"
            data-testid="catalog-search-id"
            placeholder="e.g. 3001"
            className={`w-full ${activeField && activeField !== "id" ? "opacity-50" : ""}`}
            disabled={activeField !== null && activeField !== "id"}
            value={localPartId}
            onChange={(event) => setLocalPartId(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="catalog-search-bin" className="text-xs font-medium text-muted-foreground">
            By Part Bin
          </label>
          <Input
            id="catalog-search-bin"
            data-testid="catalog-search-bin"
            placeholder="e.g. A-99 or 2456"
            className={`w-full ${activeField && activeField !== "bin" ? "opacity-50" : ""}`}
            disabled={activeField !== null && activeField !== "bin"}
            value={localGridBin}
            onChange={(event) => setLocalGridBin(event.target.value)}
          />
        </div>

        <div className="flex items-end justify-end sm:col-span-1">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            data-testid="catalog-search-clear"
          >
            Clear
          </Button>
        </div>
      </div>
    </form>
  );
}
