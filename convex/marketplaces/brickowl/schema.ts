import { z } from "zod";

export {
  boConditionSchema,
  boFeedbackRatingSchema,
  boItemTypeSchema,
  boOrderListTypeSchema,
  boOrderSortBySchema,
  boOrderStatusIdSchema,
  booleanishSchema,
  numberOrStringSchema,
  type BOCondition,
  type BOFeedbackRating,
  type BOItemType,
  type BOOrderListType,
  type BOOrderSortBy,
  type BOOrderStatusId,
} from "./validators";

export * from "./inventory/schema";
export * from "./orders/schema";
export * from "./notifications/schema";

export const boApiKeySchema = z.string();
export type BOApiKey = z.infer<typeof boApiKeySchema>;
