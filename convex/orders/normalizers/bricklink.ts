import {
  normalizeBrickLinkOrder,
  normalizeBrickLinkOrderItems,
} from "../../marketplaces/bricklink/orders/transformers";
import type { NormalizedOrder, NormalizedOrderItem, ProviderNormalizer } from "./types";

export const provider: ProviderNormalizer = {
  normalizeOrder(orderData: unknown): NormalizedOrder {
    return normalizeBrickLinkOrder(orderData);
  },

  normalizeItems(orderId: string, orderItemsData: unknown): NormalizedOrderItem[] {
    return normalizeBrickLinkOrderItems(orderId, orderItemsData);
  },
};
