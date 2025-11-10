import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type {
  BricklinkOrderItemResponse,
  BricklinkOrderResponse,
} from "../marketplaces/bricklink/schema";
import type { BOOrderItemResponse, BOOrderResponse } from "../marketplaces/brickowl/schema";
import type { Id } from "../_generated/dataModel";
import { getCurrentAvailableFromLedger, getNextSeqForItem } from "../inventory/helpers";

type OrderItemStatus = "picked" | "unpicked" | "skipped" | "issue";

interface NormalizedOrder {
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

interface NormalizedOrderItem {
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

const BRICKOWL_STATUS_MAP: Record<string, OrderStatus> = {
  "0": "PENDING",
  "1": "UPDATED", // Payment Submitted
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

const BRICKLINK_ALERT_STATUSES = new Set(["OCR", "NPB", "NPX", "NRS", "NSS"]);

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    // assume seconds if clearly UNIX style (10 digits) and not milliseconds
    if (value > 0 && value < 1e11) {
      return value * 1000;
    }
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return toTimestamp(numeric);
    }
  }

  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function ensureOrderId(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return String(raw);
  }
  throw new Error("Order payload missing required order identifier");
}

function normalizeBricklinkStatus(status: string): OrderStatus {
  const normalized = status.toUpperCase().trim();
  if (BRICKLINK_ALERT_STATUSES.has(normalized)) {
    return "HOLD";
  }

  const allowed: OrderStatus[] = [
    "PENDING",
    "UPDATED",
    "PROCESSING",
    "READY",
    "PAID",
    "PACKED",
    "SHIPPED",
    "RECEIVED",
    "COMPLETED",
    "CANCELLED",
    "HOLD",
    "ARCHIVED",
  ];

  if (allowed.includes(normalized as OrderStatus)) {
    return normalized as OrderStatus;
  }

  throw new Error(`Unknown BrickLink order status: ${status}`);
}

function normalizeBricklinkOrder(order: BricklinkOrderResponse): NormalizedOrder {
  return {
    orderId: order.order_id,
    externalOrderKey: order.resource_id ? String(order.resource_id) : order.order_id,
    dateOrdered: toTimestamp(order.date_ordered) ?? Date.now(),
    dateStatusChanged: toTimestamp(order.date_status_changed),
    status: normalizeBricklinkStatus(order.status),
    providerStatus: order.status,
    buyerName: order.buyer_name,
    buyerEmail: order.buyer_email,
    buyerOrderCount: order.buyer_order_count,
    storeName: order.store_name,
    sellerName: order.seller_name,
    remarks: order.remarks ?? undefined,
    totalCount: order.total_count,
    lotCount: order.unique_count,
    totalWeight: order.total_weight ? Number(order.total_weight) : undefined,
    paymentMethod: order.payment?.method,
    paymentCurrencyCode: order.payment?.currency_code,
    paymentDatePaid: toTimestamp(order.payment?.date_paid),
    paymentStatus: order.payment?.status,
    shippingMethod: order.shipping?.method,
    shippingMethodId: order.shipping?.method_id ? String(order.shipping.method_id) : undefined,
    shippingTrackingNo: order.shipping?.tracking_no,
    shippingTrackingLink: order.shipping?.tracking_link,
    shippingDateShipped: toTimestamp(order.shipping?.date_shipped),
    shippingAddress: order.shipping?.address ? JSON.stringify(order.shipping.address) : undefined,
    costCurrencyCode: order.cost.currency_code,
    costSubtotal: Number(order.cost.subtotal),
    costGrandTotal: Number(order.cost.grand_total),
    costSalesTax: order.cost.salesTax_collected_by_BL
      ? Number(order.cost.salesTax_collected_by_BL)
      : undefined,
    costFinalTotal: order.cost.final_total ? Number(order.cost.final_total) : undefined,
    costInsurance: order.cost.insurance ? Number(order.cost.insurance) : undefined,
    costShipping: order.cost.shipping ? Number(order.cost.shipping) : undefined,
    costCredit: order.cost.credit ? Number(order.cost.credit) : undefined,
    costCoupon: order.cost.coupon ? Number(order.cost.coupon) : undefined,
    providerData: order,
  };
}

function normalizeBricklinkOrderItems(
  orderId: string,
  batches: BricklinkOrderItemResponse[][],
): NormalizedOrderItem[] {
  const normalized: NormalizedOrderItem[] = [];

  for (const batch of batches) {
    for (const item of batch) {
      const location = item.remarks?.trim() || "UNKNOWN";
      const unitPrice = Number(item.unit_price);
      const unitPriceFinal = Number(item.unit_price_final);

      normalized.push({
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
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
        unitPriceFinal: Number.isFinite(unitPriceFinal) ? unitPriceFinal : undefined,
        currencyCode: item.currency_code ?? undefined,
        remarks: item.remarks ?? undefined,
        description: item.description ?? undefined,
        weight: item.weight ? Number(item.weight) : undefined,
        location,
        status: "unpicked",
        providerData: item,
      });
    }
  }

  return normalized;
}

