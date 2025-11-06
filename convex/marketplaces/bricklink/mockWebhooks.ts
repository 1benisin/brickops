/**
 * Development-only webhook notification mocking
 * Simulates BrickLink webhook notifications and processes them through the full pipeline
 *
 * IMPORTANT: Only available in development/staging environments
 */

import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { requireActiveUser } from "../../users/helpers";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

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
 * Get random inventory items from database for mock order generation
 * If no inventory items exist, creates default mock inventory items
 * Imported from mocks.ts pattern
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
  const allItems = await ctx.db
    .query("inventoryItems")
    .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
    .collect();

  // If no items exist, we'll need to create default mock inventory items
  // For now, throw an error to guide the user
  if (allItems.length === 0) {
    throw new Error(
      "No inventory items found. Please create mock orders first, which will create default inventory items.",
    );
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
 * Create mock order data with random parts from database
 * Similar to mocks.ts but uses sensible defaults
 */
async function createMockOrderDataWithParts(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  userId: Id<"users">,
  orderIndex?: number,
): Promise<{
  orderData: any; // BricklinkOrderResponse
  orderItemsData: any[][]; // BricklinkOrderItemResponse[][]
}> {
  const timestamp = Date.now();
  const orderId = orderIndex !== undefined 
    ? `MOCK-WEBHOOK-${timestamp}-${orderIndex}`
    : `MOCK-WEBHOOK-${timestamp}`;
  const now = new Date().toISOString();
  const buyerName = "Mock Webhook Buyer";
  const status = "PENDING";
  const itemCount = 3;

  // Get random inventory items from database
  const inventoryItems = await getRandomInventoryItems(
    ctx,
    businessAccountId,
    userId,
    itemCount + 5,
  );

  if (inventoryItems.length === 0) {
    throw new Error(
      "Failed to find inventory items. Please ensure you have inventory items or create mock orders first.",
    );
  }

  // Create realistic mock order
  const orderData = {
    order_id: orderId,
    date_ordered: now,
    date_status_changed: now,
    seller_name: "Mock Store",
    store_name: "Mock Store",
    buyer_name: buyerName,
    buyer_email: `${buyerName.toLowerCase().replace(" ", ".")}@example.com`,
    buyer_order_count: 5,
    require_insurance: false,
    status: status,
    is_invoiced: false,
    is_filed: false,
    drive_thru_sent: false,
    salesTax_collected_by_bl: false,
    remarks: "Mock order created via webhook notification simulation",
    total_count: itemCount,
    unique_count: itemCount,
    total_weight: "0.5",
    payment: {
      method: "PayPal",
      currency_code: "USD",
      status: "Pending",
    },
    shipping: {
      method: "USPS Priority",
      method_id: "1",
      address: {
        name: {
          full: buyerName,
          first: buyerName.split(" ")[0] || "Mock",
          last: buyerName.split(" ")[1] || "Buyer",
        },
        full: `${buyerName}\n123 Mock St\nAnytown, ST 12345`,
        address1: "123 Mock St",
        city: "Anytown",
        state: "ST",
        postal_code: "12345",
        country_code: "US",
        phone_number: "+1-555-0123",
      },
    },
    cost: {
      currency_code: "USD",
      subtotal: "0.00", // Will be calculated below
      grand_total: "0.00", // Will be calculated below
      shipping: "5.00",
    },
  };

  // Create mock order items from existing inventory items
  const items: any[] = [];

  for (let i = 0; i < itemCount && i < inventoryItems.length; i++) {
    const inventoryItem = inventoryItems[i % inventoryItems.length];

    // Generate random positive quantity (1-10)
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
        category_id: undefined,
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

  // BrickLink returns items in batches (nested arrays)
  const orderItemsData: any[][] = [items];

  return { orderData, orderItemsData };
}

/**
 * Trigger a mock webhook notification
 * Simulates the full webhook flow: notification creation → processing → order creation
 * Development only
 */
export const triggerMockWebhookNotification = mutation({
  args: {
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Safety check: only allow in development
    if (!isDevelopmentMode()) {
      throw new Error(
        "Mock webhook notifications can only be triggered in development environments",
      );
    }

    // Get businessAccountId and userId from auth context
    const { businessAccountId, userId } = await requireActiveUser(ctx);

    // Default to 1 if quantity not provided
    const quantity = args.quantity ?? 1;
    const ordersCreated = [];

    // Generate and process multiple mock orders
    for (let i = 0; i < quantity; i++) {
      // Generate mock order data using existing inventory items
      const { orderData, orderItemsData } = await createMockOrderDataWithParts(
        ctx,
        businessAccountId,
        userId,
        i,
      );

      // Create notification record (simulating webhook receipt)
      // Use the order_id as resource_id (convert to number for consistency)
      // Extract timestamp from order_id (MOCK-WEBHOOK-{timestamp}-{index}) or use current time
      const orderIdMatch = orderData.order_id.match(/MOCK-WEBHOOK-(\d+)(?:-(\d+))?/);
      const orderIdNumber = orderIdMatch ? parseInt(orderIdMatch[1]) : Date.now();
      const timestamp = new Date().toISOString();
      const dedupeKey = `${businessAccountId}:Order:${orderIdNumber}:${timestamp}:${i}`;

      const notificationId = await ctx.runMutation(
        internal.marketplaces.bricklink.notifications.upsertNotification,
        {
          businessAccountId,
          eventType: "Order",
          resourceId: orderIdNumber,
          timestamp,
          dedupeKey,
        },
      );

      // Process the notification with mock data (bypasses API calls)
      await ctx.runMutation(
        internal.marketplaces.bricklink.notifications.processMockOrderNotification,
        {
          businessAccountId,
          orderData,
          orderItemsData,
        },
      );

      // Update notification status to completed
      await ctx.runMutation(internal.marketplaces.bricklink.notifications.updateNotificationStatus, {
        notificationId,
        status: "completed",
        processedAt: Date.now(),
      });

      ordersCreated.push({
        orderId: orderData.order_id,
        itemCount: orderItemsData.flat().length,
      });
    }

    const totalItems = ordersCreated.reduce((sum, order) => sum + order.itemCount, 0);

    return {
      success: true,
      ordersCreated: ordersCreated.length,
      totalItems,
      orders: ordersCreated,
      message: `Mock webhook notification processed successfully. ${ordersCreated.length} order${ordersCreated.length === 1 ? '' : 's'} created with ${totalItems} total item${totalItems === 1 ? '' : 's'}`,
    };
  },
});

