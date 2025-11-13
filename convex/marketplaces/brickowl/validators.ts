import { z } from "zod";

export const numberOrStringSchema = z.union([z.number(), z.string(), z.null()]);

export const booleanishSchema = z.union([
  z.boolean(),
  z.literal(0),
  z.literal(1),
  z.literal("0"),
  z.literal("1"),
]);

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