function normalizeBrickOwlStatus(status: unknown): OrderStatus {
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

function normalizeBrickOwlOrder(orderData: BOOrderResponse): NormalizedOrder {
  const rawOrder = orderData as Record<string, unknown>;
  const orderId = ensureOrderId(
    rawOrder.order_id ?? rawOrder.id ?? rawOrder.orderId ?? rawOrder.orderID ?? rawOrder.uuid,
  );

  const buyer =
    (rawOrder.buyer as Record<string, unknown> | undefined) ??
    (rawOrder.customer as Record<string, unknown> | undefined);
  const shipping = rawOrder.shipping as Record<string, unknown> | undefined;
  const payment = rawOrder.payment as Record<string, unknown> | undefined;
  const store = rawOrder.store as Record<string, unknown> | undefined;

  const paymentCurrency =
    payment?.currency ??
    payment?.currency_code ??
    rawOrder.currency ??
    rawOrder.currency_code ??
    undefined;

  return {
    orderId,
    externalOrderKey: rawOrder.order_number
      ? String(rawOrder.order_number)
      : rawOrder.store_id
        ? `${orderId}:${rawOrder.store_id}`
        : orderId,
    dateOrdered:
      toTimestamp(rawOrder.created ?? rawOrder.order_time ?? rawOrder.created_at) ?? Date.now(),
    dateStatusChanged: toTimestamp(rawOrder.updated ?? rawOrder.updated_at),
    status: normalizeBrickOwlStatus(rawOrder.status ?? rawOrder.status_id ?? rawOrder.status_text),
    providerStatus:
      typeof rawOrder.status === "string"
        ? rawOrder.status
        : rawOrder.status_text
          ? String(rawOrder.status_text)
          : rawOrder.status_id !== undefined
            ? String(rawOrder.status_id)
            : undefined,
    buyerName:
      (buyer?.username as string | undefined) ??
      (buyer?.name as string | undefined) ??
      (rawOrder.buyer_name as string | undefined),
    buyerEmail:
      (buyer?.email as string | undefined) ?? (rawOrder.buyer_email as string | undefined),
    buyerOrderCount: toNumber(buyer?.order_count ?? rawOrder.buyer_order_count),
    storeName: (rawOrder.store_name as string | undefined) ?? (store?.name as string | undefined),
    sellerName: rawOrder.seller_name as string | undefined,
    remarks:
      (rawOrder.note as string | undefined) ??
      (rawOrder.notes as string | undefined) ??
      (rawOrder.remark as string | undefined),
    totalCount: toNumber(rawOrder.total_items ?? rawOrder.total_quantity ?? rawOrder.item_count),
    lotCount: toNumber(rawOrder.unique_items ?? rawOrder.unique_count),
    totalWeight: toNumber(rawOrder.total_weight),
    paymentMethod: payment?.method as string | undefined,
    paymentCurrencyCode: paymentCurrency ? String(paymentCurrency) : undefined,
    paymentDatePaid: toTimestamp(payment?.date_paid ?? rawOrder.payment_time),
    paymentStatus: payment?.status ? String(payment.status) : undefined,
    shippingMethod:
      (shipping?.method as string | undefined) ?? (rawOrder.shipping_method as string | undefined),
    shippingMethodId: shipping?.method_id !== undefined ? String(shipping.method_id) : undefined,
    shippingTrackingNo:
      (shipping?.tracking_id as string | undefined) ??
      (shipping?.tracking_no as string | undefined) ??
      (rawOrder.tracking_id as string | undefined),
    shippingTrackingLink:
      (shipping?.tracking_url as string | undefined) ??
      (shipping?.tracking_link as string | undefined),
    shippingDateShipped: toTimestamp(shipping?.date_shipped ?? rawOrder.shipped_time),
    shippingAddress: shipping?.address ? JSON.stringify(shipping.address) : undefined,
    costCurrencyCode: paymentCurrency ? String(paymentCurrency) : undefined,
    costSubtotal: toNumber(rawOrder.subtotal ?? rawOrder.items_total),
    costGrandTotal: toNumber(rawOrder.total ?? rawOrder.grand_total),
    costSalesTax: toNumber(rawOrder.tax_total),
    costFinalTotal: toNumber(rawOrder.final_total ?? rawOrder.total),
    costInsurance: toNumber(rawOrder.insurance_total),
    costShipping: toNumber(rawOrder.shipping_total),
    costCredit: toNumber(rawOrder.credit_total ?? rawOrder.discount_total),
    costCoupon: toNumber(rawOrder.coupon_total),
    providerData: orderData,
  };
}

function normalizeBrickOwlOrderItems(
  orderId: string,
  rawItems: BOOrderItemResponse[] | Record<string, unknown>,
): NormalizedOrderItem[] {
  const itemsArray = Array.isArray(rawItems)
    ? rawItems
    : Array.isArray((rawItems as Record<string, unknown>).items)
      ? (rawItems as { items: BOOrderItemResponse[] }).items ?? []
      : [];

  return itemsArray.map((item) => {
    const itemRecord = item as Record<string, unknown>;
    const quantity =
      toNumber(itemRecord.quantity ?? itemRecord.qty ?? itemRecord.total_quantity) ?? 0;
    const unitPrice = toNumber(itemRecord.price ?? itemRecord.unit_price);
    const unitPriceFinal = toNumber(itemRecord.final_price ?? itemRecord.price);

    return {
      providerOrderKey: (itemRecord.order_id as string | undefined) ?? orderId,
      providerItemId:
        (itemRecord.order_item_id as string | undefined) ??
        (itemRecord.lot_id as string | undefined) ??
        undefined,
      itemNo:
        (itemRecord.boid as string | undefined) ??
        (itemRecord.item_no as string | undefined) ??
        (itemRecord.external_id as string | undefined) ??
        ensureOrderId(itemRecord.lot_id ?? itemRecord.order_item_id ?? orderId),
      itemName: itemRecord.name as string | undefined,
      itemType: itemRecord.type as string | undefined,
      itemCategoryId: toNumber(itemRecord.category_id),
      colorId: toNumber(itemRecord.color_id),
      colorName: itemRecord.color_name as string | undefined,
      quantity,
      condition: normalizeBrickOwlCondition(itemRecord.condition),
      completeness: itemRecord.completeness as string | undefined,
      unitPrice: unitPrice,
      unitPriceFinal: unitPriceFinal,
      currencyCode: (itemRecord.currency as string | undefined) ?? undefined,
      remarks:
        (itemRecord.note as string | undefined) ??
        (itemRecord.remarks as string | undefined) ??
        undefined,
      description: itemRecord.description as string | undefined,
      weight: toNumber(itemRecord.weight),
      location:
        (itemRecord.location as string | undefined) ??
        (itemRecord.bin as string | undefined) ??
        undefined,
      status: "unpicked",
      providerData: item,
    };
  });
}

async function findInventoryItem(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  item: NormalizedOrderItem,
) {
  let query = ctx.db
    .query("inventoryItems")
    .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
    .filter((q) => q.eq(q.field("partNumber"), item.itemNo));

  if (item.colorId !== undefined) {
    query = query.filter((q) => q.eq(q.field("colorId"), String(item.colorId)));
  }

  if (item.condition) {
    query = query.filter((q) => q.eq(q.field("condition"), item.condition));
  }

  if (item.location) {
    query = query.filter((q) => q.eq(q.field("location"), item.location));
  }

  return await query.first();
}

function mapOrder(provider: Provider, orderData: unknown): NormalizedOrder {
  if (provider === "bricklink") {
    return normalizeBricklinkOrder(orderData as BricklinkOrderResponse);
  }
  return normalizeBrickOwlOrder(orderData as BOOrderResponse);
}

function mapOrderItems(
  provider: Provider,
  orderId: string,
  orderItemsData: unknown,
): NormalizedOrderItem[] {
  if (provider === "bricklink") {
    return normalizeBricklinkOrderItems(orderId, orderItemsData as BricklinkOrderItemResponse[][]);
  }
  return normalizeBrickOwlOrderItems(orderId, orderItemsData as BOOrderItemResponse[]);
}

export const upsertOrder = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    orderData: v.any(),
    orderItemsData: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedOrder = mapOrder(args.provider, args.orderData);
    const normalizedItems = mapOrderItems(
      args.provider,
      normalizedOrder.orderId,
      args.orderItemsData,
    );

    const existing = await ctx.db
      .query("orders")
      .withIndex("by_business_provider_order", (q) =>
        q
          .eq("businessAccountId", args.businessAccountId)
          .eq("provider", args.provider)
          .eq("orderId", normalizedOrder.orderId),
      )
      .first();

    const orderDoc = {
      businessAccountId: args.businessAccountId,
      provider: args.provider,
      orderId: normalizedOrder.orderId,
      externalOrderKey: normalizedOrder.externalOrderKey,
      dateOrdered: normalizedOrder.dateOrdered,
      dateStatusChanged: normalizedOrder.dateStatusChanged,
      status: normalizedOrder.status,
      providerStatus: normalizedOrder.providerStatus,
      buyerName: normalizedOrder.buyerName,
      buyerEmail: normalizedOrder.buyerEmail,
      buyerOrderCount: normalizedOrder.buyerOrderCount,
      storeName: normalizedOrder.storeName,
      sellerName: normalizedOrder.sellerName,
      remarks: normalizedOrder.remarks,
      totalCount: normalizedOrder.totalCount,
      lotCount: normalizedOrder.lotCount,
      totalWeight: normalizedOrder.totalWeight,
      paymentMethod: normalizedOrder.paymentMethod,
      paymentCurrencyCode: normalizedOrder.paymentCurrencyCode,
      paymentDatePaid: normalizedOrder.paymentDatePaid,
      paymentStatus: normalizedOrder.paymentStatus,
      shippingMethod: normalizedOrder.shippingMethod,
      shippingMethodId: normalizedOrder.shippingMethodId,
      shippingTrackingNo: normalizedOrder.shippingTrackingNo,
      shippingTrackingLink: normalizedOrder.shippingTrackingLink,
      shippingDateShipped: normalizedOrder.shippingDateShipped,
      shippingAddress: normalizedOrder.shippingAddress,
      costCurrencyCode: normalizedOrder.costCurrencyCode,
      costSubtotal: normalizedOrder.costSubtotal,
      costGrandTotal: normalizedOrder.costGrandTotal,
      costSalesTax: normalizedOrder.costSalesTax,
      costFinalTotal: normalizedOrder.costFinalTotal,
      costInsurance: normalizedOrder.costInsurance,
      costShipping: normalizedOrder.costShipping,
      costCredit: normalizedOrder.costCredit,
      costCoupon: normalizedOrder.costCoupon,
      providerData: normalizedOrder.providerData,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, orderDoc);
    } else {
      await ctx.db.insert("orders", {
        ...orderDoc,
        createdAt: now,
      });
    }

    const existingItems = await ctx.db
      .query("orderItems")
      .withIndex("by_business_provider_order", (q) =>
        q
          .eq("businessAccountId", args.businessAccountId)
          .eq("provider", args.provider)
          .eq("orderId", normalizedOrder.orderId),
      )
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    const correlationId = crypto.randomUUID();

    for (const item of normalizedItems) {
      await ctx.db.insert("orderItems", {
        businessAccountId: args.businessAccountId,
        provider: args.provider,
        orderId: normalizedOrder.orderId,
        providerOrderKey: item.providerOrderKey,
        providerItemId: item.providerItemId,
        itemNo: item.itemNo,
        itemName: item.itemName,
        itemType: item.itemType,
        itemCategoryId: item.itemCategoryId,
        colorId: item.colorId,
        colorName: item.colorName,
        quantity: item.quantity,
        condition: item.condition,
        completeness: item.completeness,
        unitPrice: item.unitPrice,
        unitPriceFinal: item.unitPriceFinal,
        currencyCode: item.currencyCode,
        remarks: item.remarks,
        description: item.description,
        weight: item.weight,
        location: item.location,
        status: item.status,
        providerData: item.providerData,
        createdAt: now,
        updatedAt: now,
      });

      if (item.quantity <= 0) {
        continue;
      }

      const matchedInventoryItem = await findInventoryItem(ctx, args.businessAccountId, item);
      if (!matchedInventoryItem) {
        continue;
      }

      await ctx.db.patch(matchedInventoryItem._id, {
        quantityAvailable: matchedInventoryItem.quantityAvailable - item.quantity,
        quantityReserved: (matchedInventoryItem.quantityReserved || 0) + item.quantity,
        updatedAt: now,
      });

      const seq = await getNextSeqForItem(ctx.db, matchedInventoryItem._id);
      const preAvailable = await getCurrentAvailableFromLedger(ctx.db, matchedInventoryItem._id);
      const postAvailable = preAvailable - item.quantity;

      await ctx.db.insert("inventoryQuantityLedger", {
        businessAccountId: args.businessAccountId,
        itemId: matchedInventoryItem._id,
        timestamp: now,
        seq,
        preAvailable,
        postAvailable,
        deltaAvailable: -item.quantity,
        reason: "order_sale",
        source: args.provider,
        orderId: normalizedOrder.orderId,
        correlationId,
      });

      // TODO: Sync inventory quantity changes to OTHER marketplaces (not the originating provider).
    }
  },
});
