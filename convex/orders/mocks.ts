/**
 * Development-only test order creation
 * Creates realistic test orders without hitting Bricklink API
 *
 * IMPORTANT: Only available in development/staging environments
 */

import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type {
  BricklinkOrderResponse,
  BricklinkOrderItemResponse,
} from "../marketplaces/bricklink/storeClient";
import { requireActiveUser } from "../users/helpers";
import type { Id } from "../_generated/dataModel";

/**
 * Check if we're in development mode
 */
function isDevelopmentMode(): boolean {
  // Check for Convex dev deployment or local development
  const deploymentName = process.env.CONVEX_DEPLOYMENT;
  return (
    !deploymentName || deploymentName.startsWith("dev:") || deploymentName.includes("development")
  );
}

/**
 * Generate realistic test order data
 * @param overrides - Optional overrides for order data
 * @param overrides.status - Valid BrickLink order status (PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD)
 *                           Alert statuses (OCR, NPB, NPX, NRS, NSS) will be automatically mapped to HOLD during ingestion
 */
function _createTestOrderData(overrides?: {
  orderId?: string;
  buyerName?: string;
  status?: string;
  itemCount?: number;
}): {
  orderData: BricklinkOrderResponse;
  orderItemsData: BricklinkOrderItemResponse[][];
} {
  const orderId = overrides?.orderId || `TEST-${Date.now()}`;
  const now = new Date().toISOString();
  const buyerName = overrides?.buyerName || "Test Buyer";
  // Valid status values: PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD
  // Alert statuses (OCR, NPB, NPX, NRS, NSS) will be mapped to HOLD during ingestion
  const status = overrides?.status || "PENDING";
  const itemCount = overrides?.itemCount || 3;

  // Create realistic test order
  const orderData: BricklinkOrderResponse = {
    order_id: orderId,
    date_ordered: now,
    date_status_changed: now,
    seller_name: "Test Store",
    store_name: "Test Store",
    buyer_name: buyerName,
    buyer_email: `${buyerName.toLowerCase().replace(" ", ".")}@example.com`,
    buyer_order_count: 5,
    require_insurance: false,
    status: status,
    is_invoiced: false,
    is_filed: false,
    drive_thru_sent: false,
    salesTax_collected_by_bl: false,
    remarks: "Test order created for development",
    total_count: itemCount,
    unique_count: itemCount,
    total_weight: "0.5",
    payment: {
      method: "PayPal",
      currency_code: "USD",
      status: status === "PENDING" ? "Pending" : "Received",
      ...(status !== "PENDING" && { date_paid: now }),
    },
    shipping: {
      method: "USPS Priority",
      method_id: "1",
      address: {
        name: {
          full: buyerName,
          first: buyerName.split(" ")[0] || "Test",
          last: buyerName.split(" ")[1] || "Buyer",
        },
        full: `${buyerName}\n123 Test St\nAnytown, ST 12345`,
        address1: "123 Test St",
        city: "Anytown",
        state: "ST",
        postal_code: "12345",
        country_code: "US",
        phone_number: "+1-555-0123",
      },
    },
    cost: {
      currency_code: "USD",
      subtotal: (itemCount * 2.5).toFixed(2),
      grand_total: (itemCount * 2.5 + 5.0).toFixed(2),
      shipping: "5.00",
    },
  };

  // Create test order items with variety
  const items: BricklinkOrderItemResponse[] = [];

  // Realistic LEGO parts for variety
  const testParts = [
    { no: "3001", name: "Brick 2 x 4", category_id: 5 },
    { no: "3002", name: "Brick 2 x 3", category_id: 5 },
    { no: "3004", name: "Brick 1 x 2", category_id: 5 },
    { no: "3020", name: "Plate 2 x 4", category_id: 6 },
    { no: "3622", name: "Brick 1 x 3", category_id: 5 },
    { no: "3710", name: "Plate 1 x 4", category_id: 6 },
  ];

  const testColors = [
    { id: 0, name: "Black" },
    { id: 1, name: "Blue" },
    { id: 4, name: "Red" },
    { id: 15, name: "Trans-Clear" },
    { id: 85, name: "Dark Bluish Gray" },
    { id: 86, name: "Light Bluish Gray" },
  ];

  for (let i = 0; i < itemCount; i++) {
    const part = testParts[i % testParts.length];
    const color = testColors[i % testColors.length];
    const quantity = (i % 3) + 1; // 1, 2, or 3
    const basePrice = 0.5 + (i % 5) * 0.25; // Vary prices from $0.50 to $1.75

    items.push({
      inventory_id: 1000000 + i,
      item: {
        no: part.no,
        name: part.name,
        type: "PART",
        category_id: part.category_id,
      },
      color_id: color.id,
      color_name: color.name,
      quantity: quantity,
      new_or_used: i % 3 === 0 ? "U" : "N", // Mix of new and used
      completeness: "C",
      unit_price: basePrice.toFixed(2),
      unit_price_final: basePrice.toFixed(2),
      currency_code: "USD",
      description: `${color.name} ${part.name}`,
      weight: (0.1 * quantity).toFixed(2),
    });
  }

  // Bricklink returns items in batches (nested arrays)
  // We'll put all items in a single batch
  const orderItemsData: BricklinkOrderItemResponse[][] = [items];

  return { orderData, orderItemsData };
}

