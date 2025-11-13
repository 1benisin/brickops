import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireUser, assertBusinessMembership } from "../inventory/helpers";

/**
 * Mark an order item as picked and update inventory reserved quantity
 * Only updates reserved quantity, not available quantity (already decreased during order ingestion)
 */
export const markOrderItemAsPicked = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    inventoryItemId: v.id("inventoryItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already picked
    if (orderItem.status === "picked") {
      throw new ConvexError("Order item already picked");
    }

    // Get inventory item
    const inventoryItem = await ctx.db.get(args.inventoryItemId);
    if (!inventoryItem) {
      throw new ConvexError("Inventory item not found");
    }

    // Verify inventory item matches order item
    if (inventoryItem.partNumber !== orderItem.itemNo) {
      throw new ConvexError("Inventory item does not match order item");
    }

    if (
      orderItem.colorId !== undefined &&
      inventoryItem.colorId !== orderItem.colorId.toString()
    ) {
      throw new ConvexError("Inventory item does not match order item");
    }

    if (orderItem.condition !== undefined && inventoryItem.condition !== orderItem.condition) {
      throw new ConvexError("Inventory item does not match order item");
    }

    const quantityToPick = orderItem.quantity;
    const now = Date.now();

    // Update order item
    await ctx.db.patch(args.orderItemId, {
      status: "picked",
      updatedAt: now,
    });

    // Update inventory reserved quantity (decrease)
    // If insufficient reserved quantity, set to 0 (don't go negative)
    const newReservedQuantity = Math.max(0, inventoryItem.quantityReserved - quantityToPick);

    await ctx.db.patch(args.inventoryItemId, {
      quantityReserved: newReservedQuantity,
      updatedAt: now,
    });

    // Note: We do NOT update quantityAvailable here
    // It was already decreased during order ingestion

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityPicked: quantityToPick,
    };
  },
});

/**
 * Update order status to "Packed" if all items are picked
 * Called after each item is picked
 */
export const updateOrderStatusIfFullyPicked = mutation({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireUser(ctx);

    // Get order
    const order = await ctx.db
      .query("orders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .first();

    if (!order) {
      throw new ConvexError("Order not found");
    }

    // Get all order items
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    // Check if all items are picked
    const allPicked = orderItems.length > 0 && orderItems.every((item) => item.status === "picked");

    // Update status if fully picked and currently "PAID" (not HOLD or other statuses)
    if (allPicked && order.status === "PAID") {
      await ctx.db.patch(order._id, {
        status: "PACKED",
        updatedAt: Date.now(),
      });

      return { updated: true, newStatus: "PACKED" };
    }

    return { updated: false, currentStatus: order.status };
  },
});

/**
 * Mark multiple orders as "Packed" if all items are either "picked" or "issue" (no skipped or unpicked items)
 * Only updates orders that are currently "Paid" status
 */
export const markOrdersAsPicked = mutation({
  args: {
    orderIds: v.array(v.string()),
    forceUpdate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireUser(ctx);

    const updatedOrderIds: string[] = [];
    const skippedOrderIds: string[] = [];
    const skipReasons: Record<string, string> = {};
    const now = Date.now();

    for (const orderId of args.orderIds) {
      // Get order
      const order = await ctx.db
        .query("orders")
        .withIndex("by_business_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .first();

      if (!order) {
        skippedOrderIds.push(orderId);
        skipReasons[orderId] = "Order not found";
        continue;
      }

      // Only update orders that are currently "PAID", unless forceUpdate is true
      // HOLD orders should not auto-transition
      if (order.status !== "PAID" && !args.forceUpdate) {
        skippedOrderIds.push(orderId);
        skipReasons[orderId] = `Order status is "${order.status}", expected "PAID"`;
        continue;
      }

      // Get all order items for this order
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .collect();

      // Check if all items are either "picked" or "issue" (no skipped or unpicked)
      const allReady =
        orderItems.length > 0 &&
        orderItems.every((item) => item.status === "picked" || item.status === "issue");

      if (allReady) {
        // Update order status to "PACKED"
        await ctx.db.patch(order._id, {
          status: "PACKED",
          updatedAt: now,
        });
        updatedOrderIds.push(orderId);
      } else {
        skippedOrderIds.push(orderId);
        const unpickedCount = orderItems.filter((item) => item.status === "unpicked").length;
        const skippedCount = orderItems.filter((item) => item.status === "skipped").length;
        skipReasons[orderId] =
          `Order has ${unpickedCount} unpicked and ${skippedCount} skipped items`;
      }
    }

    return {
      updatedCount: updatedOrderIds.length,
      updatedOrderIds,
      skippedOrderIds,
      skipReasons,
    };
  },
});

/**
 * Mark an order item as having an issue and update inventory reserved quantity
 * Only updates reserved quantity, not available quantity (already decreased during order ingestion)
 */
export const markOrderItemAsIssue = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    inventoryItemId: v.id("inventoryItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already issue
    if (orderItem.status === "issue") {
      throw new ConvexError("Order item already marked as issue");
    }

    // Get inventory item
    const inventoryItem = await ctx.db.get(args.inventoryItemId);
    if (!inventoryItem) {
      throw new ConvexError("Inventory item not found");
    }

    // Verify inventory item matches order item
    if (inventoryItem.partNumber !== orderItem.itemNo) {
      throw new ConvexError("Inventory item does not match order item");
    }

    if (
      orderItem.colorId !== undefined &&
      inventoryItem.colorId !== orderItem.colorId.toString()
    ) {
      throw new ConvexError("Inventory item does not match order item");
    }

    if (orderItem.condition !== undefined && inventoryItem.condition !== orderItem.condition) {
      throw new ConvexError("Inventory item does not match order item");
    }

    const quantityToPick = orderItem.quantity;
    const now = Date.now();

    // Update order item
    await ctx.db.patch(args.orderItemId, {
      status: "issue",
      updatedAt: now,
    });

    // Update inventory reserved quantity (decrease)
    // If insufficient reserved quantity, set to 0 (don't go negative)
    const newReservedQuantity = Math.max(0, inventoryItem.quantityReserved - quantityToPick);

    await ctx.db.patch(args.inventoryItemId, {
      quantityReserved: newReservedQuantity,
      updatedAt: now,
    });

    // Note: We do NOT update quantityAvailable here
    // It was already decreased during order ingestion

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityPicked: quantityToPick,
    };
  },
});

