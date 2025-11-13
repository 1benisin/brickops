import { z } from "zod";
import type { ColorRecord as CatalogColorRecord } from "@/convex/catalog/mutations";

export const blCatalogColorResponseSchema = z.object({
  color_id: z.number(),
  color_name: z.string(),
  color_code: z.string().optional(),
  color_type: z.string().optional(),
});

export type BLCatalogColorResponse = z.infer<typeof blCatalogColorResponseSchema>;

export const blColorIdSchema = z.number();
export type BLColorId = z.infer<typeof blColorIdSchema>;

export type ColorRecord = CatalogColorRecord;

