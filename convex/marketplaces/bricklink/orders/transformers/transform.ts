import { z } from "zod";

import {
  parseNumberLike,
  parseTimestampLike,
  stringifyAddress,
} from "../../../../lib/normalization";
import {
  createNormalizationError,
  NORMALIZATION_ERROR_CODES,
} from "../../../../orders/normalizers/shared/errors";
import type { NormalizedOrder, NormalizedOrderItem } from "../../../../orders/normalizers/types";
import { ORDER_STATUS_VALUES, type OrderStatus } from "../../../../orders/schema";
import {
  blOrderItemResponseSchema,
  blOrderResponseSchema,
  type BLOrderItemResponse,
  type BLOrderResponse,
} from "../schema";

const ALERT_STATUSES = new Set(["OCR", "NPB", "NPX", "NRS", "NSS"]);

function normalizeBrickLinkStatus(status: string): OrderStatus {
  const normalized = status.toUpperCase().trim();
  if (ALERT_STATUSES.has(normalized)) {
    return "HOLD";
  }

  if (ORDER_STATUS_VALUES.includes(normalized as OrderStatus)) {
    return normalized as OrderStatus;
  }

  throw createNormalizationError(NORMALIZATION_ERROR_CODES.UnsupportedStatus, {
    provider: "bricklink",
    field: "status",
    value: status,
  });
}

function transformBrickLinkOrder(raw: BLOrderResponse): NormalizedOrder {
  return {
    orderId: raw.order_id,
    externalOrderKey: raw.resource_id ? String(raw.resource_id) : raw.order_id,
    dateOrdered: parseTimestampLike(raw.date_ordered) ?? Date.now(),
    dateStatusChanged: parseTimestampLike(raw.date_status_changed),
    status: normalizeBrickLinkStatus(raw.status),
    providerStatus: raw.status,
    buyerName: raw.buyer_name,
    buyerEmail: raw.buyer_email,
    buyerOrderCount: raw.buyer_order_count,
    storeName: raw.store_name,
    sellerName: raw.seller_name,
    remarks: raw.remarks ?? undefined,
    totalCount: raw.total_count,
    lotCount: raw.unique_count,
    totalWeight: parseNumberLike(raw.total_weight),
    paymentMethod: raw.payment?.method,
    paymentCurrencyCode: raw.payment?.currency_code,
    paymentDatePaid: parseTimestampLike(raw.payment?.date_paid),
    paymentStatus: raw.payment?.status,
    shippingMethod: raw.shipping?.method,
    shippingMethodId:
      raw.shipping?.method_id !== undefined ? String(raw.shipping.method_id) : undefined,
    shippingTrackingNo: raw.shipping?.tracking_no,
    shippingTrackingLink: raw.shipping?.tracking_link,
    shippingDateShipped: parseTimestampLike(raw.shipping?.date_shipped),
    shippingAddress: stringifyAddress(raw.shipping?.address),
    costCurrencyCode: raw.cost.currency_code,
    costSubtotal: parseNumberLike(raw.cost.subtotal),
    costGrandTotal: parseNumberLike(raw.cost.grand_total),
    costSalesTax: parseNumberLike(raw.cost.salesTax_collected_by_BL),
    costFinalTotal: parseNumberLike(raw.cost.final_total),
    costInsurance: parseNumberLike(raw.cost.insurance),
    costShipping: parseNumberLike(raw.cost.shipping),
    costCredit: parseNumberLike(raw.cost.credit),
    costCoupon: parseNumberLike(raw.cost.coupon),
    providerData: raw,
  } satisfies NormalizedOrder;
}

const blOrderNormalizationSchema = blOrderResponseSchema.transform(transformBrickLinkOrder);
export type NormalizedBrickLinkOrder = z.infer<typeof blOrderNormalizationSchema>;

const blOrderItemBatchesSchema = z.array(z.array(blOrderItemResponseSchema));

function transformBrickLinkItem(orderId: string, item: BLOrderItemResponse): NormalizedOrderItem {
  const unitPrice = parseNumberLike(item.unit_price);
  const unitPriceFinal = parseNumberLike(item.unit_price_final);
  const location = item.remarks?.trim() || "UNKNOWN";

  return {
    providerOrderKey: orderId,
    providerItemId: item.inventory_id ? String(item.inventory_id) : undefined,
    itemNo: item.item.no,
    itemName: item.item.name,
    itemType: item.item.type,
    itemCategoryId: item.item.category_id,
    colorId: item.color_id,
    colorName: item.color_name ?? undefined,
    quantity: item.quantity,
    condition: item.new_or_used === "N" ? "new" : "used",
    completeness: item.completeness ?? undefined,
    unitPrice,
    unitPriceFinal,
    currencyCode: item.currency_code ?? undefined,
    remarks: item.remarks ?? undefined,
    description: item.description ?? undefined,
    weight: parseNumberLike(item.weight),
    location,
    status: "unpicked",
    providerData: item,
  } satisfies NormalizedOrderItem;
}

export type NormalizedBrickLinkOrderItem = ReturnType<typeof transformBrickLinkItem>;

export function normalizeBrickLinkOrder(orderData: unknown): NormalizedBrickLinkOrder {
  return blOrderNormalizationSchema.parse(orderData);
}

export function normalizeBrickLinkOrderItems(
  orderId: string,
  orderItemsData: unknown,
): NormalizedBrickLinkOrderItem[] {
  const batches = blOrderItemBatchesSchema.parse(orderItemsData);
  const normalized: NormalizedOrderItem[] = [];

  for (const batch of batches) {
    for (const item of batch) {
      normalized.push(transformBrickLinkItem(orderId, item));
    }
  }

  return normalized;
}

