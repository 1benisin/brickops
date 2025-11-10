import { z } from "zod";

/**
 * Helper to model BrickLink include/exclude style filters.
 * Query parameters often accept comma-separated include values and
 * minus-prefixed exclude values. We represent them as structured
 * arrays so callers don't need to manipulate raw strings.
 */
const includeExclude = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    include: z.array(schema).optional(),
    exclude: z.array(schema).optional(),
  });

export type BLIncludeExclude<T> = {
  include?: T[];
  exclude?: T[];
};

// ============================================================================
// Common Enumerations
// ============================================================================

export const blItemTypeSchema = z.enum([
  "PART",
  "SET",
  "MINIFIG",
  "BOOK",
  "GEAR",
  "CATALOG",
  "INSTRUCTION",
  "UNSORTED_LOT",
  "ORIGINAL_BOX",
] as const);
export type BLItemType = z.infer<typeof blItemTypeSchema>;

export const blConditionSchema = z.enum(["N", "U"] as const);
export type BLCondition = z.infer<typeof blConditionSchema>;

export const blCompletenessSchema = z.enum(["C", "B", "S"] as const);
export type BLCompleteness = z.infer<typeof blCompletenessSchema>;

export const blStockRoomIdSchema = z.enum(["A", "B", "C"] as const);
export type BLStockRoomId = z.infer<typeof blStockRoomIdSchema>;

export const blInventoryStatusSchema = z.enum(["Y", "S", "B", "C", "N", "R"] as const);
export type BLInventoryStatus = z.infer<typeof blInventoryStatusSchema>;

export const blOrderDirectionSchema = z.enum(["in", "out"] as const);
export type BLOrderDirection = z.infer<typeof blOrderDirectionSchema>;

export const blPriceGuideTypeSchema = z.enum(["stock", "sold"] as const);
export type BLPriceGuideType = z.infer<typeof blPriceGuideTypeSchema>;

export const blRegionSchema = z.enum([
  "asia",
  "africa",
  "north_america",
  "south_america",
  "middle_east",
  "europe",
  "eu",
  "oceania",
] as const);
export type BLRegion = z.infer<typeof blRegionSchema>;

export const blVatOptionSchema = z.enum(["N", "Y", "O"] as const);
export type BLVatOption = z.infer<typeof blVatOptionSchema>;

// ============================================================================
// Inventory
// ============================================================================

const blInventoryItemReferenceSchema = z.object({
  no: z.string(),
  type: blItemTypeSchema,
});

export const blInventoryCreatePayloadSchema = z.object({
  item: blInventoryItemReferenceSchema,
  color_id: z.number(),
  quantity: z.number(),
  unit_price: z.string(),
  new_or_used: blConditionSchema,
  completeness: blCompletenessSchema.optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  bulk: z.number().optional(),
  is_retain: z.boolean().optional(),
  is_stock_room: z.boolean().optional(),
  stock_room_id: blStockRoomIdSchema.optional(),
  my_cost: z.string().optional(),
  sale_rate: z.number().optional(),
  tier_quantity1: z.number().optional(),
  tier_price1: z.string().optional(),
  tier_quantity2: z.number().optional(),
  tier_price2: z.string().optional(),
  tier_quantity3: z.number().optional(),
  tier_price3: z.string().optional(),
});
export type BLInventoryCreatePayload = z.infer<typeof blInventoryCreatePayloadSchema>;

export const blInventoryUpdatePayloadSchema = z.object({
  quantity: z.string().optional(),
  unit_price: z.string().optional(),
  new_or_used: blConditionSchema.optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  bulk: z.number().optional(),
  is_retain: z.boolean().optional(),
  is_stock_room: z.boolean().optional(),
  stock_room_id: blStockRoomIdSchema.optional(),
  my_cost: z.string().optional(),
  sale_rate: z.number().optional(),
  tier_quantity1: z.number().optional(),
  tier_price1: z.string().optional(),
  tier_quantity2: z.number().optional(),
  tier_price2: z.string().optional(),
  tier_quantity3: z.number().optional(),
  tier_price3: z.string().optional(),
});
export type BLInventoryUpdatePayload = z.infer<typeof blInventoryUpdatePayloadSchema>;

