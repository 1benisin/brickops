import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type {
  BricklinkOrderResponse,
  BricklinkOrderItemResponse,
} from "../marketplaces/bricklink/storeClient";
import { getNextSeqForItem, getCurrentAvailableFromLedger } from "../inventory/helpers";

/**
 * Upsert order and order items (internal mutation)
 */
export const upsertOrder = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    // Note: Using v.any() for complex external API types - these are validated at API boundaries
    // Type assertions below ensure type safety in handler
    orderData: v.any(), // BricklinkOrderResponse - complex nested object from BrickLink API
    orderItemsData: v.any(), // BricklinkOrderItemResponse[][] - array of batches from BrickLink API
  },
  handler: async (ctx, args) => {
    // Type assertions for external API data (validated at API call site)
    const order = args.orderData as BricklinkOrderResponse;
    const items = args.orderItemsData as BricklinkOrderItemResponse[][];

    const now = Date.now();

    // Parse timestamps
    const dateOrdered = new Date(order.date_ordered).getTime();
    const dateStatusChanged = new Date(order.date_status_changed).getTime();
    const paymentDatePaid = order.payment?.date_paid
      ? new Date(order.payment.date_paid).getTime()
      : undefined;
    const shippingDateShipped = order.shipping?.date_shipped
      ? new Date(order.shipping.date_shipped).getTime()
      : undefined;

    // Check if order exists
    const existing = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("orderId", order.order_id),
      )
      .first();

    const orderData = {
      businessAccountId: args.businessAccountId,
      orderId: order.order_id,
      dateOrdered,
      dateStatusChanged,
      sellerName: order.seller_name,
      storeName: order.store_name,
      buyerName: order.buyer_name,
      buyerEmail: order.buyer_email,
      buyerOrderCount: order.buyer_order_count,
      requireInsurance: order.require_insurance,
      status: order.status,
      isInvoiced: order.is_invoiced,
      isFiled: order.is_filed,
      driveThruSent: order.drive_thru_sent,
      salesTaxCollectedByBl: order.salesTax_collected_by_bl,
      remarks: order.remarks,
      totalCount: order.total_count,
      lotCount: order.unique_count,
      totalWeight: order.total_weight ? parseFloat(order.total_weight) : undefined,
      paymentMethod: order.payment?.method,
      paymentCurrencyCode: order.payment?.currency_code,
      paymentDatePaid,
      paymentStatus: order.payment?.status,
      shippingMethod: order.shipping?.method,
      shippingMethodId: order.shipping?.method_id?.toString(),
      shippingTrackingNo: order.shipping?.tracking_no,
      shippingTrackingLink: order.shipping?.tracking_link,
      shippingDateShipped,
      shippingAddress: order.shipping?.address ? JSON.stringify(order.shipping.address) : undefined,
      costCurrencyCode: order.cost.currency_code,
      costSubtotal: parseFloat(order.cost.subtotal),
      costGrandTotal: parseFloat(order.cost.grand_total),
      costSalesTaxCollectedByBL: order.cost.salesTax_collected_by_BL
        ? parseFloat(order.cost.salesTax_collected_by_BL)
        : undefined,
      costFinalTotal: order.cost.final_total ? parseFloat(order.cost.final_total) : undefined,
      costEtc1: order.cost.etc1 ? parseFloat(order.cost.etc1) : undefined,
      costEtc2: order.cost.etc2 ? parseFloat(order.cost.etc2) : undefined,
      costInsurance: order.cost.insurance ? parseFloat(order.cost.insurance) : undefined,
      costShipping: order.cost.shipping ? parseFloat(order.cost.shipping) : undefined,
      costCredit: order.cost.credit ? parseFloat(order.cost.credit) : undefined,
      costCoupon: order.cost.coupon ? parseFloat(order.cost.coupon) : undefined,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, orderData);
    } else {
      await ctx.db.insert("bricklinkOrders", {
        ...orderData,
        createdAt: now,
      });
    }

    // Delete existing items (we'll re-insert all)
    const existingItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("orderId", order.order_id),
      )
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    // Insert order items (flatten nested arrays - batches)
    // Generate correlation ID once for all items in this order
    const correlationId = crypto.randomUUID();

    for (const batch of items) {
      for (const item of batch) {
        // Get location from order item remarks (BrickLink API provides location in remarks field)
        const location = item.remarks || "UNKNOWN";

        // Match with inventory item using partNumber, colorId, condition, AND location
        const matchedInventoryItem = await ctx.db
          .query("inventoryItems")
          .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
          .filter((q) =>
            q.and(
              q.eq(q.field("partNumber"), item.item.no),
              q.eq(q.field("colorId"), item.color_id.toString()),
              q.eq(q.field("condition"), item.new_or_used === "N" ? "new" : "used"),
              q.eq(q.field("location"), location),
            ),
          )
          .first();

        // Update inventory quantities if matched
        if (matchedInventoryItem) {
          const quantityOrdered = item.quantity;

          // Update inventory item
          await ctx.db.patch(matchedInventoryItem._id, {
            quantityAvailable: matchedInventoryItem.quantityAvailable - quantityOrdered,
            quantityReserved: (matchedInventoryItem.quantityReserved || 0) + quantityOrdered,
            updatedAt: now,
          });

          // Write to quantity ledger
          const seq = await getNextSeqForItem(ctx.db, matchedInventoryItem._id);
          const preAvailable = await getCurrentAvailableFromLedger(
            ctx.db,
            matchedInventoryItem._id,
          );
          const postAvailable = preAvailable - quantityOrdered;

          await ctx.db.insert("inventoryQuantityLedger", {
            businessAccountId: args.businessAccountId,
            itemId: matchedInventoryItem._id,
            timestamp: now,
            seq,
            preAvailable,
            postAvailable,
            deltaAvailable: -quantityOrdered,
            reason: "order_sale",
            source: "bricklink",
            orderId: order.order_id,
            correlationId,
          });

          // TODO: Sync inventory quantity changes to OTHER marketplaces (not BrickLink)
          // Since this order originated from BrickLink, BrickLink already knows about the quantity change.
          // We need to sync this change to other configured marketplaces (e.g., BrickOwl)
          // to keep their inventory quantities in sync.
          // Implementation should:
          // 1. Get all configured providers (excluding "bricklink")
          // 2. For each provider, call enqueueMarketplaceSync with:
          //    - provider: "brickowl" (or other non-bricklink provider)
          //    - kind: "update"
          //    - lastSyncedSeq: matchedInventoryItem.marketplaceSync?.[provider]?.lastSyncedSeq ?? 0
          //    - currentSeq: seq
          // Example pattern from inventory/mutations.ts lines 156-169
        }

        await ctx.db.insert("bricklinkOrderItems", {
          businessAccountId: args.businessAccountId,
          orderId: order.order_id,
          inventoryId: item.inventory_id,
          itemNo: item.item.no,
          itemName: item.item.name,
          itemType: item.item.type,
          itemCategoryId: item.item.category_id,
          colorId: item.color_id,
          colorName: item.color_name,
          quantity: item.quantity,
          newOrUsed: item.new_or_used,
          completeness: item.completeness,
          unitPrice: parseFloat(item.unit_price),
          unitPriceFinal: parseFloat(item.unit_price_final),
          currencyCode: item.currency_code,
          remarks: item.remarks,
          description: item.description,
          weight: item.weight ? parseFloat(item.weight) : undefined,
          location,
          status: "unpicked",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});
