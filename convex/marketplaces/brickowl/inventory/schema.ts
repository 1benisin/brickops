import { z } from "zod";
import {
  boConditionSchema,
  boItemTypeSchema,
  booleanishSchema,
  numberOrStringSchema,
} from "../validators";

const tierPriceResponseSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }
        if (typeof entry === "number") {
          return entry.toString();
        }
        return undefined;
      })
      .filter((entry): entry is string => entry !== undefined);
    if (entries.length === 0) {
      return undefined;
    }
    return entries.join(",");
  }

  return value;
}, z.string().optional());

const externalLotIdsSchema = z.union([
  z.record(z.string(), z.union([z.string(), z.null()])),
  z.array(
    z.union([
      z.string(),
      z.null(),
      z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    ]),
  ),
]);

export const boInventoryListParamsSchema = z.object({
  type: boItemTypeSchema.optional(),
  active_only: booleanishSchema.optional(),
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
  for_sale: booleanishSchema.optional(),
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
  color_id: numberOrStringSchema.optional(),
  quantity: numberOrStringSchema.optional(),
  qty: numberOrStringSchema.optional(),
  price: numberOrStringSchema.optional(),
  base_price: numberOrStringSchema.optional(),
  final_price: numberOrStringSchema.optional(),
  condition: boConditionSchema.optional(),
  for_sale: booleanishSchema.optional(),
  full_con: boConditionSchema.optional(),
  sale_percent: numberOrStringSchema.optional(),
  my_cost: numberOrStringSchema.optional(),
  lot_weight: numberOrStringSchema.optional(),
  personal_note: z.union([z.string(), z.null()]).optional(),
  public_note: z.union([z.string(), z.null()]).optional(),
  bulk_qty: numberOrStringSchema.optional(),
  tier_price: tierPriceResponseSchema,
  external_id_1: z.string().optional(),
  owl_id: z.string().optional(),
  url: z.string().optional(),
  external_lot_ids: externalLotIdsSchema.optional(),
  ids: z.array(boInventoryIdEntrySchema).optional(),
});
export type BOInventoryResponse = z.infer<typeof boInventoryResponseSchema>;

export const boInventoryResponseArraySchema = z.array(boInventoryResponseSchema);
export type BOInventoryResponseArray = z.infer<typeof boInventoryResponseArraySchema>;

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
