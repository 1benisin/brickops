import {
  normalizeBrickOwlOrder,
  normalizeBrickOwlOrderItems,
} from "../../marketplaces/brickowl/orders/transformers";
import type { NormalizedOrder, NormalizedOrderItem, ProviderNormalizer } from "./types";

export const provider: ProviderNormalizer = {
  normalizeOrder(orderData: unknown): NormalizedOrder {
    return normalizeBrickOwlOrder(orderData);
  },

  normalizeItems(orderId: string, orderItemsData: unknown): NormalizedOrderItem[] {
    return normalizeBrickOwlOrderItems(orderId, orderItemsData);
  },
};
