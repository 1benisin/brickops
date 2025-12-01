import { z } from "zod";
import {
  blCompletenessSchema,
  blConditionSchema,
  blItemTypeSchema,
  blResponseMetaSchema,
  blStockRoomIdSchema,
} from "../schema";
import type { Doc } from "../../../_generated/dataModel";

export type InventoryItemDoc = Doc<"inventoryItems">;

export type InsertableInventoryItem = Omit<
  InventoryItemDoc,
  | "_id"
  | "_creationTime"
  | "_updatedTime"
  | "_createdByUserId"
  | "_updatedByUserId"
  | "businessAccountId"
>;

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
    is_retain: z.boolean().optional(), //	Indicates whether the item retains in inventory after it is sold out
    is_stock_room: z.boolean().optional(), //	Indicates whether the item appears only in owner’s inventory
    stock_room_id: blStockRoomIdSchema.nullable().optional(),
    date_created: z.string().optional(),
    my_cost: z.string().optional(),
    sale_rate: z.number().int().min(0).max(100).optional(), // Must be less than 100. 20 for 20% sale
    tier_quantity1: z.number().optional(),
    tier_price1: z.string().optional(),
    tier_quantity2: z.number().optional(),
    tier_price2: z.string().optional(),
    tier_quantity3: z.number().optional(),
    tier_price3: z.string().optional(),
  })
  .passthrough(); // allows additional fields that are not defined in the schema
export type BLInventoryResponse = z.infer<typeof blInventoryResponseSchema>;

/**
 * Response envelope for a single inventory item GET request.
 * Wraps the full inventory item data with response metadata.
 */
export const blInventoryEnvelopeSchema = z.object({
  meta: blResponseMetaSchema,
  data: blInventoryResponseSchema,
});
export type BLInventoryEnvelope = z.infer<typeof blInventoryEnvelopeSchema>;

/**
 * Response envelope for listing inventory items.
 * Note: List responses include all essential fields but may omit some optional metadata.
 * Core fields (inventory_id, item, color_id, quantity, new_or_used) are always present.
 */
export const blInventoryListEnvelopeSchema = z.object({
  meta: blResponseMetaSchema,
  data: z.array(
    blInventoryResponseSchema.partial().required({
      inventory_id: true,
      item: true,
      color_id: true,
      quantity: true,
      new_or_used: true,
    }),
  ),
});
export type BLInventoryListEnvelope = z.infer<typeof blInventoryListEnvelopeSchema>;

/**
 * Converts a quantity delta to a signed string format for Bricklink API updates.
 * The API expects strings like "+5" or "-3" to represent relative quantity changes.
 * @param delta - Either a pre-formatted signed string or a number to convert
 * @returns A signed string (e.g., "+5", "-3")
 */
export function toSignedDelta(delta: string | number): string {
  if (typeof delta === "string") return delta;
  return delta >= 0 ? `+${delta}` : `${delta}`;
}