export const blInventoryResponseSchema = z.object({
  inventory_id: z.number(),
  item: z.object({
    no: z.string(),
    name: z.string(),
    type: blItemTypeSchema,
    category_id: z.number(),
  }),
  color_id: z.number(),
  color_name: z.string(),
  quantity: z.number(),
  new_or_used: blConditionSchema,
  completeness: blCompletenessSchema.optional(),
  unit_price: z.string(),
  bind_id: z.number().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  bulk: z.number().optional(),
  is_retain: z.boolean().optional(),
  is_stock_room: z.boolean().optional(),
  stock_room_id: blStockRoomIdSchema.optional(),
  date_created: z.string(),
  my_cost: z.string().optional(),
  sale_rate: z.number().optional(),
  tier_quantity1: z.number().optional(),
  tier_price1: z.string().optional(),
  tier_quantity2: z.number().optional(),
  tier_price2: z.string().optional(),
  tier_quantity3: z.number().optional(),
  tier_price3: z.string().optional(),
});
export type BLInventoryResponse = z.infer<typeof blInventoryResponseSchema>;

// ============================================================================
// Orders
// ============================================================================

const orderStatusIncludeExcludeSchema = includeExclude(z.string());

export const blOrdersListFiltersSchema = z.object({
  direction: blOrderDirectionSchema.optional(),
  status: orderStatusIncludeExcludeSchema.optional(),
  filed: z.boolean().optional(),
});
export type BLOrdersListFilters = z.infer<typeof blOrdersListFiltersSchema>;

export const blOrderSummaryResponseSchema = z.object({
  order_id: z.string(),
  date_ordered: z.string(),
  seller_name: z.string(),
  store_name: z.string().optional(),
  buyer_name: z.string(),
  total_count: z.number(),
  unique_count: z.number(),
  status: z.string(),
  payment: z.object({
    method: z.string(),
    status: z.string(),
    date_paid: z.string().optional(),
    currency_code: z.string(),
  }),
  cost: z.object({
    subtotal: z.string(),
    grand_total: z.string(),
    currency_code: z.string(),
  }),
});
export type BLOrderSummaryResponse = z.infer<typeof blOrderSummaryResponseSchema>;

