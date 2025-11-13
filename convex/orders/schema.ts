import { defineTable } from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";

export const ORDER_STATUS_VALUES = [
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
] as const;

export const orderStatusValidator = v.union(
  ...ORDER_STATUS_VALUES.map((status) => v.literal(status)),
);

export type OrderStatus = Infer<typeof orderStatusValidator>;

export const ORDER_ITEM_STATUS_VALUES = [
  "picked",
  "unpicked",
  "skipped",
  "issue",
] as const;

export const orderItemStatusValidator = v.union(
  ...ORDER_ITEM_STATUS_VALUES.map((status) => v.literal(status)),
);

export type OrderItemStatus = Infer<typeof orderItemStatusValidator>;

export const ordersTables = {
  orders: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    orderId: v.string(),
    externalOrderKey: v.optional(v.string()), // Provider-specific identifier when different from orderId
    dateOrdered: v.number(),
    dateStatusChanged: v.optional(v.number()),
    status: orderStatusValidator,
    providerStatus: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerOrderCount: v.optional(v.number()),
    storeName: v.optional(v.string()),
    sellerName: v.optional(v.string()),
    remarks: v.optional(v.string()),
    totalCount: v.optional(v.number()),
    lotCount: v.optional(v.number()),
    totalWeight: v.optional(v.number()),
    paymentMethod: v.optional(v.string()),
    paymentCurrencyCode: v.optional(v.string()),
    paymentDatePaid: v.optional(v.number()),
    paymentStatus: v.optional(v.string()),
    shippingMethod: v.optional(v.string()),
    shippingMethodId: v.optional(v.string()),
    shippingTrackingNo: v.optional(v.string()),
    shippingTrackingLink: v.optional(v.string()),
    shippingDateShipped: v.optional(v.number()),
    shippingAddress: v.optional(v.string()),
    costCurrencyCode: v.optional(v.string()),
    costSubtotal: v.optional(v.number()),
    costGrandTotal: v.optional(v.number()),
    costSalesTax: v.optional(v.number()),
    costFinalTotal: v.optional(v.number()),
    costInsurance: v.optional(v.number()),
    costShipping: v.optional(v.number()),
    costCredit: v.optional(v.number()),
    costCoupon: v.optional(v.number()),
    providerData: v.optional(v.any()),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_order", ["businessAccountId", "orderId"])
    .index("by_business_provider_order", ["businessAccountId", "provider", "orderId"])
    .index("by_business_status", ["businessAccountId", "status"])
    .index("by_business_date", ["businessAccountId", "dateOrdered"])
    .index("by_business_paymentStatus", ["businessAccountId", "paymentStatus"])
    .index("by_business_provider_date", ["businessAccountId", "provider", "dateOrdered"])
    .index("by_business_status_dateOrdered", ["businessAccountId", "status", "dateOrdered"])
    .index("by_business_provider_status", ["businessAccountId", "provider", "status"])
    .index("by_business_costGrandTotal", ["businessAccountId", "costGrandTotal"])
    .index("by_business_totalCount", ["businessAccountId", "totalCount"])
    .index("by_business_dateStatusChanged", ["businessAccountId", "dateStatusChanged"])
    .index("by_business_buyerName", ["businessAccountId", "buyerName"])
    .searchIndex("search_orders_orderId", {
      searchField: "orderId",
      filterFields: ["businessAccountId", "provider"],
    })
    .searchIndex("search_orders_buyerName", {
      searchField: "buyerName",
      filterFields: ["businessAccountId", "provider"],
    })
    .searchIndex("search_orders_paymentMethod", {
      searchField: "paymentMethod",
      filterFields: ["businessAccountId", "provider"],
    })
    .searchIndex("search_orders_shippingMethod", {
      searchField: "shippingMethod",
      filterFields: ["businessAccountId", "provider"],
    }),

  orderItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    orderId: v.string(),
    providerOrderKey: v.optional(v.string()),
    providerItemId: v.optional(v.string()),
    itemNo: v.string(),
    itemName: v.optional(v.string()),
    itemType: v.optional(v.string()),
    itemCategoryId: v.optional(v.number()),
    colorId: v.optional(v.number()),
    colorName: v.optional(v.string()),
    quantity: v.number(),
    condition: v.optional(v.string()),
    completeness: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    unitPriceFinal: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    remarks: v.optional(v.string()),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    location: v.optional(v.string()),
    status: orderItemStatusValidator,
    providerData: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["businessAccountId", "orderId"])
    .index("by_business_item", ["businessAccountId", "itemNo", "colorId"])
    .index("by_business_provider_order", ["businessAccountId", "provider", "orderId"]),

  orderNotifications: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    eventType: v.string(),
    resourceId: v.string(),
    timestamp: v.number(),
    occurredAt: v.number(),
    dedupeKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("dead_letter"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    payloadSnapshot: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_provider_status", ["businessAccountId", "provider", "status"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_business_created", ["businessAccountId", "createdAt"]),
};