/**
 * Get random parts from the parts table for test order generation
 */
async function _getRandomParts(
  ctx: MutationCtx,
  count: number,
): Promise<
  Array<{
    no: string;
    name: string;
    categoryId?: number;
  }>
> {
  // Query all PART type items
  const allParts = await ctx.db
    .query("parts")
    .withIndex("by_type", (q) => q.eq("type", "PART"))
    .collect();

  if (allParts.length === 0) {
    // Fallback to hardcoded parts if database is empty
    return [
      { no: "3001", name: "Brick 2 x 4", categoryId: 5 },
      { no: "3002", name: "Brick 2 x 3", categoryId: 5 },
      { no: "3004", name: "Brick 1 x 2", categoryId: 5 },
      { no: "3020", name: "Plate 2 x 4", categoryId: 6 },
      { no: "3622", name: "Brick 1 x 3", categoryId: 5 },
      { no: "3710", name: "Plate 1 x 4", categoryId: 6 },
    ].slice(0, count);
  }

  // Shuffle and pick random parts
  const shuffled = [...allParts].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((part) => ({
    no: part.no,
    name: part.name,
    categoryId: part.categoryId,
  }));
}

/**
 * Get random colors from the colors table
 */
async function _getRandomColors(
  ctx: MutationCtx,
  count: number,
): Promise<
  Array<{
    colorId: number;
    colorName: string;
  }>
> {
  const allColors = await ctx.db.query("colors").collect();

  if (allColors.length === 0) {
    // Fallback colors if database is empty
    return [
      { colorId: 0, colorName: "Black" },
      { colorId: 1, colorName: "Blue" },
      { colorId: 4, colorName: "Red" },
      { colorId: 15, colorName: "Trans-Clear" },
      { colorId: 85, colorName: "Dark Bluish Gray" },
      { colorId: 86, colorName: "Light Bluish Gray" },
    ].slice(0, count);
  }

  const shuffled = [...allColors].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((color) => ({
    colorId: color.colorId,
    colorName: color.colorName,
  }));
}

/**
 * Create default test inventory items if none exist
 * This ensures test orders can always be created
 */
