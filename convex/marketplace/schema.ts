import { defineTable } from "convex/server";
import { v } from "convex/values";

export const marketplaceTables = {
  // User marketplace credentials (BYOK model) - encrypted at rest
  marketplaceCredentials: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    // Encrypted OAuth 1.0a credentials for BrickLink
    bricklinkConsumerKey: v.optional(v.string()), // encrypted
    bricklinkConsumerSecret: v.optional(v.string()), // encrypted
    bricklinkTokenValue: v.optional(v.string()), // encrypted
    bricklinkTokenSecret: v.optional(v.string()), // encrypted
    // Encrypted API key for BrickOwl
    brickowlApiKey: v.optional(v.string()), // encrypted
    // Metadata
    isActive: v.boolean(),
    syncEnabled: v.optional(v.boolean()), // Default: true for backward compatibility
    lastValidatedAt: v.optional(v.number()),
    validationStatus: v.optional(
      v.union(v.literal("success"), v.literal("pending"), v.literal("failed")),
    ),
    validationMessage: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Webhook configuration for BrickLink push notifications
    webhookToken: v.optional(v.string()), // Unique token for webhook URL routing
    lastCentralPolledAt: v.optional(v.number()), // Last time GET /notifications was called
  })
    .index("by_business_provider", ["businessAccountId", "provider"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_webhookToken", ["webhookToken"])
    .index("by_provider_active", ["provider", "isActive"]),

  // Per-business-account rate limiting for marketplace APIs
  marketplaceRateLimits: defineTable({
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    // Quota tracking
    windowStart: v.number(), // Unix timestamp when current window started
    requestCount: v.number(), // Requests made in current window
    capacity: v.number(), // Max requests per window (see marketplace/rateLimitConfig.ts)
    windowDurationMs: v.number(), // Window size in ms (see marketplace/rateLimitConfig.ts)
    // Alerting
    alertThreshold: v.number(), // Percentage (0-1) to trigger alert (default: 0.8)
    alertEmitted: v.boolean(), // Whether alert has been sent for current window
    // Circuit breaker
    consecutiveFailures: v.number(), // Track failures for circuit breaker
    circuitBreakerOpenUntil: v.optional(v.number()), // If set, circuit is open
    // Metadata
    lastRequestAt: v.number(),
    lastResetAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business_provider", ["businessAccountId", "provider"]),

  // BrickLink push notifications (from webhooks or polling)
  bricklinkNotifications: defineTable({
    businessAccountId: v.id("businessAccounts"),
    eventType: v.union(v.literal("Order"), v.literal("Message"), v.literal("Feedback")),
    resourceId: v.number(), // Order ID, Message ID, or Feedback ID
    timestamp: v.string(), // ISO 8601 timestamp from BrickLink
    occurredAt: v.number(), // Parsed timestamp in ms (epoch)
    dedupeKey: v.string(), // storeId:event_type:resource_id:timestamp for idempotency
    status: v.union(
      v.literal("pending"), // Not yet processed
      v.literal("processing"), // Currently being processed
      v.literal("completed"), // Successfully processed
      v.literal("failed"), // Processing failed (will retry)
      v.literal("dead_letter"), // Failed after max attempts
    ),
    attempts: v.number(), // Number of processing attempts
    lastError: v.optional(v.string()), // Last error message if failed
    processedAt: v.optional(v.number()), // When processing completed
    createdAt: v.number(), // When notification was received/created
    updatedAt: v.number(),
  })
    .index("by_business_status", ["businessAccountId", "status"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_business_created", ["businessAccountId", "createdAt"]),

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
    status: v.string(), // PENDING, COMPLETED, etc.
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["businessAccountId", "orderId"])
    .index("by_business_item", ["businessAccountId", "itemNo", "colorId"]),
};
