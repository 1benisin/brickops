import { z } from "zod";

export const blCatalogItemResponseSchema = z.object({
  no: z.string(),
  name: z.string(),
  type: z.string(),
  category_id: z.number().optional(),
  alternate_no: z.string().optional(),
  image_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  weight: z.string().optional(),
  dim_x: z.string().optional(),
  dim_y: z.string().optional(),
  dim_z: z.string().optional(),
  year_released: z.number().optional(),
  description: z.string().optional(),
  is_obsolete: z.boolean().optional(),
  language_code: z.string().optional(),
});

export type BLCatalogItemResponse = z.infer<typeof blCatalogItemResponseSchema>;

export const blCatalogPartColorResponseSchema = z.object({
  color_id: z.number(),
  quantity: z.number(),
});

export type BLCatalogPartColorResponse = z.infer<typeof blCatalogPartColorResponseSchema>;

export type BLPartExternalIds = {
  brickowlId?: string;
  ldrawId?: string;
  legoId?: string;
};