async function createDefaultTestInventoryItems(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  userId: Id<"users">,
): Promise<void> {
  const now = Date.now();

  // Default test inventory items with common LEGO parts
  const defaultItems = [
    {
      partNumber: "3001",
      name: "Brick 2 x 4",
      colorId: "0", // Black
      location: "A-1",
      condition: "new" as const,
      quantityAvailable: 50,
    },
    {
      partNumber: "3002",
      name: "Brick 2 x 3",
      colorId: "1", // Blue
      location: "A-2",
      condition: "new" as const,
      quantityAvailable: 30,
    },
    {
      partNumber: "3004",
      name: "Brick 1 x 2",
      colorId: "4", // Red
      location: "A-3",
      condition: "new" as const,
      quantityAvailable: 40,
    },
    {
      partNumber: "3020",
      name: "Plate 2 x 4",
      colorId: "85", // Dark Bluish Gray
      location: "B-1",
      condition: "new" as const,
      quantityAvailable: 35,
    },
    {
      partNumber: "3622",
      name: "Brick 1 x 3",
      colorId: "86", // Light Bluish Gray
      location: "B-2",
      condition: "new" as const,
      quantityAvailable: 25,
    },
    {
      partNumber: "3710",
      name: "Plate 1 x 4",
      colorId: "0", // Black
      location: "B-3",
      condition: "new" as const,
      quantityAvailable: 45,
    },
  ];

  // Create inventory items
  for (const item of defaultItems) {
    await ctx.db.insert("inventoryItems", {
      businessAccountId,
      name: item.name,
      partNumber: item.partNumber,
      colorId: item.colorId,
      location: item.location,
      quantityAvailable: item.quantityAvailable,
      quantityReserved: 0,
      condition: item.condition,
      createdBy: userId,
      createdAt: now,
      marketplaceSync: {
        bricklink: {
          status: "synced",
          lastSyncAttempt: now,
        },
        brickowl: {
          status: "synced",
          lastSyncAttempt: now,
        },
      },
    });
  }
}

/**
 * Get random inventory items from database for test order generation
 * If no inventory items exist, creates default test inventory items
 */
async function getRandomInventoryItems(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  userId: Id<"users">,
  count: number,
): Promise<
  Array<{
    _id: string;
    partNumber: string;
    name: string;
    colorId: string;
    colorName?: string;
    condition: "new" | "used";
    location: string;
    quantityAvailable: number;
  }>
> {
  // Query all inventory items for the business account
  // Note: We don't filter by isArchived since it's optional and may not be set on existing items
  const allItems = await ctx.db
    .query("inventoryItems")
    .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
    .collect();

  // If no items exist, create default test inventory items
  if (allItems.length === 0) {
    await createDefaultTestInventoryItems(ctx, businessAccountId, userId);
    // Query again after creating defaults
    const newItems = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    const shuffled = [...newItems].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
      _id: item._id.toString(),
      partNumber: item.partNumber,
      name: item.name,
      colorId: item.colorId,
      condition: item.condition,
      location: item.location,
      quantityAvailable: item.quantityAvailable,
    }));
  }

  // Shuffle and pick random items
  const shuffled = [...allItems].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((item) => ({
    _id: item._id.toString(),
    partNumber: item.partNumber,
    name: item.name,
    colorId: item.colorId,
    condition: item.condition,
    location: item.location,
    quantityAvailable: item.quantityAvailable,
  }));
}

/**
 * Create test order data with random parts from database
 * IMPORTANT: Only creates order items from existing inventory items to ensure matching
 * @param overrides - Optional overrides for order data
 * @param overrides.status - Valid BrickLink order status (PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD)
 *                           Alert statuses (OCR, NPB, NPX, NRS, NSS) will be automatically mapped to HOLD during ingestion
 */
