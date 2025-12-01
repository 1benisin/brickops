import { z } from "zod";

export const blCatalogCategoryResponseSchema = z.object({
  category_id: z.number(),
  category_name: z.string(),
  parent_id: z.number().optional(),
});

export type BLCatalogCategoryResponse = z.infer<typeof blCatalogCategoryResponseSchema>;

export const blCategoryIdSchema = z.number();
export type BLCategoryId = z.infer<typeof blCategoryIdSchema>;
