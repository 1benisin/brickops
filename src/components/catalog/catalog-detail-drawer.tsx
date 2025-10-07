"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { CatalogPart, CatalogPartDetails } from "@/types/catalog";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type CatalogDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part?: CatalogPart | null;
  details?: CatalogPartDetails | null;
  loading?: boolean;
  onRefresh?: () => void;
  refreshLoading?: boolean;
  error?: string | null;
};

export function CatalogDetailDrawer({
  open,
  onOpenChange,
  part,
  details,
  loading = false,
  onRefresh,
  refreshLoading = false,
  error,
}: CatalogDetailDrawerProps) {
  const overlayArgs = open && part?.partNumber ? { partNumber: part.partNumber } : "skip";
  const overlay = useQuery(api.functions.catalog.getPartOverlay, overlayArgs);
  const overlayLoading = open && part?.partNumber && overlay === undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-xl" data-testid="catalog-detail">
        <SheetHeader>
          <SheetTitle className="text-left text-lg font-semibold">
            {part?.name ?? "Part details"}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4" data-testid="catalog-detail-loading">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-36" />
          </div>
        ) : error ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            data-testid="catalog-detail-error"
          >
            {error}
          </div>
        ) : !details ? (
          <p className="text-sm text-muted-foreground">Select a part to view details.</p>
        ) : (
          <div
            className="flex flex-1 flex-col gap-4 overflow-y-auto"
            data-testid="catalog-detail-content"
          >
            <section className="space-y-1 text-sm">
              <h3 className="text-sm font-semibold text-foreground">Part information</h3>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt className="font-medium text-foreground">Part number</dt>
                  <dd>{details.partNumber}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Bricklink ID</dt>
                  <dd>{details.bricklinkPartId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Category</dt>
                  <dd>{details.category ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Data source</dt>
                  <dd className="capitalize">{details.dataSource}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Freshness</dt>
                  <dd className="capitalize">{details.dataFreshness}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Next refresh</dt>
                  <dd>
                    {details.refresh
                      ? new Date(details.refresh.nextRefreshAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Sort location</dt>
                  <dd>
                    {overlayLoading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : overlay?.sortGrid ? (
                      `${overlay.sortGrid}${overlay.sortBin ?? ""}`
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {details.description ? (
                <p className="text-xs text-muted-foreground">{details.description}</p>
              ) : null}
            </section>

            <section className="space-y-2 text-sm">
              <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Market pricing</h3>
                {onRefresh ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={refreshLoading}
                    data-testid="catalog-detail-refresh"
                  >
                    {refreshLoading ? "Refreshing…" : "Refresh data"}
                  </Button>
                ) : null}
              </header>
              {details.refresh ? (
                <p className="text-xs text-muted-foreground">
                  {details.refresh.shouldRefresh
                    ? "Refresh recommended based on freshness window."
                    : "Data is within the freshness window."}
                </p>
              ) : null}
              {details.marketPricing ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">
                    {details.marketPricing.currency}{" "}
                    {details.marketPricing.amount?.toFixed(2) ?? "N/A"}
                  </div>
                  <div>
                    Updated{" "}
                    {details.marketPricing.lastSyncedAt
                      ? new Date(details.marketPricing.lastSyncedAt).toLocaleString()
                      : "—"}
                  </div>
                  <div>Status: {details.bricklinkStatus}</div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No pricing data available.</p>
              )}
            </section>

            <section className="space-y-2 text-sm">
              <h3 className="text-sm font-semibold text-foreground">Available colors</h3>
              {details.colorAvailability.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No color availability found for this part.
                </p>
              ) : (
                <ul
                  className="grid gap-2 text-xs text-muted-foreground"
                  data-testid="catalog-detail-colors"
                >
                  {details.colorAvailability.map((entry) => (
                    <li
                      key={`${entry.colorId}-${entry.elementIds.join("-")}`}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-full border border-border"
                          style={{
                            backgroundColor: entry.color?.rgb
                              ? `#${entry.color.rgb}`
                              : "var(--muted)",
                          }}
                        />
                        <div>
                          <div className="font-medium text-foreground">
                            {entry.color?.name ?? `Color ${entry.colorId}`}
                          </div>
                          <div>{entry.elementIds.length} element IDs</div>
                        </div>
                      </div>
                      <div>{entry.isLegacy ? "Legacy" : "Active"}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2 text-sm">
              <h3 className="text-sm font-semibold text-foreground">Element references</h3>
              {details.elementReferences.length === 0 ? (
                <p className="text-xs text-muted-foreground">No element references recorded.</p>
              ) : (
                <div
                  className="space-y-1 overflow-hidden rounded-md border border-border bg-background"
                  data-testid="catalog-detail-elements"
                >
                  {details.elementReferences.map((reference) => (
                    <div
                      key={reference.elementId}
                      className="flex items-center justify-between border-b border-border px-3 py-2 text-xs last:border-b-0"
                    >
                      <span className="font-medium text-foreground">{reference.elementId}</span>
                      <span className="text-muted-foreground">Color {reference.colorId}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
