import { z } from "zod";

import {
  blConditionSchema,
  blItemTypeSchema,
  blPriceGuideTypeSchema,
  blRegionSchema,
  blVatOptionSchema,
} from "../schema";

export const blCatalogItemIdentifierSchema = z.object({
  type: blItemTypeSchema,
  no: z.string(),
});
export type BLCatalogItemIdentifier = z.infer<typeof blCatalogItemIdentifierSchema>;

export const blCatalogItemColorIdentifierSchema = z.object({
  type: blItemTypeSchema,
  no: z.string(),
  colorId: z.number(),
});
export type BLCatalogItemColorIdentifier = z.infer<typeof blCatalogItemColorIdentifierSchema>;

export const blCatalogSupersetsOptionsSchema = z.object({
  colorId: z.number().optional(),
});
export type BLCatalogSupersetsOptions = z.infer<typeof blCatalogSupersetsOptionsSchema>;

export const blCatalogSubsetsOptionsSchema = z.object({
  colorId: z.number().optional(),
  box: z.boolean().optional(),
  instruction: z.boolean().optional(),
  breakMinifigs: z.boolean().optional(),
  breakSubsets: z.boolean().optional(),
});
export type BLCatalogSubsetsOptions = z.infer<typeof blCatalogSubsetsOptionsSchema>;

export const blCatalogPriceGuideOptionsSchema = z.object({
  guideType: blPriceGuideTypeSchema.optional(),
  newOrUsed: blConditionSchema.optional(),
  countryCode: z.string().optional(),
  region: blRegionSchema.optional(),
  currencyCode: z.string().optional(),
  vat: blVatOptionSchema.optional(),
});
export type BLCatalogPriceGuideOptions = z.infer<typeof blCatalogPriceGuideOptionsSchema>;

const catalogItemBaseSchema = z.object({
  no: z.string(),
  name: z.string(),
  type: blItemTypeSchema,
  category_id: z.number().optional(),
});

export const blCatalogItemResponseSchema = z.object({
  no: z.string(),
  name: z.string(),
  type: blItemTypeSchema,
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

const catalogSupersetEntrySchema = z.object({
  item: catalogItemBaseSchema,
  quantity: z.number(),
  appear_as: z.string().optional(),
});
export type BLCatalogSupersetEntry = z.infer<typeof catalogSupersetEntrySchema>;

const catalogSupersetGroupSchema = z.object({
  color_id: z.number(),
  entries: z.array(catalogSupersetEntrySchema),
});
export type BLCatalogSupersetGroup = z.infer<typeof catalogSupersetGroupSchema>;

const catalogSubsetEntrySchema = z.object({
  item: catalogItemBaseSchema,
  color_id: z.number(),
  quantity: z.number(),
  extra_quantity: z.number().optional(),
  is_alternate: z.boolean().optional(),
  is_counterpart: z.boolean().optional(),
});
export type BLCatalogSubsetEntry = z.infer<typeof catalogSubsetEntrySchema>;

const catalogSubsetGroupSchema = z.object({
  match_no: z.number(),
  entries: z.array(catalogSubsetEntrySchema),
});
export type BLCatalogSubsetGroup = z.infer<typeof catalogSubsetGroupSchema>;

export const blCatalogSupersetsResponseSchema = z.array(catalogSupersetGroupSchema);
export type BLCatalogSupersetsResponse = z.infer<typeof blCatalogSupersetsResponseSchema>;

export const blCatalogSubsetsResponseSchema = z.array(catalogSubsetGroupSchema);
export type BLCatalogSubsetsResponse = z.infer<typeof blCatalogSubsetsResponseSchema>;

export const blCatalogPartColorsResponseSchema = z.array(
  z.object({
    color_id: z.number(),
    quantity: z.number(),
  }),
);
export type BLCatalogPartColorsResponse = z.infer<typeof blCatalogPartColorsResponseSchema>;

const catalogPriceDetailSchema = z.object({
  quantity: z.number(),
  qunatity: z.number().optional(),
  unit_price: z.string(),
  shipping_available: z.union([z.boolean(), z.string()]).optional(),
  seller_country_code: z.string().optional(),
  buyer_country_code: z.string().optional(),
  date_ordered: z.string().optional(),
});
export type BLCatalogPriceDetail = z.infer<typeof catalogPriceDetailSchema>;

export const blCatalogPriceGuideResponseSchema = z.object({
  item: catalogItemBaseSchema,
  color_id: z.number().optional(),
  new_or_used: blConditionSchema,
  currency_code: z.string(),
  min_price: z.string().optional(),
  max_price: z.string().optional(),
  avg_price: z.string().optional(),
  qty_avg_price: z.string().optional(),
  unit_quantity: z.number().optional(),
  total_quantity: z.number().optional(),
  guide_type: blPriceGuideTypeSchema.optional(),
  price_detail: z.array(catalogPriceDetailSchema).optional(),
});
export type BLCatalogPriceGuideResponse = z.infer<typeof blCatalogPriceGuideResponseSchema>;

export const blCatalogCategoryResponseSchema = z.object({
  category_id: z.number(),
  category_name: z.string(),
  parent_id: z.number().optional(),
});
export type BLCatalogCategoryResponse = z.infer<typeof blCatalogCategoryResponseSchema>;

export const blCatalogColorResponseSchema = z.object({
  color_id: z.number(),
  color_name: z.string(),
  color_code: z.string().optional(),
  color_type: z.string().optional(),
});
export type BLCatalogColorResponse = z.infer<typeof blCatalogColorResponseSchema>;

export const blColorIdSchema = z.number();
export type BLColorId = z.infer<typeof blColorIdSchema>;

export const blCategoryIdSchema = z.number();
export type BLCategoryId = z.infer<typeof blCategoryIdSchema>;
