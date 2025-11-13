import { z } from "zod";

import {
  parseNumberLike,
  parseTimestampLike,
  requireOrderId,
  stringifyAddress,
} from "../../../../lib/normalization";
import type { NormalizedOrder, NormalizedOrderItem } from "../../../../orders/normalizers/types";
import {
  boOrderItemResponseSchema,
  boOrderItemsResponseSchema,
  boOrderResponseSchema,
  type BOOrderItemResponse,
  type BOOrderResponse,
} from "../schema";

const BRICKOWL_STATUS_MAP: Record<string, NormalizedOrder["status"]> = {
  "0": "PENDING",
  "1": "UPDATED",
  "2": "PAID",
  "3": "PROCESSING",
  "4": "READY",
  "5": "SHIPPED",
  "6": "RECEIVED",
  "7": "HOLD",
  "8": "CANCELLED",
  pending: "PENDING",
  "payment submitted": "UPDATED",
  "payment received": "PAID",
  processing: "PROCESSING",
  processed: "READY",
  shipped: "SHIPPED",
  received: "RECEIVED",
  "on hold": "HOLD",
  cancelled: "CANCELLED",
};

function normalizeBrickOwlStatus(status: unknown): NormalizedOrder["status"] {
  if (status === undefined || status === null) {
    return "PENDING";
  }

  const key =
    typeof status === "number"
      ? String(status)
      : typeof status === "string"
        ? status.trim().toLowerCase()
        : "";

  return BRICKOWL_STATUS_MAP[key] ?? "PENDING";
}

function normalizeBrickOwlCondition(condition: unknown): "new" | "used" | undefined {
  if (condition === undefined || condition === null) {
    return undefined;
  }
  const value = String(condition).toLowerCase();
  if (value.startsWith("new")) {
    return "new";
  }
  if (value.startsWith("used")) {
    return "used";
  }
  if (value === "n") {
    return "new";
  }
  if (value === "u") {
    return "used";
  }
  return undefined;
}

function transformBrickOwlOrder(raw: BOOrderResponse): NormalizedOrder {
  const rawRecord = raw as Record<string, unknown>;
  const orderId = requireOrderId(
    raw.order_id ??
      raw.id ??
      rawRecord.orderId ??
      rawRecord.orderID ??
      rawRecord.uuid,
    {
      provider: "brickowl",
      field: "orderId",
    },
  );

  const buyer =
    (raw.buyer as Record<string, unknown> | undefined) ??
    (raw.customer as Record<string, unknown> | undefined);
  const shipping = raw.shipping as Record<string, unknown> | undefined;
  const payment = raw.payment as Record<string, unknown> | undefined;
  const store = raw.store as Record<string, unknown> | undefined;

  const paymentCurrency =
    (payment?.currency as string | undefined) ??
    (payment?.currency_code as string | undefined) ??
    (rawRecord.currency as string | undefined) ??
    (rawRecord.currency_code as string | undefined);

  return {
    orderId,
    externalOrderKey: raw.order_number
      ? String(raw.order_number)
      : raw.store_id
        ? `${orderId}:${raw.store_id}`
        : orderId,
    dateOrdered:
      parseTimestampLike(raw.created ?? raw.order_time ?? raw.created_at) ?? Date.now(),
    dateStatusChanged: parseTimestampLike(raw.updated ?? raw.updated_at),
    status: normalizeBrickOwlStatus(raw.status ?? raw.status_id ?? raw.status_text),
    providerStatus:
      typeof raw.status === "string"
        ? raw.status
        : raw.status_text
          ? String(raw.status_text)
          : raw.status_id !== undefined
            ? String(raw.status_id)
            : undefined,
    buyerName:
      (buyer?.username as string | undefined) ??
      (buyer?.name as string | undefined) ??
      (raw.buyer_name as string | undefined),
    buyerEmail:
      (buyer?.email as string | undefined) ?? (raw.buyer_email as string | undefined),
    buyerOrderCount: parseNumberLike(buyer?.order_count ?? raw.buyer_order_count),
    storeName: (raw.store_name as string | undefined) ?? (store?.name as string | undefined),
    sellerName: raw.seller_name as string | undefined,
    remarks:
      (raw.note as string | undefined) ??
      (raw.notes as string | undefined) ??
      (raw.remark as string | undefined),
    totalCount: parseNumberLike(raw.total_items ?? raw.total_quantity ?? raw.item_count),
    lotCount: parseNumberLike(raw.unique_items ?? raw.unique_count),
    totalWeight: parseNumberLike(raw.total_weight),
    paymentMethod: payment?.method as string | undefined,
    paymentCurrencyCode: paymentCurrency ? String(paymentCurrency) : undefined,
    paymentDatePaid: parseTimestampLike(payment?.date_paid ?? rawRecord.payment_time),
    paymentStatus: payment?.status ? String(payment.status) : undefined,
    shippingMethod:
      (shipping?.method as string | undefined) ?? (rawRecord.shipping_method as string | undefined),
    shippingMethodId:
      shipping?.method_id !== undefined ? String(shipping.method_id) : undefined,
    shippingTrackingNo:
      (shipping?.tracking_id as string | undefined) ??
      (shipping?.tracking_no as string | undefined) ??
      (rawRecord.tracking_id as string | undefined),
    shippingTrackingLink:
      (shipping?.tracking_url as string | undefined) ??
      (shipping?.tracking_link as string | undefined),
    shippingDateShipped: parseTimestampLike(shipping?.date_shipped ?? rawRecord.shipped_time),
    shippingAddress: stringifyAddress(shipping?.address),
    costCurrencyCode: paymentCurrency ? String(paymentCurrency) : undefined,
    costSubtotal: parseNumberLike(raw.subtotal ?? raw.items_total),
    costGrandTotal: parseNumberLike(raw.total ?? raw.grand_total),
    costSalesTax: parseNumberLike(raw.tax_total),
    costFinalTotal: parseNumberLike(raw.final_total ?? raw.total),
    costInsurance: parseNumberLike(raw.insurance_total),
    costShipping: parseNumberLike(raw.shipping_total),
    costCredit: parseNumberLike(raw.credit_total ?? raw.discount_total),
    costCoupon: parseNumberLike(raw.coupon_total),
    providerData: raw,
  } satisfies NormalizedOrder;
}

