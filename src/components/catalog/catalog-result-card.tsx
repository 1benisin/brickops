"use client";

import Image from "next/image";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { CatalogPart } from "@/lib/services/catalog-service";

export type CatalogResultCardProps = {
  part: CatalogPart;
  onSelect: (part: CatalogPart) => void;
};

const freshnessClasses: Record<CatalogPart["dataFreshness"], string> = {
  fresh: "bg-emerald-100 text-emerald-700 border-emerald-200",
  stale: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-rose-100 text-rose-700 border-rose-200",
};

export function CatalogResultCard({ part, onSelect }: CatalogResultCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(part)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(part);
        }
      }}
      className="flex h-full flex-col cursor-pointer border-border transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-ring"
      data-testid={`catalog-result-card-${part.partNumber}`}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground">{part.name}</CardTitle>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${freshnessClasses[part.dataFreshness]}`}
          >
            {part.dataFreshness}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">#{part.partNumber}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="relative h-32 overflow-hidden rounded-md border border-border bg-muted/50">
          {part.imageUrl ? (
            <Image
              src={part.imageUrl}
              alt={part.name}
              fill
              className="object-contain"
              sizes="200px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground">Category</dt>
            <dd>{part.category ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Data source</dt>
            <dd className="capitalize">{part.dataSource}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Colors</dt>
            <dd>{part.availableColorIds.length || (part.primaryColorId ? 1 : 0)}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Sort bin</dt>
            <dd>{part.sortGrid ? `${part.sortGrid}${part.sortBin ?? ""}` : "—"}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <span>
          Updated {new Date(part.lastUpdated).toLocaleDateString()} ·{" "}
          {part.marketPrice ? `$${part.marketPrice.toFixed(2)}` : "No pricing"}
        </span>
        <span className="font-semibold text-primary">Details →</span>
      </CardFooter>
    </Card>
  );
}