async function createTestOrderDataWithParts(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  userId: Id<"users">,
  overrides?: {
    orderId?: string;
    buyerName?: string;
    status?: string;
    itemCount?: number;
  },
): Promise<{
  orderData: BricklinkOrderResponse;
  orderItemsData: BricklinkOrderItemResponse[][];
}> {
  const orderId = overrides?.orderId || `TEST-${Date.now()}`;
  const now = new Date().toISOString();
  const buyerName = overrides?.buyerName || "Test Buyer";
  // Valid status values: PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD
  // Alert statuses (OCR, NPB, NPX, NRS, NSS) will be mapped to HOLD during ingestion
  const status = overrides?.status || "PENDING";
  const itemCount = overrides?.itemCount || 3;

  // Get random inventory items from database (ensures we have matching items)
  // This will automatically create default test inventory items if none exist
  const inventoryItems = await getRandomInventoryItems(
    ctx,
    businessAccountId,
    userId,
    itemCount + 5,
  );

  if (inventoryItems.length === 0) {
    throw new Error(
      "Failed to create or find inventory items. Please ensure you have inventory items or check the logs.",
    );
  }

  // Create realistic test order
  const orderData: BricklinkOrderResponse = {
    order_id: orderId,
    date_ordered: now,
    date_status_changed: now,
    seller_name: "Test Store",
    store_name: "Test Store",
    buyer_name: buyerName,
    buyer_email: `${buyerName.toLowerCase().replace(" ", ".")}@example.com`,
    buyer_order_count: 5,
    require_insurance: false,
    status: status,
    is_invoiced: false,
    is_filed: false,
    drive_thru_sent: false,
    salesTax_collected_by_bl: false,
    remarks: "Test order created for development",
    total_count: itemCount,
    unique_count: itemCount,
    total_weight: "0.5",
    payment: {
      method: "PayPal",
      currency_code: "USD",
      status: status === "PENDING" ? "Pending" : "Received",
      ...(status !== "PENDING" && { date_paid: now }),
    },
    shipping: {
      method: "USPS Priority",
      method_id: "1",
      address: {
        name: {
          full: buyerName,
          first: buyerName.split(" ")[0] || "Test",
          last: buyerName.split(" ")[1] || "Buyer",
        },
        full: `${buyerName}\n123 Test St\nAnytown, ST 12345`,
        address1: "123 Test St",
        city: "Anytown",
        state: "ST",
        postal_code: "12345",
        country_code: "US",
        phone_number: "+1-555-0123",
      },
    },
    cost: {
      currency_code: "USD",
      subtotal: (itemCount * 2.5).toFixed(2),
      grand_total: (itemCount * 2.5 + 5.0).toFixed(2),
      shipping: "5.00",
    },
  };

  // Create test order items from existing inventory items
  // This ensures we have matching inventory items for picking
  const items: BricklinkOrderItemResponse[] = [];

  for (let i = 0; i < itemCount && i < inventoryItems.length; i++) {
    const inventoryItem = inventoryItems[i % inventoryItems.length];

    // Generate random positive quantity (1-10), not bounded by available
    const quantity = Math.floor(Math.random() * 10) + 1;

    // Get the actual inventory item document to update it
    const inventoryItemId = inventoryItem._id as Id<"inventoryItems">;
    const inventoryItemDoc = await ctx.db.get(inventoryItemId);

    if (inventoryItemDoc) {
      // Set reserved quantity to 0 so after upsertOrder adds quantity,
      // reserved will equal the order quantity
      await ctx.db.patch(inventoryItemId, {
        quantityReserved: 0,
        updatedAt: Date.now(),
      });
    }

    const basePrice = 0.5 + Math.random() * 4.5; // $0.50-$5.00

    // Get color name from colors table if available
    const color = await ctx.db
      .query("colors")
      .filter((q) => q.eq(q.field("colorId"), parseInt(inventoryItem.colorId)))
      .first();

    items.push({
      inventory_id: 1000000 + i,
      item: {
        no: inventoryItem.partNumber,
        name: inventoryItem.name,
        type: "PART",
        category_id: undefined, // Will be set from parts table if needed
      },
      color_id: parseInt(inventoryItem.colorId),
      color_name: color?.colorName,
      quantity: quantity,
      new_or_used: inventoryItem.condition === "new" ? "N" : "U",
      completeness: "C",
      unit_price: basePrice.toFixed(2),
      unit_price_final: basePrice.toFixed(2),
      currency_code: "USD",
      description: `${color?.colorName || `Color ${inventoryItem.colorId}`} ${inventoryItem.name}`,
      weight: (0.1 * quantity).toFixed(2),
      remarks: inventoryItem.location, // CRITICAL: Set remarks to inventory item location
    });
  }

  // Calculate actual totals based on items
  const subtotal = items.reduce(
    (sum, item) => sum + parseFloat(item.unit_price) * item.quantity,
    0,
  );
  orderData.cost.subtotal = subtotal.toFixed(2);
  orderData.cost.grand_total = (subtotal + 5.0).toFixed(2);

  // Bricklink returns items in batches (nested arrays)
  const orderItemsData: BricklinkOrderItemResponse[][] = [items];

  return { orderData, orderItemsData };
}

