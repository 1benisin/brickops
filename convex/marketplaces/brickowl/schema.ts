import { z } from "zod";

// ============================================================================
// Common Helpers
// ============================================================================

const numberOrString = z.union([z.number(), z.string()]);

const booleanish = z.union([
  z.boolean(),
  z.literal(0),
  z.literal(1),
  z.literal("0"),
  z.literal("1"),
]);

// ============================================================================
// Enumerations
// ============================================================================

export const boItemTypeSchema = z.enum([
  "Part",
  "Set",
  "Minifigure",
  "Gear",
  "Sticker",
  "Minibuild",
  "Instructions",
  "Packaging",
] as const);
export type BOItemType = z.infer<typeof boItemTypeSchema>;

export const boConditionSchema = z.enum([
  "new",
  "news",
  "newc",
  "newi",
  "usedc",
  "usedi",
  "usedn",
  "usedg",
  "useda",
  "other",
] as const);
export type BOCondition = z.infer<typeof boConditionSchema>;

export const boOrderListTypeSchema = z.enum(["store", "customer"] as const);
export type BOOrderListType = z.infer<typeof boOrderListTypeSchema>;

export const boOrderSortBySchema = z.enum(["created", "updated"] as const);
export type BOOrderSortBy = z.infer<typeof boOrderSortBySchema>;

export const boOrderStatusIdSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal("0"),
  z.literal("1"),
  z.literal("2"),
  z.literal("3"),
  z.literal("4"),
  z.literal("5"),
  z.literal("6"),
  z.literal("7"),
  z.literal("8"),
  z.literal("Pending"),
  z.literal("Payment Submitted"),
  z.literal("Payment Received"),
  z.literal("Processing"),
  z.literal("Processed"),
  z.literal("Shipped"),
  z.literal("Received"),
  z.literal("On Hold"),
  z.literal("Cancelled"),
]);
export type BOOrderStatusId = z.infer<typeof boOrderStatusIdSchema>;

export const boFeedbackRatingSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(1),
  z.literal("-1"),
  z.literal("0"),
  z.literal("1"),
]);
export type BOFeedbackRating = z.infer<typeof boFeedbackRatingSchema>;

// ============================================================================
// Inventory
// ============================================================================

export const boInventoryListParamsSchema = z.object({
  type: boItemTypeSchema.optional(),
  active_only: booleanish.optional(),
  external_id_1: z.string().optional(),
  lot_id: z.string().optional(),
});
export type BOInventoryListParams = z.infer<typeof boInventoryListParamsSchema>;

export const boInventoryCreatePayloadSchema = z.object({
  boid: z.string(),
  color_id: z.number().optional(),
  quantity: z.number(),
  price: z.number(),
  condition: boConditionSchema,
  external_id: z.string().optional(),
  personal_note: z.string().optional(),
  public_note: z.string().optional(),
  bulk_qty: z.number().optional(),
  tier_price: z.string().optional(),
  my_cost: z.number().optional(),
  lot_weight: z.number().optional(),
});
export type BOInventoryCreatePayload = z.infer<typeof boInventoryCreatePayloadSchema>;

export const boInventoryUpdatePayloadSchema = z.object({
  absolute_quantity: z.number().optional(),
  relative_quantity: z.number().optional(),
  for_sale: booleanish.optional(),
  price: z.number().optional(),
  sale_percent: z.number().optional(),
  my_cost: z.number().optional(),
  lot_weight: z.number().optional(),
  personal_note: z.string().optional(),
  public_note: z.string().optional(),
  bulk_qty: z.number().optional(),
  tier_price: z.string().optional(),
  condition: boConditionSchema.optional(),
  update_external_id_1: z.string().optional(),
});
export type BOInventoryUpdatePayload = z.infer<typeof boInventoryUpdatePayloadSchema>;

export const boInventoryIdentifierSchema = z.object({
  lot_id: z.string().optional(),
  external_id: z.string().optional(),
});
export type BOInventoryIdentifier = z.infer<typeof boInventoryIdentifierSchema>;

export const boInventoryDeletePayloadSchema = boInventoryIdentifierSchema;
export type BOInventoryDeletePayload = z.infer<typeof boInventoryDeletePayloadSchema>;

export const boInventoryIdEntrySchema = z.object({
  id: z.string(),
  type: z.string().optional(),
});
export type BOInventoryIdEntry = z.infer<typeof boInventoryIdEntrySchema>;

export const boInventoryResponseSchema = z.object({
  lot_id: z.string(),
  boid: z.string().optional(),
  type: boItemTypeSchema.optional(),
  color_id: numberOrString.optional(),
  quantity: numberOrString.optional(),
  qty: numberOrString.optional(),
  price: numberOrString.optional(),
  base_price: numberOrString.optional(),
  final_price: numberOrString.optional(),
  condition: boConditionSchema.optional(),
  for_sale: booleanish.optional(),
  full_con: boConditionSchema.optional(),
  sale_percent: numberOrString.optional(),
  my_cost: numberOrString.optional(),
  lot_weight: numberOrString.optional(),
  personal_note: z.union([z.string(), z.null()]).optional(),
  public_note: z.union([z.string(), z.null()]).optional(),
  bulk_qty: numberOrString.optional(),
  tier_price: z.string().optional(),
  external_id_1: z.string().optional(),
  owl_id: z.string().optional(),
  url: z.string().optional(),
  external_lot_ids: z
    .record(z.string(), z.union([z.string(), z.null()]))
    .optional(),
  ids: z.array(boInventoryIdEntrySchema).optional(),
});
export type BOInventoryResponse = z.infer<typeof boInventoryResponseSchema>;

