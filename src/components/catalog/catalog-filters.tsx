"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogFilterCategory, CatalogFilterColor } from "@/lib/services/catalog-service";

export type CatalogFiltersProps = {
  colors: CatalogFilterColor[];
  categories: CatalogFilterCategory[];
  loading?: boolean;
  onToggleColor: (colorId: number) => void;
  onToggleCategory: (categoryId: number) => void;
  onReset: () => void;
};

export function CatalogFilters({
  colors,
  categories,
  loading = false,
  onToggleColor,
  onToggleCategory,
  onReset,
}: CatalogFiltersProps) {
  if (loading) {
    return (
      <div className="grid gap-3 rounded-lg border border-border bg-card/60 p-4 shadow-sm">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-32" />
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 rounded-lg border border-border bg-card/60 p-4 shadow-sm"
      data-testid="catalog-filters"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Filters</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          data-testid="catalog-filters-reset"
          className="h-7 px-2 text-xs"
        >
          Reset
        </Button>
      </div>

      <section className="space-y-2">
        <header className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Colors
        </header>
        {colors.length === 0 ? (
          <p className="text-xs text-muted-foreground">No color metadata available yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const swatch = color.rgb ? `#${color.rgb}` : undefined;
              return (
                <button
                  key={color.id}
                  type="button"
                  data-testid={`catalog-filter-color-${color.id}`}
                  onClick={() => onToggleColor(color.id)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${color.active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-full border border-border"
                    style={{ backgroundColor: swatch ?? "var(--muted)" }}
                  />
                  <span className="font-medium">{color.name}</span>
                  <span className="text-muted-foreground">{color.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <header className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </header>
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">No categories available.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                data-testid={`catalog-filter-category-${category.id}`}
                onClick={() => onToggleCategory(category.id)}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${category.active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
              >
                <span className="font-medium">{category.name}</span>
                <span>{category.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
