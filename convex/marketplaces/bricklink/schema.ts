import { z } from "zod";

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

// BrickLink’s docs show response envelopes with `meta` + `data`.
export const blResponseMetaSchema = z.object({
  code: z.number(), // 2xx success; non-2xx otherwise
  message: z.string().optional(),
  description: z.string().optional(),
});
