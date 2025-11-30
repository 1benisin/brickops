import { z } from "zod";

export const blCatalogPriceGuideResponseSchema = z.object({
  item: z.object({
    no: z.string(),
    type: z.string(),
  }),
  color_id: z.number().optional(),
  new_or_used: z.string(),
  currency_code: z.string(),
  min_price: z.string().optional(),
  max_price: z.string().optional(),
  avg_price: z.string().optional(),
  qty_avg_price: z.string().optional(),
  unit_quantity: z.number().optional(),
  total_quantity: z.number().optional(),
  guide_type: z.string().optional(),
  price_detail: z
    .array(
      z.object({
        quantity: z.number(),
        qunatity: z.number().optional(),
        unit_price: z.string(),
        shipping_available: z.union([z.boolean(), z.string()]).optional(),
        seller_country_code: z.string().optional(),
        buyer_country_code: z.string().optional(),
        date_ordered: z.string().optional(),
      }),
    )
    .optional(),
});

export type BLCatalogPriceGuideResponse = z.infer<typeof blCatalogPriceGuideResponseSchema>;