/**
 * Mark an order item as skipped
 */
export const markOrderItemAsSkipped = mutation({
  args: {
    orderItemId: v.id("orderItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    const now = Date.now();

    // Update order item status
    await ctx.db.patch(args.orderItemId, {
      status: "skipped",
      updatedAt: now,
    });

    return {
      success: true,
      orderItemId: args.orderItemId,
      status: "skipped",
    };
  },
});

/**
 * Mark an order item as unpicked and restore inventory reserved quantity if it was picked or issue
 * Only restores reserved quantity if the item was previously "picked" or "issue" (not skipped)
 */
export const markOrderItemAsUnpicked = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    inventoryItemId: v.optional(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    const { user, businessAccountId } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already unpicked
    if (orderItem.status === "unpicked") {
      throw new ConvexError("Order item already unpicked");
    }

    const wasPicked = orderItem.status === "picked" || orderItem.status === "issue";
    const now = Date.now();

    // Update order item status to unpicked
    await ctx.db.patch(args.orderItemId, {
      status: "unpicked",
      updatedAt: now,
    });

    // If item was picked or issue, restore reserved quantity
    if (wasPicked && args.inventoryItemId) {
      const inventoryItem = await ctx.db.get(args.inventoryItemId);
      if (!inventoryItem) {
        throw new ConvexError("Inventory item not found");
      }

      // Verify inventory item matches order item
      if (inventoryItem.partNumber !== orderItem.itemNo) {
        throw new ConvexError("Inventory item does not match order item");
      }

      if (
        orderItem.colorId !== undefined &&
        inventoryItem.colorId !== orderItem.colorId.toString()
      ) {
        throw new ConvexError("Inventory item does not match order item");
      }

      if (orderItem.condition !== undefined && inventoryItem.condition !== orderItem.condition) {
        throw new ConvexError("Inventory item does not match order item");
      }

      const quantityToRestore = orderItem.quantity;

      // Increase reserved quantity (restore what was reserved)
      await ctx.db.patch(args.inventoryItemId, {
        quantityReserved: inventoryItem.quantityReserved + quantityToRestore,
        updatedAt: now,
      });
    }

    // Check if order status needs to be reverted from "PACKED" to "PAID"
    // if we unpicked an item from a fully picked order
    const order = await ctx.db
      .query("orders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
      )
      .first();

    if (order && order.status === "PACKED") {
      // Check if all items are still picked or issue (no skipped or unpicked)
      const orderItems = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
        )
        .collect();

      const allReady =
        orderItems.length > 0 &&
        orderItems.every((item) => item.status === "picked" || item.status === "issue");

      // If not all items are picked or issue, revert status to "PAID"
      if (!allReady) {
        await ctx.db.patch(order._id, {
          status: "PAID",
          updatedAt: now,
        });
      }
    }

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityRestored: wasPicked ? orderItem.quantity : 0,
    };
  },
});
