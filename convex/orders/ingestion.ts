import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getCurrentAvailableFromLedger, getNextSeqForItem } from "../inventory/helpers";
import {
  createNormalizationError,
  isNormalizationError,
  normalizeOrder as normalizeProviderOrder,
  normalizeOrderItems as normalizeProviderOrderItems,
  NORMALIZATION_ERROR_CODES,
  type NormalizedOrder,
  type NormalizedOrderItem,
  type ProviderId,
} from "./normalizers";

function wrapNormalizationError(
  error: unknown,
  provider: ProviderId,
  meta: Record<string, unknown>,
): never {
  if (isNormalizationError(error)) {
    throw error;
  }

  throw createNormalizationError(NORMALIZATION_ERROR_CODES.InvalidValue, {
    provider,
    message: "Failed to normalize provider order payload.",
    meta,
    cause: error,
  });
}

async function findInventoryItem(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  item: NormalizedOrderItem,
) {
  // TODO: Remove any casts once Convex schema typing is enabled for this project.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ctx.db as any;

  let query = db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .query("inventoryItems")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_businessAccount", (q: any) => q.eq("businessAccountId", businessAccountId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((q: any) => q.eq(q.field("partNumber"), item.itemNo));

  if (item.colorId !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.filter((q: any) => q.eq(q.field("colorId"), String(item.colorId)));
  }

  if (item.condition) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.filter((q: any) => q.eq(q.field("condition"), item.condition));
  }

  if (item.location) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.filter((q: any) => q.eq(q.field("location"), item.location));
  }

  return await query.first();
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
    // TODO: Remove any casts once Convex schema typing is enabled for this project.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.db as any;
    let normalizedOrder: NormalizedOrder;
    try {
      normalizedOrder = normalizeProviderOrder(args.provider, args.orderData);
    } catch (error) {
      wrapNormalizationError(error, args.provider, { stage: "order" });
    }

    let normalizedItems: NormalizedOrderItem[];
    try {
      normalizedItems = normalizeProviderOrderItems(
        args.provider,
        normalizedOrder.orderId,
        args.orderItemsData,
      );
    } catch (error) {
      wrapNormalizationError(error, args.provider, {
        stage: "items",
        orderId: normalizedOrder.orderId,
      });
    }

    const existing = await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query("orders")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_business_provider_order", (q: any) =>
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
      await db.patch(existing._id, orderDoc);
    } else {
      await db.insert("orders", {
        ...orderDoc,
        createdAt: now,
      });
    }

    const existingItems = await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query("orderItems")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_business_provider_order", (q: any) =>
        q
          .eq("businessAccountId", args.businessAccountId)
          .eq("provider", args.provider)
          .eq("orderId", normalizedOrder.orderId),
      )
      .collect();

    for (const item of existingItems) {
      await db.delete(item._id);
    }

    const correlationId = crypto.randomUUID();

    for (const item of normalizedItems) {
      await db.insert("orderItems", {
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

      await db.patch(matchedInventoryItem._id, {
        quantityAvailable: matchedInventoryItem.quantityAvailable - item.quantity,
        quantityReserved: (matchedInventoryItem.quantityReserved || 0) + item.quantity,
        updatedAt: now,
      });

      const seq = await getNextSeqForItem(ctx.db, matchedInventoryItem._id);
      const preAvailable = await getCurrentAvailableFromLedger(ctx.db, matchedInventoryItem._id);
      const postAvailable = preAvailable - item.quantity;

      await db.insert("inventoryQuantityLedger", {
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
