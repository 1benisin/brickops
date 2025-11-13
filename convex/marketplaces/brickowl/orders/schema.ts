import { z } from "zod";
import {
  boFeedbackRatingSchema,
  boOrderListTypeSchema,
  boOrderSortBySchema,
  boOrderStatusIdSchema,
  numberOrStringSchema,
} from "../validators";

export const boOrderListParamsSchema = z.object({
  status: boOrderStatusIdSchema.optional(),
  order_time: z.number().optional(),
  limit: z.number().optional(),
  list_type: boOrderListTypeSchema.optional(),
  sort_by: boOrderSortBySchema.optional(),
});
export type BOOrderListParams = z.infer<typeof boOrderListParamsSchema>;

const boAddressSchema = z.object({
  name: z.union([z.string(), z.object({ full: z.string().optional() })]).optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  phone: z.string().optional(),
});

const boShippingSchema = z.object({
  method: z.string().optional(),
  method_id: numberOrStringSchema.optional(),
  tracking_id: z.string().optional(),
  tracking_url: z.string().optional(),
  address: boAddressSchema.optional(),
});

const boBuyerSchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  order_count: numberOrStringSchema.optional(),
});

const boPaymentSchema = z.object({
  method: z.string().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  total: numberOrStringSchema.optional(),
  subtotal: numberOrStringSchema.optional(),
});

export const boOrderResponseSchema = z.object({
  order_id: z.string().optional(),
  id: z.string().optional(),
  orderId: z.string().optional(),
  order_number: numberOrStringSchema.optional(),
  store_id: numberOrStringSchema.optional(),
  status: numberOrStringSchema.optional(),
  status_id: numberOrStringSchema.optional(),
  status_text: z.string().optional(),
  created: numberOrStringSchema.optional(),
  created_at: numberOrStringSchema.optional(),
  order_time: numberOrStringSchema.optional(),
  updated: numberOrStringSchema.optional(),
  updated_at: numberOrStringSchema.optional(),
  buyer: boBuyerSchema.optional(),
  customer: z.record(z.string(), z.any()).optional(),
  buyer_name: z.string().optional(),
  buyer_email: z.string().optional(),
  buyer_order_count: numberOrStringSchema.optional(),
  seller_name: z.string().optional(),
  store_name: z.string().optional(),
  store: z.record(z.string(), z.any()).optional(),
  payment: boPaymentSchema.optional(),
  shipping: boShippingSchema.optional(),
  note: z.string().optional(),
  notes: z.string().optional(),
  remark: z.string().optional(),
  subtotal: numberOrStringSchema.optional(),
  items_total: numberOrStringSchema.optional(),
  total: numberOrStringSchema.optional(),
  grand_total: numberOrStringSchema.optional(),
  final_total: numberOrStringSchema.optional(),
  tax_total: numberOrStringSchema.optional(),
  shipping_total: numberOrStringSchema.optional(),
  insurance_total: numberOrStringSchema.optional(),
  discount_total: numberOrStringSchema.optional(),
  credit_total: numberOrStringSchema.optional(),
  coupon_total: numberOrStringSchema.optional(),
  total_items: numberOrStringSchema.optional(),
  total_quantity: numberOrStringSchema.optional(),
  item_count: numberOrStringSchema.optional(),
  unique_items: numberOrStringSchema.optional(),
  unique_count: numberOrStringSchema.optional(),
  total_weight: numberOrStringSchema.optional(),
});
export type BOOrderResponse = z.infer<typeof boOrderResponseSchema>;

export const boOrderItemResponseSchema = z.object({
  order_item_id: z.string().optional(),
  lot_id: z.string().optional(),
  order_id: z.string().optional(),
  boid: z.string().optional(),
  item_no: z.string().optional(),
  external_id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  category_id: numberOrStringSchema.optional(),
  color_id: numberOrStringSchema.optional(),
  color_name: z.string().optional(),
  quantity: numberOrStringSchema.optional(),
  qty: numberOrStringSchema.optional(),
  total_quantity: numberOrStringSchema.optional(),
  price: numberOrStringSchema.optional(),
  unit_price: numberOrStringSchema.optional(),
  final_price: numberOrStringSchema.optional(),
  currency: z.string().optional(),
  condition: z.string().optional(),
  completeness: z.string().optional(),
  note: z.string().optional(),
  remarks: z.string().optional(),
  description: z.string().optional(),
  weight: numberOrStringSchema.optional(),
  location: z.string().optional(),
  bin: z.string().optional(),
});
export type BOOrderItemResponse = z.infer<typeof boOrderItemResponseSchema>;

export const boOrderItemsResponseSchema = z.array(boOrderItemResponseSchema);
export type BOOrderItemsResponse = z.infer<typeof boOrderItemsResponseSchema>;

export const boOrderListResponseSchema = z.array(boOrderResponseSchema);
export type BOOrderListResponse = z.infer<typeof boOrderListResponseSchema>;

export const boOrderTrackingPayloadSchema = z.object({
  order_id: z.string(),
  tracking_id: z.string(),
});
export type BOOrderTrackingPayload = z.infer<typeof boOrderTrackingPayloadSchema>;

export const boOrderNotePayloadSchema = z.object({
  order_id: z.string(),
  note: z.string(),
});
export type BOOrderNotePayload = z.infer<typeof boOrderNotePayloadSchema>;

export const boOrderStatusPayloadSchema = z.object({
  order_id: z.string(),
  status_id: boOrderStatusIdSchema,
});
export type BOOrderStatusPayload = z.infer<typeof boOrderStatusPayloadSchema>;

export const boOrderFeedbackPayloadSchema = z.object({
  order_id: z.string(),
  rating: boFeedbackRatingSchema,
  comment: z.string().optional(),
});
export type BOOrderFeedbackPayload = z.infer<typeof boOrderFeedbackPayloadSchema>;
