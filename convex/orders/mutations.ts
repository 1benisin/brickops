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
    orderItemId: v.id("bricklinkOrderItems"),
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
    if (
      inventoryItem.partNumber !== orderItem.itemNo ||
      inventoryItem.colorId !== orderItem.colorId.toString() ||
      inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
    ) {
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
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    // Get order
    const order = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .first();

    if (!order) {
      throw new ConvexError("Order not found");
    }

    // Get all order items
    const orderItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    // Check if all items are picked
    const allPicked = orderItems.length > 0 && orderItems.every((item) => item.status === "picked");

    // Update status if fully picked and currently "Paid"
    if (allPicked && order.status === "Paid") {
      await ctx.db.patch(order._id, {
        status: "Packed",
        updatedAt: Date.now(),
      });

      return { updated: true, newStatus: "Packed" };
    }

    return { updated: false, currentStatus: order.status };
  },
});

/**
 * Mark an order item as having an issue and update inventory reserved quantity
 * Only updates reserved quantity, not available quantity (already decreased during order ingestion)
 */
export const markOrderItemAsIssue = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
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
    if (
      inventoryItem.partNumber !== orderItem.itemNo ||
      inventoryItem.colorId !== orderItem.colorId.toString() ||
      inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
    ) {
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
    orderItemId: v.id("bricklinkOrderItems"),
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
    orderItemId: v.id("bricklinkOrderItems"),
    inventoryItemId: v.optional(v.id("inventoryItems")),
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
      if (
        inventoryItem.partNumber !== orderItem.itemNo ||
        inventoryItem.colorId !== orderItem.colorId.toString() ||
        inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
      ) {
        throw new ConvexError("Inventory item does not match order item");
      }

      const quantityToRestore = orderItem.quantity;

      // Increase reserved quantity (restore what was reserved)
      await ctx.db.patch(args.inventoryItemId, {
        quantityReserved: inventoryItem.quantityReserved + quantityToRestore,
        updatedAt: now,
      });
    }

    // Check if order status needs to be reverted from "Packed" to "Paid"
    // if we unpicked an item from a fully picked order
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;
    const order = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
      )
      .first();

    if (order && order.status === "Packed") {
      // Check if all items are still picked
      const orderItems = await ctx.db
        .query("bricklinkOrderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
        )
        .collect();

      const allPicked = orderItems.length > 0 && orderItems.every((item) => item.status === "picked");

      // If not all items are picked, revert status to "Paid"
      if (!allPicked) {
        await ctx.db.patch(order._id, {
          status: "Paid",
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

