import { defineTable } from "convex/server";
import { v } from "convex/values";

export const ordersTables = {
  // BrickLink orders (full order data fetched from API)
  bricklinkOrders: defineTable({
    businessAccountId: v.id("businessAccounts"),
    orderId: v.string(), // BrickLink order_id
    dateOrdered: v.number(), // Parsed timestamp
    dateStatusChanged: v.number(), // Parsed timestamp
    sellerName: v.string(),
    storeName: v.string(),
    buyerName: v.string(),
    buyerEmail: v.string(),
    buyerOrderCount: v.number(),
    requireInsurance: v.boolean(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("UPDATED"),
      v.literal("PROCESSING"),
      v.literal("READY"),
      v.literal("PAID"),
      v.literal("PACKED"),
      v.literal("SHIPPED"),
      v.literal("RECEIVED"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED"),
      v.literal("HOLD"),
    ), // BrickLink order status values. Alert statuses (OCR, NPB, NPX, NRS, NSS) are mapped to HOLD during ingestion.
    isInvoiced: v.boolean(),
    isFiled: v.boolean(),
    driveThruSent: v.boolean(),
    salesTaxCollectedByBl: v.boolean(),
    remarks: v.optional(v.string()),
    totalCount: v.number(),
    lotCount: v.number(),
    totalWeight: v.optional(v.number()),
    // Payment info
    paymentMethod: v.optional(v.string()),
    paymentCurrencyCode: v.optional(v.string()),
    paymentDatePaid: v.optional(v.number()),
    paymentStatus: v.optional(v.string()),
    // Shipping info
    shippingMethod: v.optional(v.string()),
    shippingMethodId: v.optional(v.string()),
    shippingTrackingNo: v.optional(v.string()),
    shippingTrackingLink: v.optional(v.string()),
    shippingDateShipped: v.optional(v.number()),
    // Address (stored as JSON string for simplicity)
    shippingAddress: v.optional(v.string()), // JSON string
    // Cost info
    costCurrencyCode: v.string(),
    costSubtotal: v.number(),
    costGrandTotal: v.number(),
    costSalesTaxCollectedByBL: v.optional(v.number()),
    costFinalTotal: v.optional(v.number()),
    costEtc1: v.optional(v.number()),
    costEtc2: v.optional(v.number()),
    costInsurance: v.optional(v.number()),
    costShipping: v.optional(v.number()),
    costCredit: v.optional(v.number()),
    costCoupon: v.optional(v.number()),
    // Metadata
    lastSyncedAt: v.number(), // Last time order data was fetched from BrickLink
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Existing indexes
    .index("by_business_order", ["businessAccountId", "orderId"]) // Also used for orderId sorting
    .index("by_business_status", ["businessAccountId", "status"])
    .index("by_business_date", ["businessAccountId", "dateOrdered"])
    // Indexes for sorting and filtering
    .index("by_business_buyerName", ["businessAccountId", "buyerName"])
    .index("by_business_status_dateOrdered", ["businessAccountId", "status", "dateOrdered"])
    .index("by_business_costGrandTotal", ["businessAccountId", "costGrandTotal"])
    .index("by_business_totalCount", ["businessAccountId", "totalCount"])
    .index("by_business_dateStatusChanged", ["businessAccountId", "dateStatusChanged"])
    .index("by_business_paymentStatus", ["businessAccountId", "paymentStatus"])
    .searchIndex("search_orders_orderId", {
      searchField: "orderId",
      filterFields: ["businessAccountId"],
    })
    .searchIndex("search_orders_buyerName", {
      searchField: "buyerName",
      filterFields: ["businessAccountId"],
    })
    .searchIndex("search_orders_paymentMethod", {
      searchField: "paymentMethod",
      filterFields: ["businessAccountId"],
    })
    .searchIndex("search_orders_shippingMethod", {
      searchField: "shippingMethod",
      filterFields: ["businessAccountId"],
    }),

  // BrickLink order items (line items for orders)
  bricklinkOrderItems: defineTable({
    businessAccountId: v.id("businessAccounts"),
    orderId: v.string(), // BrickLink order_id (references bricklinkOrders)
    inventoryId: v.optional(v.number()), // BrickLink inventory_id if applicable
    itemNo: v.string(), // Part/set/minifig number
    itemName: v.string(),
    itemType: v.string(), // PART, SET, MINIFIG, etc.
    itemCategoryId: v.optional(v.number()),
    colorId: v.number(),
    colorName: v.optional(v.string()),
    quantity: v.number(),
    newOrUsed: v.string(), // N or U
    completeness: v.optional(v.string()), // C, B, S (for SETs)
    unitPrice: v.number(), // Original unit price
    unitPriceFinal: v.number(), // Final unit price after tiered pricing
    currencyCode: v.string(),
    remarks: v.optional(v.string()),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    location: v.string(), // Location from inventory item or BrickLink API
    status: v.union(
      v.literal("picked"),
      v.literal("unpicked"),
      v.literal("skipped"),
      v.literal("issue"),
    ), // Picking status (default: "unpicked")
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["businessAccountId", "orderId"])
    .index("by_business_item", ["businessAccountId", "itemNo", "colorId"]),
};
