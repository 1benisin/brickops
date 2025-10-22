"use client";

import { useGetPriceGuide } from "@/hooks/useGetPriceGuide";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Item, ItemHeader, ItemContent } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type PartPriceGuideProps = {
  partNumber: string | null;
  colorId: string | null;
};

type PriceData = {
  minPrice?: number;
  avgPrice?: number;
  qtyAvgPrice?: number;
  maxPrice?: number;
};

function formatPrice(n?: number, toDecimals = 2, includeCurrency = true) {
  if (typeof n !== "number" || !n) return "—";
  const formatted = n.toFixed(toDecimals);
  return includeCurrency ? `$${formatted}` : formatted;
}

function PriceRow({
  data,
  emphasizeQtyAvg,
}: {
  data?: PriceData | null;
  emphasizeQtyAvg?: boolean;
}) {
  const main = emphasizeQtyAvg
    ? data?.qtyAvgPrice ?? data?.avgPrice
    : data?.avgPrice ?? data?.qtyAvgPrice;

  return (
    <Item className="flex p-0 justify-between text-xs text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono">{formatPrice(data?.minPrice, 3, false)}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Minimum Price</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-lg font-semibold text-foreground">
            {formatPrice(main, 2, true)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{emphasizeQtyAvg ? "Avg (Qty)" : "Average Price"}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono">{formatPrice(data?.maxPrice, 3, false)}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Maximum Price</p>
        </TooltipContent>
      </Tooltip>
    </Item>
  );
}

/** Small, subtle header cell */
function GridHeader({
  children,
  className = "",
}: {
  children?: string | number;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] sm:text-xs font-medium text-muted-foreground px-1.5 py-1 ${className}`}
    >
      {children}
    </div>
  );
}

function PriceCell({ data, className }: { data?: PriceData | null; className?: string }) {
  return (
    <Item className={`p-0 ${className}`}>
      <ItemHeader className="sr-only">Price</ItemHeader>
      <ItemContent>
        <PriceRow data={data} />
      </ItemContent>
    </Item>
  );
}

function MatrixSkeleton() {
  return (
    <div
      className="
        grid gap-2 sm:gap-3
        grid-cols-[auto,1fr,1fr] lg:grid-cols-4
        auto-rows-min
      "
    >
      {/* Small: column headers */}
      <GridHeader className="col-[1] row-[1] lg:hidden"> </GridHeader>
      <GridHeader className="col-[2] row-[1] lg:hidden">Stock</GridHeader>
      <GridHeader className="col-[3] row-[1] lg:hidden">Sold</GridHeader>

      {/* Small: row header 'New' */}
      <GridHeader className="col-[1] row-[2] lg:hidden">New</GridHeader>
      {/* New: Stock / Sold */}
      <div className="col-[2] row-[2] lg:col-[1] lg:row-[3]">
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
      <div className="col-[3] row-[2] lg:col-[2] lg:row-[3]">
        <Skeleton className="h-16 w-full rounded-md" />
      </div>

      {/* Small: row header 'Used' */}
      <GridHeader className="col-[1] row-[3] lg:hidden">Used</GridHeader>
      {/* Used: Stock / Sold */}
      <div className="col-[2] row-[3] lg:col-[3] lg:row-[3]">
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
      <div className="col-[3] row-[3] lg:col-[4] lg:row-[3]">
        <Skeleton className="h-16 w-full rounded-md" />
      </div>

      {/* Large: top condition headers spanning columns */}
      <GridHeader className="hidden lg:block lg:col-[1/3] lg:row-[1] lg:text-center lg:uppercase lg:bg-emerald-100/40 lg:rounded-md dark:lg:bg-emerald-900/20">
        New
      </GridHeader>
      <GridHeader className="hidden lg:block lg:col-[3/5] lg:row-[1] lg:text-center lg:uppercase lg:bg-amber-100/40 lg:rounded-md dark:lg:bg-amber-900/20">
        Used
      </GridHeader>

      {/* Large: market sub-headers */}
      <GridHeader className="hidden lg:block lg:col-[1] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
        Stock
      </GridHeader>
      <GridHeader className="hidden lg:block lg:col-[2] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
        Sold
      </GridHeader>
      <GridHeader className="hidden lg:block lg:col-[3] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
        Stock
      </GridHeader>
      <GridHeader className="hidden lg:block lg:col-[4] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
        Sold
      </GridHeader>
    </div>
  );
}

export function PartPriceGuide({ partNumber, colorId }: PartPriceGuideProps) {
  const colorIdNum = colorId ? parseInt(colorId, 10) : null;

  const {
    data: priceGuide,
    status: priceGuideStatus,
    isLoading: isLoadingPriceGuide,
    isRefreshing: isRefreshingPriceGuide,
    refresh: refreshPriceGuide,
  } = useGetPriceGuide(partNumber, colorIdNum);

  const hasAnyData = !!(
    priceGuide?.newStock ||
    priceGuide?.newSold ||
    priceGuide?.usedStock ||
    priceGuide?.usedSold
  );

  if (!colorId) return null;

  return (
    <Card>
      <CardHeader className=" pb-0 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Price Guide</CardTitle>
        <CardDescription className="text-xs">
          {partNumber ? `Part ${partNumber}` : "Select a part"}{" "}
          {colorId ? `· Color ${colorId}` : ""}
        </CardDescription>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshPriceGuide()}
          disabled={isRefreshingPriceGuide}
          className="h-7 text-xs "
          title="Pull latest sold/stock prices"
        >
          {isRefreshingPriceGuide ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>

      <CardContent>
        <Separator className="m-2" />
        {isLoadingPriceGuide ? (
          <MatrixSkeleton />
        ) : priceGuideStatus === "missing" || !hasAnyData ? (
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
            <p>No price data available for this part/color.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshPriceGuide()}
              disabled={isRefreshingPriceGuide}
              className="text-xs h-7"
            >
              {isRefreshingPriceGuide ? "Fetching…" : "Fetch Price Data"}
            </Button>
          </div>
        ) : (
          /**
           * Grid layout:
           * - Small (default): 3 columns [left header | Stock | Sold], 3 rows [top header | New | Used]
           * - Large (lg): 4 columns (1x4): New Stock, New Sold, Used Stock, Used Sold
           *   Top header row shows "NEW" spanning cols 1-2 and "USED" spanning cols 3-4.
           */
          <div
            className="
              grid gap-2 sm:gap-3
              grid-cols-[auto,1fr,1fr] lg:grid-cols-4
              auto-rows-min
            "
          >
            {/* Small: column headers */}
            <GridHeader className="col-[1] row-[1] lg:hidden"> </GridHeader>
            <GridHeader className="col-[2] row-[1] lg:hidden bg-muted/60 rounded">Stock</GridHeader>
            <GridHeader className="col-[3] row-[1] lg:hidden bg-muted/60 rounded">Sold</GridHeader>

            {/* Small: row header 'New' */}
            <GridHeader className="col-[1] row-[2] lg:hidden bg-emerald-100/40 rounded dark:bg-emerald-900/20">
              New
            </GridHeader>
            {/* New: Stock / Sold */}
            <PriceCell
              data={priceGuide?.newStock}
              className="col-[2] row-[2] lg:col-[1] lg:row-[3]"
            />
            <PriceCell
              data={priceGuide?.newSold}
              className="col-[3] row-[2] lg:col-[2] lg:row-[3]"
            />

            {/* Small: row header 'Used' */}
            <GridHeader className="col-[1] row-[3] lg:hidden bg-amber-100/40 rounded dark:bg-amber-900/20">
              Used
            </GridHeader>
            {/* Used: Stock / Sold */}
            <PriceCell
              data={priceGuide?.usedStock}
              className="col-[2] row-[3] lg:col-[3] lg:row-[3]"
            />
            <PriceCell
              data={priceGuide?.usedSold}
              className="col-[3] row-[3] lg:col-[4] lg:row-[3]"
            />

            {/* Large: top condition headers spanning columns */}
            <GridHeader className="hidden lg:block lg:col-[1/3] lg:row-[1] lg:text-center lg:uppercase lg:bg-emerald-100/40 lg:rounded-md dark:lg:bg-emerald-900/20">
              New
            </GridHeader>
            <GridHeader className="hidden lg:block lg:col-[3/5] lg:row-[1] lg:text-center lg:uppercase lg:bg-amber-100/40 lg:rounded-md dark:lg:bg-amber-900/20">
              Used
            </GridHeader>

            {/* Large: market sub-headers */}
            <GridHeader className="hidden lg:block lg:col-[1] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
              Stock
            </GridHeader>
            <GridHeader className="hidden lg:block lg:col-[2] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
              Sold
            </GridHeader>
            <GridHeader className="hidden lg:block lg:col-[3] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
              Stock
            </GridHeader>
            <GridHeader className="hidden lg:block lg:col-[4] lg:row-[2] lg:text-center lg:bg-muted/60 lg:rounded">
              Sold
            </GridHeader>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
