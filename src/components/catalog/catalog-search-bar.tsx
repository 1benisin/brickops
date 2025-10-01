"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FRESHNESS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "fresh", label: "Fresh" },
  { value: "stale", label: "Stale" },
  { value: "expired", label: "Expired" },
] as const;

export type FreshnessFilter = "all" | "fresh" | "stale" | "expired";

export type CatalogSearchBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit?: () => void;
  isLoading?: boolean;
  freshness: FreshnessFilter;
  onFreshnessChange: (value: FreshnessFilter) => void;
};

export function CatalogSearchBar({
  query,
  onQueryChange,
  onSubmit,
  isLoading = false,
  freshness,
  onFreshnessChange,
}: CatalogSearchBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 shadow-sm transition"
      onSubmit={handleSubmit}
      data-testid="catalog-search-form"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="catalog-search" className="text-sm font-medium text-muted-foreground">
          Search parts
        </label>
        <div className="flex flex-1 gap-2">
          <Input
            id="catalog-search"
            data-testid="catalog-search-input"
            placeholder="Search by part number, name, keywords..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" data-testid="catalog-search-submit" disabled={isLoading}>
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          Tip: combine keywords like 3001 red brick or bin B to jump directly.
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor="catalog-freshness" className="text-xs font-medium text-muted-foreground">
            Freshness
          </label>
          <select
            id="catalog-freshness"
            data-testid="catalog-search-freshness"
            value={freshness}
            onChange={(event) => onFreshnessChange(event.target.value as FreshnessFilter)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {FRESHNESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}
