"use client";

import { useState } from "react";
import Image from "next/image";
import type { UnifiedSearchResult, UnifiedResultItem } from "../dialogs/SearchOrCaptureDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Camera, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IdentificationResultsListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: UnifiedSearchResult;
  onSelectResult: (item: UnifiedResultItem) => void;
  onRetake: () => void;
}

const formatConfidence = (score: number): string => `${Math.round(score * 100)}%`;

const getConfidenceBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
  if (score >= 0.9) return "default"; // Green (high confidence)
  if (score >= 0.7) return "secondary"; // Yellow/orange (medium confidence)
  return "destructive"; // Red (low confidence)
};

const getConfidenceColor = (score: number): string => {
  if (score >= 0.9) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 0.7) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
};

function IdentificationResultItem({
  item,
  index,
  source,
  isLoading,
  onSelect,
}: {
  item: UnifiedResultItem;
  index: number;
  source: "camera" | "search";
  isLoading: boolean;
  onSelect: (item: UnifiedResultItem) => void;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        isLoading && "opacity-60 pointer-events-none",
      )}
      onClick={() => !isLoading && onSelect(item)}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          {/* Part Image */}
          <div className="flex-shrink-0">
            {item.imageUrl && !imageError ? (
              <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-lg border border-border/60 bg-muted/40">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  className="object-contain p-2"
                  sizes="(max-width: 640px) 112px, 128px"
                  unoptimized
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-center text-xs text-muted-foreground sm:h-32 sm:w-32">
                No image
              </div>
            )}
          </div>

          {/* Part Info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm sm:text-base leading-tight line-clamp-2">
                {item.name}
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <span className="font-mono">Part: {item.id}</span>
              {item.category && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="truncate">{item.category}</span>
                </>
              )}
            </div>

            {/* Confidence Badge or Source Badge */}
            <div className="flex items-center gap-2">
              {source === "camera" && item.score !== undefined ? (
                <>
                  <Badge
                    variant={getConfidenceBadgeVariant(item.score)}
                    className={cn("text-xs font-semibold", getConfidenceColor(item.score))}
                  >
                    {formatConfidence(item.score)} Confidence
                  </Badge>
                  {index === 0 && <span className="text-xs text-muted-foreground">Top match</span>}
                </>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Catalog Match
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function IdentificationResultsList({
  open,
  onOpenChange,
  results,
  onSelectResult,
  onRetake,
}: IdentificationResultsListProps) {
  const hasResults = results.items.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <div className="flex flex-col max-h-[85vh]">
          <div className="flex-shrink-0">
            <SheetTitle>
              {results.source === "camera"
                ? "Camera Identification Results"
                : "Catalog Search Results"}
            </SheetTitle>
            <SheetDescription>
              {results.source === "camera"
                ? "Review identified parts and select one to add to inventory"
                : "Select a part from the catalog to add to inventory"}
            </SheetDescription>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto min-h-0 mt-4">
            {!hasResults ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center p-6">
                <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    {results.source === "camera" ? "No Parts Identified" : "No Results Found"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {results.source === "camera"
                      ? "We couldn't identify any LEGO parts in the image. Try retaking the photo with better lighting or a different angle."
                      : "No parts found matching your search. Try a different search term."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {results.items.map((item, index) => (
                  <IdentificationResultItem
                    key={`${item.id}-${index}`}
                    item={item}
                    index={index}
                    source={results.source}
                    isLoading={false}
                    onSelect={onSelectResult}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={onRetake} className="w-full" size="lg">
              {results.source === "camera" ? (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Retake Photo
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Again
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