export const boInventoryResponseArraySchema = z.array(boInventoryResponseSchema);
export type BOInventoryResponseArray = z.infer<typeof boInventoryResponseArraySchema>;

// ============================================================================
// Orders
// ============================================================================

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
  method_id: numberOrString.optional(),
  tracking_id: z.string().optional(),
  tracking_url: z.string().optional(),
  address: boAddressSchema.optional(),
});

const boBuyerSchema = z.object({
  username: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  order_count: numberOrString.optional(),
});

const boPaymentSchema = z.object({
  method: z.string().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  total: numberOrString.optional(),
  subtotal: numberOrString.optional(),
});

export const boOrderResponseSchema = z.object({
  order_id: z.string().optional(),
  id: z.string().optional(),
  orderId: z.string().optional(),
  order_number: numberOrString.optional(),
  store_id: numberOrString.optional(),
  status: numberOrString.optional(),
  status_id: numberOrString.optional(),
  status_text: z.string().optional(),
  created: numberOrString.optional(),
  created_at: numberOrString.optional(),
  order_time: numberOrString.optional(),
  updated: numberOrString.optional(),
  updated_at: numberOrString.optional(),
  buyer: boBuyerSchema.optional(),
  customer: z.record(z.string(), z.any()).optional(),
  buyer_name: z.string().optional(),
  buyer_email: z.string().optional(),
  buyer_order_count: numberOrString.optional(),
  seller_name: z.string().optional(),
  store_name: z.string().optional(),
  store: z.record(z.string(), z.any()).optional(),
  payment: boPaymentSchema.optional(),
  shipping: boShippingSchema.optional(),
  note: z.string().optional(),
  notes: z.string().optional(),
  remark: z.string().optional(),
  subtotal: numberOrString.optional(),
  items_total: numberOrString.optional(),
  total: numberOrString.optional(),
  grand_total: numberOrString.optional(),
  final_total: numberOrString.optional(),
  tax_total: numberOrString.optional(),
  shipping_total: numberOrString.optional(),
  insurance_total: numberOrString.optional(),
  discount_total: numberOrString.optional(),
  credit_total: numberOrString.optional(),
  coupon_total: numberOrString.optional(),
  total_items: numberOrString.optional(),
  total_quantity: numberOrString.optional(),
  item_count: numberOrString.optional(),
  unique_items: numberOrString.optional(),
  unique_count: numberOrString.optional(),
  total_weight: numberOrString.optional(),
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
  category_id: numberOrString.optional(),
  color_id: numberOrString.optional(),
  color_name: z.string().optional(),
  quantity: numberOrString.optional(),
  qty: numberOrString.optional(),
  total_quantity: numberOrString.optional(),
  price: numberOrString.optional(),
  unit_price: numberOrString.optional(),
  final_price: numberOrString.optional(),
  currency: z.string().optional(),
  condition: z.string().optional(),
  completeness: z.string().optional(),
  note: z.string().optional(),
  remarks: z.string().optional(),
  description: z.string().optional(),
  weight: numberOrString.optional(),
  location: z.string().optional(),
  bin: z.string().optional(),
});
export type BOOrderItemResponse = z.infer<typeof boOrderItemResponseSchema>;

export const boOrderItemsResponseSchema = z.array(boOrderItemResponseSchema);
export type BOOrderItemsResponse = z.infer<typeof boOrderItemsResponseSchema>;

export const boOrderListResponseSchema = z.array(boOrderResponseSchema);
export type BOOrderListResponse = z.infer<typeof boOrderListResponseSchema>;

// ============================================================================
// Orders: Mutations
// ============================================================================

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

export const boOrderNotifyPayloadSchema = z.object({
  ip: z.string(),
});
export type BOOrderNotifyPayload = z.infer<typeof boOrderNotifyPayloadSchema>;

export const boOrderFeedbackPayloadSchema = z.object({
  order_id: z.string(),
  rating: boFeedbackRatingSchema,
  comment: z.string().optional(),
});
export type BOOrderFeedbackPayload = z.infer<typeof boOrderFeedbackPayloadSchema>;

// ============================================================================
// Bulk
// ============================================================================

export const boBulkRequestEntrySchema = z.object({
  endpoint: z.string(),
  request_method: z.union([z.literal("GET"), z.literal("POST")]),
  params: z.array(z.any()),
});
export type BOBulkRequestEntry = z.infer<typeof boBulkRequestEntrySchema>;

export const boBulkBatchPayloadSchema = z.object({
  requests: z.array(boBulkRequestEntrySchema),
});
export type BOBulkBatchPayload = z.infer<typeof boBulkBatchPayloadSchema>;

// ============================================================================
// Credential Helpers (API key validation)
// ============================================================================

export const boApiKeySchema = z.string();
export type BOApiKey = z.infer<typeof boApiKeySchema>;