export const blOrderResponseSchema = z.object({
  order_id: z.string(),
  resource_id: z.union([z.string(), z.number()]).optional(),
  date_ordered: z.string(),
  date_status_changed: z.string(),
  seller_name: z.string(),
  store_name: z.string(),
  buyer_name: z.string(),
  buyer_email: z.string(),
  buyer_order_count: z.number(),
  require_insurance: z.boolean(),
  status: z.string(),
  is_invoiced: z.boolean(),
  is_filed: z.boolean(),
  drive_thru_sent: z.boolean(),
  salesTax_collected_by_bl: z.boolean(),
  remarks: z.string().optional(),
  total_count: z.number(),
  unique_count: z.number(),
  total_weight: z.string().optional(),
  payment: z
    .object({
      method: z.string(),
      currency_code: z.string(),
      date_paid: z.string().optional(),
      status: z.string(),
    })
    .optional(),
  shipping: z
    .object({
      method: z.string().optional(),
      method_id: z.union([z.string(), z.number()]).optional(),
      tracking_no: z.string().optional(),
      tracking_link: z.string().optional(),
      date_shipped: z.string().optional(),
      address: z
        .object({
          name: z
            .object({
              full: z.string().optional(),
              first: z.string().optional(),
              last: z.string().optional(),
            })
            .optional(),
          full: z.string().optional(),
          address1: z.string().optional(),
          address2: z.string().optional(),
          country_code: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postal_code: z.string().optional(),
          phone_number: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  cost: z.object({
    currency_code: z.string(),
    subtotal: z.string(),
    grand_total: z.string(),
    salesTax_collected_by_BL: z.string().optional(),
    final_total: z.string().optional(),
    etc1: z.string().optional(),
    etc2: z.string().optional(),
    insurance: z.string().optional(),
    shipping: z.string().optional(),
    credit: z.string().optional(),
    coupon: z.string().optional(),
    vat_rate: z.string().optional(),
    vat_amount: z.string().optional(),
  }),
  disp_cost: z
    .object({
      currency_code: z.string(),
      subtotal: z.string(),
      grand_total: z.string(),
      etc1: z.string().optional(),
      etc2: z.string().optional(),
      insurance: z.string().optional(),
      shipping: z.string().optional(),
      credit: z.string().optional(),
      coupon: z.string().optional(),
      vat_rate: z.string().optional(),
      vat_amount: z.string().optional(),
    })
    .optional(),
});
export type BLOrderResponse = z.infer<typeof blOrderResponseSchema>;

export const blOrderItemResponseSchema = z.object({
  inventory_id: z.number().optional(),
  item: z.object({
    no: z.string(),
    name: z.string(),
    type: z.string(),
    category_id: z.number().optional(),
  }),
  color_id: z.number(),
  color_name: z.string().optional(),
  quantity: z.number(),
  new_or_used: blConditionSchema,
  completeness: blCompletenessSchema.optional(),
  unit_price: z.string(),
  unit_price_final: z.string(),
  disp_unit_price: z.string().optional(),
  disp_unit_price_final: z.string().optional(),
  currency_code: z.string(),
  disp_currency_code: z.string().optional(),
  remarks: z.string().optional(),
  description: z.string().optional(),
  weight: z.string().optional(),
});
export type BLOrderItemResponse = z.infer<typeof blOrderItemResponseSchema>;

export const blOrderStatusUpdatePayloadSchema = z.object({
  field: z.literal("status"),
  value: z.string(),
});
export type BLOrderStatusUpdatePayload = z.infer<typeof blOrderStatusUpdatePayloadSchema>;

export const blOrderPaymentStatusUpdatePayloadSchema = z.object({
  field: z.literal("payment_status"),
  value: z.string(),
});
export type BLOrderPaymentStatusUpdatePayload = z.infer<
  typeof blOrderPaymentStatusUpdatePayloadSchema
>;

export const blDriveThruOptionsSchema = z.object({
  mailMe: z.boolean().optional(),
});
export type BLDriveThruOptions = z.infer<typeof blDriveThruOptionsSchema>;

// ============================================================================
// Catalog
// ============================================================================

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
  color_id: z.number().optional(),
});
export type BLCatalogSupersetEntry = z.infer<typeof catalogSupersetEntrySchema>;

const catalogSubsetEntrySchema = z.object({
  item: catalogItemBaseSchema,
  color_id: z.number().optional(),
  quantity: z.number(),
  extra_quantity: z.number().optional(),
  is_alternate: z.boolean().optional(),
  is_counterpart: z.boolean().optional(),
});
export type BLCatalogSubsetEntry = z.infer<typeof catalogSubsetEntrySchema>;

export const blCatalogSupersetsResponseSchema = z.array(catalogSupersetEntrySchema);
export type BLCatalogSupersetsResponse = z.infer<typeof blCatalogSupersetsResponseSchema>;

export const blCatalogSubsetsResponseSchema = z.array(z.array(catalogSubsetEntrySchema));
export type BLCatalogSubsetsResponse = z.infer<typeof blCatalogSubsetsResponseSchema>;

export const blCatalogPartColorsResponseSchema = z.array(
  z.object({
    color_id: z.number(),
    quantity: z.number(),
  }),
);
export type BLCatalogPartColorsResponse = z.infer<typeof blCatalogPartColorsResponseSchema>;

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

// ============================================================================
// Reference Data: Colors & Categories
// ============================================================================

export const blColorIdSchema = z.number();
export type BLColorId = z.infer<typeof blColorIdSchema>;

export const blCategoryIdSchema = z.number();
export type BLCategoryId = z.infer<typeof blCategoryIdSchema>;