const boOrderNormalizationSchema = boOrderResponseSchema.transform(transformBrickOwlOrder);
export type NormalizedBrickOwlOrder = z.infer<typeof boOrderNormalizationSchema>;

const boOrderItemsInputSchema = z.union([
  boOrderItemsResponseSchema,
  z
    .object({
      items: boOrderItemsResponseSchema.optional(),
    })
    .transform((value) => value.items ?? []),
]);

function transformBrickOwlItem(orderId: string, item: BOOrderItemResponse): NormalizedOrderItem {
  const quantity =
    parseNumberLike(item.quantity ?? item.qty ?? item.total_quantity) ?? 0;
  const unitPrice = parseNumberLike(item.price ?? item.unit_price);
  const unitPriceFinal = parseNumberLike(item.final_price ?? item.price);

  return {
    providerOrderKey: (item.order_id as string | undefined) ?? orderId,
    providerItemId:
      (item.order_item_id as string | undefined) ??
      (item.lot_id as string | undefined) ??
      undefined,
    itemNo:
      (item.boid as string | undefined) ??
        (item.item_no as string | undefined) ??
        (item.external_id as string | undefined) ??
        requireOrderId(item.lot_id ?? item.order_item_id ?? orderId, {
          provider: "brickowl",
          field: "orderItemId",
        }),
    itemName: item.name as string | undefined,
    itemType: item.type as string | undefined,
    itemCategoryId: parseNumberLike(item.category_id),
    colorId: parseNumberLike(item.color_id),
    colorName: item.color_name as string | undefined,
    quantity,
    condition: normalizeBrickOwlCondition(item.condition),
    completeness: item.completeness as string | undefined,
    unitPrice,
    unitPriceFinal,
    currencyCode: (item.currency as string | undefined) ?? undefined,
    remarks:
      (item.note as string | undefined) ??
      (item.remarks as string | undefined) ??
      undefined,
    description: item.description as string | undefined,
    weight: parseNumberLike(item.weight),
    location:
      (item.location as string | undefined) ??
      (item.bin as string | undefined) ??
      undefined,
    status: "unpicked",
    providerData: item,
  } satisfies NormalizedOrderItem;
}

export type NormalizedBrickOwlOrderItem = ReturnType<typeof transformBrickOwlItem>;

export function normalizeBrickOwlOrder(orderData: unknown): NormalizedBrickOwlOrder {
  return boOrderNormalizationSchema.parse(orderData);
}

export function normalizeBrickOwlOrderItems(
  orderId: string,
  orderItemsData: unknown,
): NormalizedBrickOwlOrderItem[] {
  const parsedItems = boOrderItemsInputSchema.parse(orderItemsData);
  return parsedItems.map((item) => transformBrickOwlItem(orderId, item));
}

