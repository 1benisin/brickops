import { z } from "zod";
import { blCompletenessSchema, blConditionSchema } from "../schema";

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

export const blOrderDirectionSchema = z.enum(["in", "out"] as const);
export type BLOrderDirection = z.infer<typeof blOrderDirectionSchema>;

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
