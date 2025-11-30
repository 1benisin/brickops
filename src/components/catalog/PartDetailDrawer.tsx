"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AddPartToInventoryDialog } from "@/components/inventory/dialogs/AddPartToInventoryDialog";
import { RefreshPartDetialsButton } from "@/components/catalog/RefreshPartDetialsButton";
import { ColorSelect } from "@/components/catalog/ColorSelect";
import { PartPriceGuide } from "@/components/catalog/PartPriceGuide";
import { useGetPart } from "@/hooks/useGetPart";
import { useGetPartColors } from "@/hooks/useGetPartColors";
import { ColorPartImage } from "@/components/common/ColorPartImage";
import { useEffect } from "react";

export type PartDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partNumber: string | null;
};

/**
 * Part detail drawer using reactive hooks
 * Automatically fetches and refreshes part data as needed
 */
export function PartDetailDrawer({ open, onOpenChange, partNumber }: PartDetailDrawerProps) {
  // Hooks handle memoization internally
  const {
    data: part,
    isLoading: partLoading,
    status: partStatus,
    isRefreshing: partIsRefreshing,
  } = useGetPart(partNumber);
  const { data: colors, status: colorsStatus } = useGetPartColors(partNumber);

  // Selected color state for price guide
  const [selectedColorId, setSelectedColorId] = useState<string>("");

  // Auto-select first color when colors load
  useEffect(() => {
    if (!selectedColorId && colors && colors.length > 0) {
      setSelectedColorId(colors[0].colorId.toString());
    }
  }, [colors, selectedColorId]);

  // Image handled by ColorPartImage component
  const selectedColorIdNumber = selectedColorId ? parseInt(selectedColorId, 10) : null;

  // Overlay is still a simple query (no refresh needed)
  const overlayArgs = open && partNumber ? { partNumber } : "skip";
  const overlay = useQuery(api.catalog.parts.getPartOverlay, overlayArgs);
  const overlayLoading = open && partNumber && overlay === undefined;

  const [addToInventoryOpen, setAddToInventoryOpen] = useState(false);

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="h-[calc(100vh-100px)] flex flex-col gap-2 px-6"
          data-testid="catalog-detail"
        >
          <DrawerHeader className="flex justify-between items-center p-0 flex-shrink-0">
            <DrawerTitle className="">{part?.name ?? "Part details"}</DrawerTitle>
            <RefreshPartDetialsButton partNumber={partNumber} />
            <DrawerDescription className="sr-only">
              {part?.name ?? "Part details"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto">
            {partLoading ? (
              <div className="space-y-4" data-testid="catalog-detail-loading">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-36" />
              </div>
            ) : partStatus === "missing" && !partIsRefreshing ? (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
                data-testid="catalog-detail-error"
              >
                Part not found in catalog. A background fetch has been queued - please try again in
                a few moments.
              </div>
            ) : !part ? (
              <p className="text-sm text-muted-foreground">Select a part to view details.</p>
            ) : (
              <div className="flex flex-col gap-4" data-testid="catalog-detail-content">
                {/* Part Image and Information */}
                <section className="flex gap-6">
                  {/* Part Image */}
                  {
                    <div className="relative h-64 w-64 flex-shrink-0">
                      <ColorPartImage
                        partNumber={partNumber}
                        colorId={selectedColorIdNumber}
                        alt={part.name}
                        fill
                        sizes="256px"
                        unoptimized
                      />
                    </div>
                  }

                  {/* Part Information */}
                  <div className="flex-1 space-y-2 text-sm">
                    <h3 className="text-sm font-semibold text-foreground">Part information</h3>
                    <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt className="font-medium text-foreground">Part number</dt>
                        <dd>{part.partNumber}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Category</dt>
                        <dd>{part.categoryName ?? "Unknown"}</dd>
                      </div>
                      {part.weight && (
                        <div>
                          <dt className="font-medium text-foreground">Weight</dt>
                          <dd>{part.weight}g</dd>
                        </div>
                      )}
                      <div>
                        <dt className="font-medium text-foreground">Sort location</dt>
                        <dd>
                          {overlayLoading ? (
                            <Skeleton className="h-4 w-16" />
                          ) : overlay?.sortLocation ? (
                            overlay.sortLocation
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                    </dl>
                    {part.description ? (
                      <p className="text-xs text-muted-foreground">{part.description}</p>
                    ) : null}
                  </div>
                </section>

                {/* Color Selection and Actions */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Select color</h3>
                      <StatusBadge status={colorsStatus} label="Colors" />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setAddToInventoryOpen(true)}
                      data-testid="catalog-detail-add-to-inventory"
                    >
                      Add to Inventory
                    </Button>
                  </div>

                  {!colors || colors.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No color availability found for this part.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <ColorSelect
                        partNumber={partNumber}
                        value={selectedColorId}
                        onChange={setSelectedColorId}
                        placeholder="Select a color to view pricing..."
                        className="w-full"
                      />

                      {/* Show price guide when color is selected */}
                      {selectedColorId && (
                        <PartPriceGuide partNumber={partNumber} colorId={selectedColorId} />
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      <AddPartToInventoryDialog
        open={addToInventoryOpen}
        onOpenChange={setAddToInventoryOpen}
        partNumber={part?.partNumber ?? null}
      />
    </>
  );
}

/**
 * Status badge showing resource freshness
 */
function StatusBadge({
  label,
  status,
}: {
  label: string;
  status?: "fresh" | "stale" | "missing" | "refreshing";
}) {
  if (!status) return null;

  const statusConfig = {
    fresh: { color: "bg-green-100 text-green-700 dark:bg-green-900/30", text: "✓" },
    stale: { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30", text: "⟳" },
    missing: { color: "bg-red-100 text-red-700 dark:bg-red-900/30", text: "✗" },
    refreshing: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30", text: "..." },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color}`}
      title={`${label}: ${status}`}
    >
      {config.text}
    </span>
  );
}