/**
 * Create a test order with items (development only)
 *
 * This creates both the order and its items in the database, just like
 * a real order from Bricklink would be stored.
 *
 * Usage from Convex dashboard or frontend:
 * ```ts
 * await convex.mutation("orders.mocks:create", {
 *   businessAccountId: "businessAccounts:...",
 *   orderId: "TEST-123", // optional (auto-generated if not provided)
 *   buyerName: "John Doe", // optional
 *   status: "PENDING", // optional: Valid values are PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD
 *                       // Alert statuses (OCR, NPB, NPX, NRS, NSS) will be mapped to HOLD during ingestion
 *   itemCount: 3, // optional (defaults to 3)
 * });
 *
 * // Then get the items:
 * const items = await convex.query("orders.mocks:getOrderItems", {
 *   businessAccountId: "businessAccounts:...",
 *   orderId: "TEST-123",
 * });
 * ```
 */
export const create = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    orderId: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    status: v.optional(v.string()),
    itemCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Safety check: only allow in development
    if (!isDevelopmentMode()) {
      throw new Error("Test orders can only be created in development environments");
    }

    // Get userId from auth context
    const { userId } = await requireActiveUser(ctx);

    // Generate test order data using existing inventory items
    const { orderData, orderItemsData } = await createTestOrderDataWithParts(
      ctx,
      args.businessAccountId,
      userId,
      {
        orderId: args.orderId,
        buyerName: args.buyerName,
        status: args.status,
        itemCount: args.itemCount,
      },
    );

    // Use existing upsertOrder mutation (same flow as real orders)
    await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
      businessAccountId: args.businessAccountId,
      orderData,
      orderItemsData,
    });

    // Return order with item count
    return {
      success: true,
      orderId: orderData.order_id,
      itemCount: orderItemsData.flat().length,
      message: `Test order ${orderData.order_id} created successfully with ${orderItemsData.flat().length} items`,
    };
  },
});

/**
 * Get order items for a specific order (mimics getOrderItems API)
 * Returns items in the same format as the Bricklink API would
 */
export const getOrderItems = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isDevelopmentMode()) {
      throw new Error("Test order queries can only be used in development environments");
    }

    // Query items from database
    const items = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    // Convert back to BricklinkOrderItemResponse format (same as API)
    const orderItems: BricklinkOrderItemResponse[] = items.map((item) => ({
      inventory_id: item.inventoryId,
      item: {
        no: item.itemNo,
        name: item.itemName,
        type: item.itemType,
        category_id: item.itemCategoryId,
      },
      color_id: item.colorId,
      color_name: item.colorName,
      quantity: item.quantity,
      new_or_used: item.newOrUsed as "N" | "U",
      completeness: item.completeness as "C" | "B" | "S" | undefined,
      unit_price: item.unitPrice.toFixed(2),
      unit_price_final: item.unitPriceFinal.toFixed(2),
      currency_code: item.currencyCode,
      remarks: item.remarks,
      description: item.description,
      weight: item.weight?.toFixed(2),
    }));

    // Return in batches format (nested arrays, single batch)
    return [orderItems];
  },
});

/**
 * List test orders (filtered by TEST- prefix)
 * Useful for cleanup
 */
export const listTestOrders = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    if (!isDevelopmentMode()) {
      throw new Error("Test order queries can only be used in development environments");
    }

    const orders = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    // Filter to test orders (orderId starts with "TEST-")
    const testOrders = orders.filter((order) => order.orderId.startsWith("TEST-"));

    return testOrders.map((order) => ({
      orderId: order.orderId,
      buyerName: order.buyerName,
      status: order.status,
      dateOrdered: order.dateOrdered,
      totalCount: order.totalCount,
      lotCount: order.lotCount,
      costGrandTotal: order.costGrandTotal,
    }));
  },
});

