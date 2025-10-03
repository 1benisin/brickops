"use client";

import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import type { CatalogPart } from "@/types/catalog";

export type CatalogResultCardProps = {
  part: CatalogPart;
  onSelect: (part: CatalogPart) => void;
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
      <CardContent className="flex flex-1 flex-col gap-2 p-2">
        <div className="relative h-24 overflow-hidden rounded-md border border-border bg-muted/50">
          {part.imageUrl ? (
            <Image
              src={part.imageUrl}
              alt={part.name}
              fill
              className="object-contain"
              sizes="160px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="line-clamp-2 text-xs font-medium text-foreground">{part.name}</p>
          <p className="text-[11px] text-muted-foreground">#{part.partNumber}</p>
        </div>
      </CardContent>
    </Card>
  );
}
