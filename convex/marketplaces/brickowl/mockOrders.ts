import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { requireActiveUser } from "../../users/authorization";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  assertDevelopmentEnvironment,
  getRandomInventoryItemsForMock,
  type MockInventoryItem,
} from "../../orders/mockHelpers";

interface BrickOwlMockOrderResult {
  orderData: Record<string, unknown>;
  orderItemsData: Record<string, unknown>[];
}

async function createMockBrickOwlOrder(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  orderIndex: number,
): Promise<BrickOwlMockOrderResult> {
  const timestamp = Date.now();
  const orderId = `MOCK-OWL-${timestamp}-${orderIndex}`;
  const now = new Date();
  const itemCount = 3;

  const inventoryItems = await getRandomInventoryItemsForMock(
    ctx,
    businessAccountId,
    itemCount + 5,
  );

  if (inventoryItems.length === 0) {
    throw new Error(
      "Failed to find inventory items. Please generate mock inventory before creating BrickOwl mock orders.",
    );
  }

  const items: Record<string, unknown>[] = [];

  for (let i = 0; i < itemCount && i < inventoryItems.length; i++) {
    const inventoryItem: MockInventoryItem = inventoryItems[i % inventoryItems.length];
    const quantity = Math.floor(Math.random() * 10) + 1;
    const basePrice = 0.5 + Math.random() * 4.5;

    const colorId = Number.parseInt(inventoryItem.colorId, 10);
    const itemIdSuffix = `${orderIndex}-${i}`;

    items.push({
      order_item_id: `${orderId}-ITEM-${itemIdSuffix}`,
      lot_id: `${orderId}-LOT-${itemIdSuffix}`,
      order_id: orderId,
      boid: inventoryItem.partNumber,
      item_no: inventoryItem.partNumber,
      name: inventoryItem.name,
      type: "Part",
      category_id: undefined,
      color_id: Number.isNaN(colorId) ? undefined : colorId,
      color_name: inventoryItem.colorName,
      quantity,
      total_quantity: quantity,
      price: basePrice,
      final_price: basePrice,
      currency: "USD",
      condition: inventoryItem.condition === "new" ? "new" : "used",
      completeness: "C",
      note: inventoryItem.location,
      remarks: inventoryItem.location,
      description: `${
        inventoryItem.colorName || `Color ${inventoryItem.colorId}`
      } ${inventoryItem.name}`,
      weight: Number((0.1 * quantity).toFixed(2)),
      location: inventoryItem.location,
      bin: inventoryItem.location,
    });
  }

  const subtotal = items.reduce((sum, item) => {
    const price = typeof item.price === "number" ? item.price : Number(item.price);
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    return sum + price * quantity;
  }, 0);
  const shippingTotal = 5;
  const totalQuantity = items.reduce((sum, item) => {
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    return sum + quantity;
  }, 0);

  const orderData = {
    order_id: orderId,
    order_number: `${timestamp}-${orderIndex}`,
    status: "pending",
    created: now.toISOString(),
    updated: now.toISOString(),
    buyer: {
      username: "mock.owl.buyer",
      name: "Mock Owl Buyer",
      email: "mock.owl.buyer@example.com",
      order_count: 5,
    },
    shipping: {
      method: "USPS Priority",
      method_id: 1,
      tracking_id: `TRACK-${orderId}`,
      tracking_url: "https://example.com/track",
      address: {
        name: "Mock Owl Buyer",
        line1: "456 Mock Ave",
        city: "Bricktown",
        state: "ST",
        postal_code: "67890",
        country: "US",
      },
    },
    payment: {
      method: "PayPal",
      currency: "USD",
      status: "pending",
    },
    subtotal,
    total: subtotal + shippingTotal,
    grand_total: subtotal + shippingTotal,
    final_total: subtotal + shippingTotal,
    shipping_total: shippingTotal,
    tax_total: 0,
    total_items: items.length,
    total_quantity: totalQuantity,
    item_count: items.length,
    unique_items: items.length,
    remark: "Mock BrickOwl order created for development testing",
  };

  return {
    orderData,
    orderItemsData: items,
  };
}

export const triggerMockOrder = mutation({
  args: {
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDevelopmentEnvironment(
      "Mock BrickOwl orders can only be triggered in development environments",
    );

    const { businessAccountId } = await requireActiveUser(ctx);

    const quantity = Math.min(Math.max(args.quantity ?? 1, 1), 20);
    const ordersCreated: Array<{ orderId: string; itemCount: number }> = [];

    for (let i = 0; i < quantity; i++) {
      const { orderData, orderItemsData } = await createMockBrickOwlOrder(
        ctx,
        businessAccountId,
        i,
      );

      await ctx.runMutation(internal.orders.ingestion.upsertOrder, {
        businessAccountId,
        provider: "brickowl",
        orderData,
        orderItemsData,
      });

      const orderId =
        typeof orderData.order_id === "string" ? orderData.order_id : String(orderData.order_id);

      ordersCreated.push({
        orderId,
        itemCount: orderItemsData.length,
      });
    }

    const totalItems = ordersCreated.reduce((sum, order) => sum + order.itemCount, 0);

    return {
      success: true,
      ordersCreated: ordersCreated.length,
      totalItems,
      orders: ordersCreated,
      message: `Mock BrickOwl order generation complete. ${ordersCreated.length} order${
        ordersCreated.length === 1 ? "" : "s"
      } created with ${totalItems} total item${totalItems === 1 ? "" : "s"}.`,
    };
  },
});
