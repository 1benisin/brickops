import type { OrderItemStatus, OrderStatus } from "../schema";

export type ProviderId = "bricklink" | "brickowl";

export interface NormalizedOrder {
  orderId: string;
  externalOrderKey?: string;
  dateOrdered: number;
  dateStatusChanged?: number;
  status: OrderStatus;
  providerStatus?: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerOrderCount?: number;
  storeName?: string;
  sellerName?: string;
  remarks?: string;
  totalCount?: number;
  lotCount?: number;
  totalWeight?: number;
  paymentMethod?: string;
  paymentCurrencyCode?: string;
  paymentDatePaid?: number;
  paymentStatus?: string;
  shippingMethod?: string;
  shippingMethodId?: string;
  shippingTrackingNo?: string;
  shippingTrackingLink?: string;
  shippingDateShipped?: number;
  shippingAddress?: string;
  costCurrencyCode?: string;
  costSubtotal?: number;
  costGrandTotal?: number;
  costSalesTax?: number;
  costFinalTotal?: number;
  costInsurance?: number;
  costShipping?: number;
  costCredit?: number;
  costCoupon?: number;
  providerData?: unknown;
}

export interface NormalizedOrderItem {
  providerOrderKey?: string;
  providerItemId?: string;
  itemNo: string;
  itemName?: string;
  itemType?: string;
  itemCategoryId?: number;
  colorId?: number;
  colorName?: string;
  quantity: number;
  condition?: "new" | "used";
  completeness?: string;
  unitPrice?: number;
  unitPriceFinal?: number;
  currencyCode?: string;
  remarks?: string;
  description?: string;
  weight?: number;
  location?: string;
  status: OrderItemStatus;
  providerData?: unknown;
}

export interface ProviderNormalizer {
  normalizeOrder(orderData: unknown): NormalizedOrder;
  normalizeItems(orderId: string, orderItemsData: unknown): NormalizedOrderItem[];
}

export type {
  NormalizedBrickLinkOrder,
  NormalizedBrickLinkOrderItem,
} from "../../marketplaces/bricklink/orders/transformers/transform";
export type {
  NormalizedBrickOwlOrder,
  NormalizedBrickOwlOrderItem,
} from "../../marketplaces/brickowl/orders/transformers/transform";
