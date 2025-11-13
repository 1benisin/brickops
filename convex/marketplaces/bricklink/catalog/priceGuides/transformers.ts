import type { PriceGuideRecord } from "@/convex/catalog/mutations";

export function mapPriceGuide(
  input: {
    item: { no: string; type: string };
    color_id?: number;
    new_or_used: string;
    currency_code: string;
    min_price?: string;
    max_price?: string;
    avg_price?: string;
    qty_avg_price?: string;
    unit_quantity?: number;
    total_quantity?: number;
  },
  guideType: "sold" | "stock",
  colorId: number,
): PriceGuideRecord {
  const now = Date.now();

  return {
    partNo: input.item.no,
    partType: input.item.type as "PART" | "MINIFIG" | "SET",
    colorId,
    newOrUsed: input.new_or_used as "N" | "U",
    currencyCode: input.currency_code,
    minPrice: input.min_price ? parseFloat(input.min_price) : undefined,
    maxPrice: input.max_price ? parseFloat(input.max_price) : undefined,
    avgPrice: input.avg_price ? parseFloat(input.avg_price) : undefined,
    qtyAvgPrice: input.qty_avg_price ? parseFloat(input.qty_avg_price) : undefined,
    unitQuantity: input.unit_quantity,
    totalQuantity: input.total_quantity,
    guideType,
    lastFetched: now,
    createdAt: now,
  };
}


