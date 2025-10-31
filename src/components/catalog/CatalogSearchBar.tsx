"use client";

import { FormEvent, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

export type CatalogSearchBarProps = {
  sortLocation: string;
  partTitle: string;
  partId: string;
  onSortLocationChange: (value: string) => void;
  onPartTitleChange: (value: string) => void;
  onPartIdChange: (value: string) => void;
  onSubmit?: () => void;
  isLoading?: boolean;
  showLocationSearch?: boolean;
};

export function CatalogSearchBar({
  sortLocation,
  partTitle,
  partId,
  onSortLocationChange,
  onPartTitleChange,
  onPartIdChange,
  onSubmit,
  isLoading: _isLoading = false,
  showLocationSearch = false,
}: CatalogSearchBarProps) {
  const [localSortLocation, setLocalSortLocation] = useState(sortLocation);
  const [localPartTitle, setLocalPartTitle] = useState(partTitle);
  const [localPartId, setLocalPartId] = useState(partId);

  // Track which field is currently focused/active for search
  // Initialize based on which field has a value, or default to first available
  const [activeField, setActiveField] = useState<"location" | "title" | "id" | null>(() => {
    if (sortLocation) return "location";
    if (partTitle) return "title";
    if (partId) return "id";
    return showLocationSearch ? "location" : "title";
  });

  // Keep local state in sync if parent props change externally
  // Only sync if the field is currently active (so we don't lose values when switching fields)
  useEffect(() => {
    if (activeField === "location") {
      setLocalSortLocation(sortLocation);
    }
  }, [sortLocation, activeField]);

  useEffect(() => {
    if (activeField === "title") {
      setLocalPartTitle(partTitle);
    }
  }, [partTitle, activeField]);

  useEffect(() => {
    if (activeField === "id") {
      setLocalPartId(partId);
    }
  }, [partId, activeField]);

  // Handle switching active fields - clear previous and activate new
  useEffect(() => {
    if (activeField === "location") {
      // Clear other fields
      if (partTitle) onPartTitleChange("");
      if (partId) onPartIdChange("");
      // Send location value if it exists
      if (localSortLocation) {
        onSortLocationChange(localSortLocation);
      } else if (sortLocation) {
        // Clear if switching to location but no local value
        onSortLocationChange("");
      }
    } else if (activeField === "title") {
      // Clear other fields
      if (sortLocation) onSortLocationChange("");
      if (partId) onPartIdChange("");
      // Send title value if it exists
      if (localPartTitle) {
        onPartTitleChange(localPartTitle);
      } else if (partTitle) {
        // Clear if switching to title but no local value
        onPartTitleChange("");
      }
    } else if (activeField === "id") {
      // Clear other fields
      if (sortLocation) onSortLocationChange("");
      if (partTitle) onPartTitleChange("");
      // Send id value if it exists
      if (localPartId) {
        onPartIdChange(localPartId);
      } else if (partId) {
        // Clear if switching to id but no local value
        onPartIdChange("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeField]); // Only run when activeField changes

  // Debounce notifying parent when active field's value changes (300ms)
  useEffect(() => {
    if (activeField === "location") {
      if (localSortLocation === sortLocation) return;
      const id = window.setTimeout(() => onSortLocationChange(localSortLocation), 300);
      return () => window.clearTimeout(id);
    }
  }, [localSortLocation, sortLocation, onSortLocationChange, activeField]);

  useEffect(() => {
    if (activeField === "title") {
      if (localPartTitle === partTitle) return;
      const id = window.setTimeout(() => onPartTitleChange(localPartTitle), 300);
      return () => window.clearTimeout(id);
    }
  }, [localPartTitle, partTitle, onPartTitleChange, activeField]);

  useEffect(() => {
    if (activeField === "id") {
      if (localPartId === partId) return;
      const id = window.setTimeout(() => onPartIdChange(localPartId), 300);
      return () => window.clearTimeout(id);
    }
  }, [localPartId, partId, onPartIdChange, activeField]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.();
  };

  // Conditional grid columns based on location visibility
  const gridColsClass = showLocationSearch ? "sm:grid-cols-12" : "sm:grid-cols-10";
  const partNameSpan = showLocationSearch ? "sm:col-span-6" : "sm:col-span-7";

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 shadow-sm transition"
      onSubmit={handleSubmit}
      data-testid="catalog-search-form"
    >
      <div className={`flex flex-col gap-3 sm:grid ${gridColsClass} sm:gap-3`}>
        <div className={`flex flex-col gap-1 ${partNameSpan}`}>
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
            className={`w-full transition-all ${
              activeField === "title" ? "ring-2 ring-primary ring-offset-2" : ""
            }`}
            value={localPartTitle}
            onChange={(event) => setLocalPartTitle(event.target.value)}
            onFocus={() => setActiveField("title")}
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
            className={`w-full transition-all ${
              activeField === "id" ? "ring-2 ring-primary ring-offset-2" : ""
            }`}
            value={localPartId}
            onChange={(event) => setLocalPartId(event.target.value)}
            onFocus={() => setActiveField("id")}
          />
        </div>

        {showLocationSearch && (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label
              htmlFor="catalog-search-location"
              className="text-xs font-medium text-muted-foreground"
            >
              By Location
            </label>
            <Input
              id="catalog-search-location"
              data-testid="catalog-search-location"
              placeholder="e.g. A-99 or 2456"
              className={`w-full transition-all ${
                activeField === "location" ? "ring-2 ring-primary ring-offset-2" : ""
              }`}
              value={localSortLocation}
              onChange={(event) => setLocalSortLocation(event.target.value)}
              onFocus={() => setActiveField("location")}
            />
          </div>
        )}
      </div>
    </form>
  );
}