/**
 * Check if we're in a development environment
 */
export const isDevelopmentEnvironment = query({
  args: {},
  handler: async () => {
    return isDevelopmentMode();
  },
});

/**
 * Create bulk test orders (3 orders automatically)
 * Creates 3 test orders with random parts from the database
 * Uses valid status values: PENDING, READY, COMPLETED
 */
export const createBulkTestOrders = mutation({
  args: {},
  handler: async (ctx) => {
    // Safety check: only allow in development
    if (!isDevelopmentMode()) {
      throw new Error("Test orders can only be created in development environments");
    }

    // Get businessAccountId and userId from auth context
    const { businessAccountId, userId } = await requireActiveUser(ctx);

    // Valid status values: PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, CANCELLED, HOLD
    const orders = [
      { status: "PENDING", buyerName: "Alice Johnson", itemCount: 3 },
      { status: "READY", buyerName: "Bob Smith", itemCount: 4 },
      { status: "COMPLETED", buyerName: "Charlie Brown", itemCount: 5 },
    ];

    const createdOrders = [];

    for (let i = 0; i < orders.length; i++) {
      const orderConfig = orders[i];
      // Create unique order ID with timestamp and index to ensure uniqueness
      const orderId = `TEST-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
      const { orderData, orderItemsData } = await createTestOrderDataWithParts(
        ctx,
        businessAccountId,
        userId,
        {
          orderId,
          buyerName: orderConfig.buyerName,
          status: orderConfig.status,
          itemCount: orderConfig.itemCount,
        },
      );

      await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
        businessAccountId,
        orderData,
        orderItemsData,
      });

      createdOrders.push({
        orderId: orderData.order_id,
        itemCount: orderItemsData.flat().length,
        status: orderData.status,
      });
    }

    return {
      success: true,
      ordersCreated: createdOrders.length,
      orders: createdOrders,
      message: `Successfully created ${createdOrders.length} test orders with ${createdOrders.reduce((sum, o) => sum + o.itemCount, 0)} total items`,
    };
  },
});

/**
 * Delete all orders and order items for the current business account
 */
export const deleteAllOrders = mutation({
  args: {},
  handler: async (ctx) => {
    // Safety check: only allow in development
    if (!isDevelopmentMode()) {
      throw new Error("Order deletion can only be used in development environments");
    }

    // Get businessAccountId from auth context
    const { businessAccountId } = await requireActiveUser(ctx);

    // Find all orders for this business account
    const orders = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    let itemsDeleted = 0;

    // Delete all items for each order
    for (const order of orders) {
      const items = await ctx.db
        .query("bricklinkOrderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", order.orderId),
        )
        .collect();

      for (const item of items) {
        await ctx.db.delete(item._id);
        itemsDeleted++;
      }
    }

    // Delete all orders
    let ordersDeleted = 0;
    for (const order of orders) {
      await ctx.db.delete(order._id);
      ordersDeleted++;
    }

    return {
      success: true,
      ordersDeleted,
      itemsDeleted,
      message: `Deleted ${ordersDeleted} orders and ${itemsDeleted} order items`,
    };
  },
});

/**
 * Delete test orders (cleanup utility)
 */
export const deleteTestOrders = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    if (!isDevelopmentMode()) {
      throw new Error("Test order deletion can only be used in development environments");
    }

    // Find all test orders
    const orders = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    const testOrders = orders.filter((order) => order.orderId.startsWith("TEST-"));

    // Delete orders and their items
    let deletedCount = 0;
    for (const order of testOrders) {
      // Delete order items first
      const items = await ctx.db
        .query("bricklinkOrderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", args.businessAccountId).eq("orderId", order.orderId),
        )
        .collect();

      for (const item of items) {
        await ctx.db.delete(item._id);
      }

      // Delete order
      await ctx.db.delete(order._id);
      deletedCount++;
    }

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} test orders`,
    };
  },
});
