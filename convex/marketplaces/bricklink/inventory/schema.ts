import { z } from "zod";
import {
  blCompletenessSchema,
  blConditionSchema,
  blItemTypeSchema,
  blResponseMetaSchema,
  blStockRoomIdSchema,
} from "../schema";

export const blInventoryItemSchema = z.object({
  no: z.string().min(1),
  type: blItemTypeSchema,
});
export type BLInventoryItem = z.infer<typeof blInventoryItemSchema>;

export const blInventoryListParamsSchema = z.object({
  item_type: z.enum(["part", "set", "minifig", "book", "gear"]).optional(),
  category_id: z.number().int().optional(),
  status: z.string().optional(),
  color_id: z.number().int().optional(),
  page: z.number().int().positive().optional(),
  page_size: z.number().int().positive().optional(),
});
export type BLInventoryListParams = z.infer<typeof blInventoryListParamsSchema>;

export const blInventoryCreatePayloadSchema = z.object({
  item: blInventoryItemSchema,
  color_id: z.number().int(),
  quantity: z.number().int().nonnegative(),
  unit_price: z.string(),
  new_or_used: blConditionSchema,
  completeness: blCompletenessSchema.optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  bulk: z.number().int().optional(),
  is_retain: z.boolean().optional(),
  is_stock_room: z.boolean().optional(),
  stock_room_id: blStockRoomIdSchema.optional(),
});
export type BLInventoryCreatePayload = z.infer<typeof blInventoryCreatePayloadSchema>;

export const blInventoryCreateManyPayloadSchema = z.array(blInventoryCreatePayloadSchema).min(1);
export type BLInventoryCreateManyPayload = z.infer<typeof blInventoryCreateManyPayloadSchema>;

export const blInventoryUpdatePayloadSchema = z.object({
  color_id: z.number().int().optional(),
  quantity: z
    .union([
      z.string().regex(/^[+-]\d+$/, "quantity must be a signed integer like +5 or -3"),
      z.number().int(),
    ])
    .optional(),
  unit_price: z.string().optional(),
  new_or_used: blConditionSchema.optional(),
  completeness: blCompletenessSchema.optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
  bulk: z.number().int().optional(),
  is_retain: z.boolean().optional(),
  is_stock_room: z.boolean().optional(),
  stock_room_id: blStockRoomIdSchema.optional(),
});
export type BLInventoryUpdatePayload = z.infer<typeof blInventoryUpdatePayloadSchema>;

export const blInventoryResponseItemSchema = z
  .object({
    no: z.string(),
    name: z.string().optional(),
    type: blItemTypeSchema,
    category_id: z.number().int().optional(),
  })
  .passthrough();
export type BLInventoryResponseItem = z.infer<typeof blInventoryResponseItemSchema>;

export const blInventoryResponseSchema = z
  .object({
    inventory_id: z.number().int(),
    item: blInventoryResponseItemSchema,
    color_id: z.number().int(),
    color_name: z.string(),
    quantity: z.number().int(),
    unit_price: z.string(),
    new_or_used: blConditionSchema,
    completeness: blCompletenessSchema.optional(),
    bind_id: z.number().int().optional(),
    description: z.string().nullable().optional(),
    remarks: z.string().nullable().optional(),
    bulk: z.number().nullable().optional(),
    is_retain: z.boolean().optional(),
    is_stock_room: z.boolean().optional(),
    stock_room_id: blStockRoomIdSchema.nullable().optional(),
    date_created: z.string().optional(),
    my_cost: z.string().optional(),
    sale_rate: z.number().optional(),
    tier_quantity1: z.number().optional(),
    tier_price1: z.string().optional(),
    tier_quantity2: z.number().optional(),
    tier_price2: z.string().optional(),
    tier_quantity3: z.number().optional(),
    tier_price3: z.string().optional(),
  })
  .passthrough();
export type BLInventoryResponse = z.infer<typeof blInventoryResponseSchema>;

export const blInventoryEnvelopeSchema = z.object({
  meta: blResponseMetaSchema,
  data: blInventoryResponseSchema,
});
export type BLInventoryEnvelope = z.infer<typeof blInventoryEnvelopeSchema>;

export const blInventoryListEnvelopeSchema = z.object({
  meta: blResponseMetaSchema,
  data: z.array(blInventoryResponseSchema.partial().extend({ inventory_id: z.number().int() })),
});
export type BLInventoryListEnvelope = z.infer<typeof blInventoryListEnvelopeSchema>;

export function toSignedDelta(delta: string | number): string {
  if (typeof delta === "string") return delta;
  return delta >= 0 ? `+${delta}` : `${delta}`;
}
