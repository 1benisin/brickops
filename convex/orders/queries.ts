import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";

/**
 * Orders QuerySpec Validator
 * Unified query contract between UI and server for filtering and sorting orders
 */
export const ordersQuerySpecValidator = v.object({
  filters: v.optional(
    v.object({
      // Text contains searches (case-insensitive)
      orderId: v.optional(
        v.object({
          kind: v.union(v.literal("contains"), v.literal("prefix")),
          value: v.string(),
        }),
      ),
      buyerName: v.optional(
        v.object({
          kind: v.union(v.literal("contains"), v.literal("prefix")),
          value: v.string(),
        }),
      ),
      paymentMethod: v.optional(
        v.object({
          kind: v.union(v.literal("contains"), v.literal("prefix")),
          value: v.string(),
        }),
      ),
      shippingMethod: v.optional(
        v.object({
          kind: v.union(v.literal("contains"), v.literal("prefix")),
          value: v.string(),
        }),
      ),

      // Number range filters
      costGrandTotal: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      totalCount: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      lotCount: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      costSubtotal: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),
      costShipping: v.optional(
        v.object({
          kind: v.literal("numberRange"),
          min: v.optional(v.number()),
          max: v.optional(v.number()),
        }),
      ),

      // Date range filters
      dateOrdered: v.optional(
        v.object({
          kind: v.literal("dateRange"),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
        }),
      ),
      dateStatusChanged: v.optional(
        v.object({
          kind: v.literal("dateRange"),
          start: v.optional(v.number()),
          end: v.optional(v.number()),
        }),
      ),

      // Enum filters
      status: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),
      paymentStatus: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),
      provider: v.optional(
        v.object({
          kind: v.literal("enum"),
          value: v.string(),
        }),
      ),
    }),
  ),

  sort: v.array(
    v.object({
      id: v.string(), // column id: "orderId", "dateOrdered", "costGrandTotal", etc.
      desc: v.boolean(),
    }),
  ),

  pagination: v.object({
    cursor: v.optional(v.string()), // Document _id for cursor-based pagination
    pageSize: v.number(), // Capped at 25/50/100
  }),
});

export type OrdersQuerySpec = Infer<typeof ordersQuerySpecValidator>;

/**
 * List all orders for the authenticated user's business account
 * Available to all authenticated users (not just owners)
 * Returns orders sorted by dateOrdered descending (newest first)
 */
export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_business_date", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Sort by dateOrdered descending (newest first)
    return orders.sort((a, b) => b.dateOrdered - a.dateOrdered);
  },
});

/**
 * List orders with filtering, sorting, and pagination
 * Uses QuerySpec pattern for normalized query contract
 */
export const listOrdersFiltered = query({
  args: {
    querySpec: ordersQuerySpecValidator,
  },
  returns: v.object({
    items: v.array(v.any()),
    cursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;
    const { sort, pagination } = args.querySpec;
    const rawFilters = args.querySpec.filters;

    type TextFilterKey = "orderId" | "buyerName" | "paymentMethod" | "shippingMethod";
    // Contains filters use search indexes; only the first match in this priority list is applied per request.
    const textFilterPriority: TextFilterKey[] = [
      "orderId",
      "buyerName",
      "paymentMethod",
      "shippingMethod",
    ];

    let textFilterField: TextFilterKey | undefined;
    let textFilterValue: string | undefined;
    if (rawFilters) {
      for (const field of textFilterPriority) {
        const candidate = rawFilters[field];
        if (candidate && candidate.kind === "contains") {
          textFilterField = field;
          textFilterValue = candidate.value;
          break;
        }
      }
    }

    const remainingFilters = rawFilters ? { ...rawFilters } : undefined;
    if (remainingFilters) {
      for (const field of textFilterPriority) {
        const candidate = remainingFilters[field];
        if (candidate && candidate.kind === "contains") {
          delete remainingFilters[field];
        }
      }
    }

    let providerFilter: "bricklink" | "brickowl" | undefined;
    if (remainingFilters?.provider && remainingFilters.provider.kind === "enum") {
      providerFilter = remainingFilters.provider.value as "bricklink" | "brickowl";
      delete remainingFilters.provider;
    }

    const usingSearchIndex = Boolean(textFilterField && textFilterValue);

    // Choose best index based on filters and sort
    const primarySort = sort[0]?.id || "dateOrdered";
    const sortDesc = sort[0]?.desc ?? true;

    let queryBuilder;
    if (textFilterField && textFilterValue) {
      const searchIndexMap = {
        orderId: "search_orders_orderId",
        buyerName: "search_orders_buyerName",
        paymentMethod: "search_orders_paymentMethod",
        shippingMethod: "search_orders_shippingMethod",
      } as const;
      const searchFieldMap = {
        orderId: "orderId",
        buyerName: "buyerName",
        paymentMethod: "paymentMethod",
        shippingMethod: "shippingMethod",
      } as const;

      queryBuilder = ctx.db
        .query("orders")
        .withSearchIndex(searchIndexMap[textFilterField], (q) => {
          let searchBuilder = q
            .search(searchFieldMap[textFilterField], textFilterValue)
            .eq("businessAccountId", businessAccountId);
          if (providerFilter) {
            searchBuilder = searchBuilder.eq("provider", providerFilter);
          }
          return searchBuilder;
        });
    } else {
      if (remainingFilters?.status && primarySort === "dateOrdered") {
        const statusValue = remainingFilters.status.value;
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_status_dateOrdered", (q) =>
            q.eq("businessAccountId", businessAccountId).eq("status", statusValue),
          );
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else if (primarySort === "costGrandTotal") {
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_costGrandTotal", (q) =>
            q.eq("businessAccountId", businessAccountId),
          );
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else if (primarySort === "orderId") {
        if (providerFilter) {
          queryBuilder = ctx.db
            .query("orders")
            .withIndex("by_business_provider_order", (q) =>
              q.eq("businessAccountId", businessAccountId).eq("provider", providerFilter),
            );
        } else {
          queryBuilder = ctx.db
            .query("orders")
            .withIndex("by_business_order", (q) => q.eq("businessAccountId", businessAccountId));
        }
      } else if (primarySort === "buyerName") {
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_buyerName", (q) => q.eq("businessAccountId", businessAccountId));
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else if (primarySort === "totalCount") {
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_totalCount", (q) => q.eq("businessAccountId", businessAccountId));
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else if (primarySort === "dateStatusChanged") {
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_dateStatusChanged", (q) =>
            q.eq("businessAccountId", businessAccountId),
          );
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else if (primarySort === "status") {
        queryBuilder = ctx.db
          .query("orders")
          .withIndex("by_business_status", (q) => q.eq("businessAccountId", businessAccountId));
        if (providerFilter) {
          queryBuilder = queryBuilder.filter((q) => q.eq(q.field("provider"), providerFilter));
        }
      } else {
        if (providerFilter) {
          queryBuilder = ctx.db
            .query("orders")
            .withIndex("by_business_provider_date", (q) =>
              q.eq("businessAccountId", businessAccountId).eq("provider", providerFilter),
            );
        } else {
          queryBuilder = ctx.db
            .query("orders")
            .withIndex("by_business_date", (q) => q.eq("businessAccountId", businessAccountId));
        }
      }
    }

    // Build query with filters
    // Note: businessAccountId is already filtered by the index predicate above
    queryBuilder = queryBuilder.filter((q) => {
      let filter = q.eq(q.field("businessAccountId"), businessAccountId); // Keep for safety but index already filters

      if (providerFilter) {
        filter = q.and(filter, q.eq(q.field("provider"), providerFilter));
      }

      // Text prefix searches
      if (remainingFilters?.orderId?.kind === "prefix") {
        const prefix = remainingFilters.orderId.value;
        filter = q.and(
          filter,
          q.gte(q.field("orderId"), prefix),
          q.lt(q.field("orderId"), prefix + "\uffff"),
        );
      }

      if (remainingFilters?.buyerName?.kind === "prefix") {
        const prefix = remainingFilters.buyerName.value;
        filter = q.and(
          filter,
          q.gte(q.field("buyerName"), prefix),
          q.lt(q.field("buyerName"), prefix + "\uffff"),
        );
      }

      // Number ranges
      if (remainingFilters?.costGrandTotal?.kind === "numberRange") {
        if (remainingFilters.costGrandTotal.min !== undefined) {
          filter = q.and(
            filter,
            q.gte(q.field("costGrandTotal"), remainingFilters.costGrandTotal.min),
          );
        }
        if (remainingFilters.costGrandTotal.max !== undefined) {
          filter = q.and(
            filter,
            q.lte(q.field("costGrandTotal"), remainingFilters.costGrandTotal.max),
          );
        }
      }

      if (remainingFilters?.totalCount?.kind === "numberRange") {
        if (remainingFilters.totalCount.min !== undefined) {
          filter = q.and(filter, q.gte(q.field("totalCount"), remainingFilters.totalCount.min));
        }
        if (remainingFilters.totalCount.max !== undefined) {
          filter = q.and(filter, q.lte(q.field("totalCount"), remainingFilters.totalCount.max));
        }
      }

      if (remainingFilters?.lotCount?.kind === "numberRange") {
        if (remainingFilters.lotCount.min !== undefined) {
          filter = q.and(filter, q.gte(q.field("lotCount"), remainingFilters.lotCount.min));
        }
        if (remainingFilters.lotCount.max !== undefined) {
          filter = q.and(filter, q.lte(q.field("lotCount"), remainingFilters.lotCount.max));
        }
      }

      if (remainingFilters?.costSubtotal?.kind === "numberRange") {
        if (remainingFilters.costSubtotal.min !== undefined) {
          filter = q.and(filter, q.gte(q.field("costSubtotal"), remainingFilters.costSubtotal.min));
        }
        if (remainingFilters.costSubtotal.max !== undefined) {
          filter = q.and(filter, q.lte(q.field("costSubtotal"), remainingFilters.costSubtotal.max));
        }
      }

      if (remainingFilters?.costShipping?.kind === "numberRange") {
        if (remainingFilters.costShipping.min !== undefined) {
          filter = q.and(filter, q.gte(q.field("costShipping"), remainingFilters.costShipping.min));
        }
        if (remainingFilters.costShipping.max !== undefined) {
          filter = q.and(filter, q.lte(q.field("costShipping"), remainingFilters.costShipping.max));
        }
      }

      // Date ranges
      if (remainingFilters?.dateOrdered?.kind === "dateRange") {
        if (remainingFilters.dateOrdered.start !== undefined) {
          filter = q.and(filter, q.gte(q.field("dateOrdered"), remainingFilters.dateOrdered.start));
        }
        if (remainingFilters.dateOrdered.end !== undefined) {
          filter = q.and(filter, q.lte(q.field("dateOrdered"), remainingFilters.dateOrdered.end));
        }
      }

      if (remainingFilters?.dateStatusChanged?.kind === "dateRange") {
        if (remainingFilters.dateStatusChanged.start !== undefined) {
          filter = q.and(
            filter,
            q.gte(q.field("dateStatusChanged"), remainingFilters.dateStatusChanged.start),
          );
        }
        if (remainingFilters.dateStatusChanged.end !== undefined) {
          filter = q.and(
            filter,
            q.lte(q.field("dateStatusChanged"), remainingFilters.dateStatusChanged.end),
          );
        }
      }

      // Enum filters (status is handled via index predicate above if using composite index)
      if (remainingFilters?.status && primarySort !== "dateOrdered") {
        // Only apply filter if not using composite index
        filter = q.and(filter, q.eq(q.field("status"), remainingFilters.status.value));
      }

      if (remainingFilters?.paymentStatus) {
        filter = q.and(
          filter,
          q.eq(q.field("paymentStatus"), remainingFilters.paymentStatus.value),
        );
      }

      return filter;
    });

    if (!usingSearchIndex) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryBuilder = (queryBuilder as any).order(sortDesc ? "desc" : "asc");

      // Apply cursor if provided (for pagination)
      if (pagination.cursor) {
        const cursorDoc = await ctx.db.get(pagination.cursor as Id<"orders">);
        if (cursorDoc) {
          // Filter items after cursor based on sort field
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          queryBuilder = (queryBuilder as any).filter((q: any) => {
            if (primarySort === "dateOrdered") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("dateOrdered"), cursorDoc.dateOrdered),
                  q.and(
                    q.eq(q.field("dateOrdered"), cursorDoc.dateOrdered),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("dateOrdered"), cursorDoc.dateOrdered),
                  q.and(
                    q.eq(q.field("dateOrdered"), cursorDoc.dateOrdered),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "orderId") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("orderId"), cursorDoc.orderId),
                  q.and(
                    q.eq(q.field("orderId"), cursorDoc.orderId),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("orderId"), cursorDoc.orderId),
                  q.and(
                    q.eq(q.field("orderId"), cursorDoc.orderId),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "buyerName") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("buyerName"), cursorDoc.buyerName),
                  q.and(
                    q.eq(q.field("buyerName"), cursorDoc.buyerName),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("buyerName"), cursorDoc.buyerName),
                  q.and(
                    q.eq(q.field("buyerName"), cursorDoc.buyerName),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "costGrandTotal") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("costGrandTotal"), cursorDoc.costGrandTotal),
                  q.and(
                    q.eq(q.field("costGrandTotal"), cursorDoc.costGrandTotal),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("costGrandTotal"), cursorDoc.costGrandTotal),
                  q.and(
                    q.eq(q.field("costGrandTotal"), cursorDoc.costGrandTotal),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "totalCount") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("totalCount"), cursorDoc.totalCount),
                  q.and(
                    q.eq(q.field("totalCount"), cursorDoc.totalCount),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("totalCount"), cursorDoc.totalCount),
                  q.and(
                    q.eq(q.field("totalCount"), cursorDoc.totalCount),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "dateStatusChanged") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("dateStatusChanged"), cursorDoc.dateStatusChanged),
                  q.and(
                    q.eq(q.field("dateStatusChanged"), cursorDoc.dateStatusChanged),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("dateStatusChanged"), cursorDoc.dateStatusChanged),
                  q.and(
                    q.eq(q.field("dateStatusChanged"), cursorDoc.dateStatusChanged),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            } else if (primarySort === "status") {
              if (sortDesc) {
                return q.or(
                  q.lt(q.field("status"), cursorDoc.status),
                  q.and(
                    q.eq(q.field("status"), cursorDoc.status),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              } else {
                return q.or(
                  q.gt(q.field("status"), cursorDoc.status),
                  q.and(
                    q.eq(q.field("status"), cursorDoc.status),
                    q.gt(q.field("_id"), cursorDoc._id),
                  ),
                );
              }
            }
            // Fallback: use _id for other sort fields
            return sortDesc
              ? q.gt(q.field("_id"), cursorDoc._id)
              : q.gt(q.field("_id"), cursorDoc._id);
          });
        }
      }
    }

    // Take requested page size
    const results = await queryBuilder.take(pagination.pageSize);

    if (usingSearchIndex) {
      // Search queries return results in relevance order; we do not expose additional pages yet.
      return {
        items: results,
        cursor: undefined,
        isDone: true,
      };
    }

    // Calculate next cursor
    const cursor =
      results.length === pagination.pageSize && results.length > 0
        ? results[results.length - 1]._id
        : undefined;

    return {
      items: results,
      cursor: cursor,
      isDone: cursor === undefined,
    };
  },
});

/**
 * Get orders by orderIds
 * Returns orders matching the provided orderIds
 * Available to all authenticated users (not just owners)
 */
export const getOrdersByIds = query({
  args: {
    orderIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.orderIds.length === 0) {
      return [];
    }

    // Fetch all matching orders
    const orders: Doc<"orders">[] = [];

    for (const orderId of args.orderIds) {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_business_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .first();

      if (order) {
        orders.push(order);
      }
    }

    return orders;
  },
});

/**
 * Get order items for multiple orders
 * Returns order items grouped by orderId
 * Available to all authenticated users (not just owners)
 */
export const getOrderItemsForOrders = query({
  args: {
    orderIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.orderIds.length === 0) {
      return {};
    }

    // Fetch all order items for the given order IDs
    // Group by orderId for efficient access
    const itemsByOrderId: Record<string, Doc<"orderItems">[]> = {};

    for (const orderId of args.orderIds) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .collect();

      itemsByOrderId[orderId] = items;
    }

    return itemsByOrderId;
  },
});

/**
 * Get all order items for selected orders, sorted by location
 * Returns all order items (including picked ones) with inventory matching info
 * Frontend will use status value to display items appropriately
 * Available to all authenticated users (not just owners)
 */
export const getPickableItemsForOrders = query({
  args: {
    orderIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.businessAccountId) {
      throw new ConvexError("User not found or not linked to business account");
    }

    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.orderIds.length === 0) {
      return [];
    }

    // Get all order items for the given orderIds
    const allOrderItems: Doc<"orderItems">[] = [];

    for (const orderId of args.orderIds) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderId),
        )
        .collect();

      allOrderItems.push(...items);
    }

    // Match each order item with inventory item to get remaining quantity info
    // Return ALL items (including picked ones) - frontend will handle display based on status
    const items = await Promise.all(
      allOrderItems.map(async (orderItem) => {
        const location = orderItem.location ?? "UNKNOWN";
        const condition = orderItem.condition ?? undefined;
        const colorIdFilter =
          orderItem.colorId !== undefined ? String(orderItem.colorId) : undefined;

        let inventoryQuery = ctx.db
          .query("inventoryItems")
          .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
          .filter((q) => {
            let predicate = q.eq(q.field("partNumber"), orderItem.itemNo);
            if (colorIdFilter) {
              predicate = q.and(predicate, q.eq(q.field("colorId"), colorIdFilter));
            }
            if (condition) {
              predicate = q.and(predicate, q.eq(q.field("condition"), condition));
            }
            predicate = q.and(predicate, q.eq(q.field("location"), location));
            return predicate;
          });

        const inventoryItem = await inventoryQuery.first();
        const status = orderItem.status;

        let remainingAfterPick = 0;
        if (inventoryItem) {
          if (status === "unpicked" || status === "skipped") {
            remainingAfterPick =
              inventoryItem.quantityAvailable + inventoryItem.quantityReserved - orderItem.quantity;
          } else {
            remainingAfterPick = inventoryItem.quantityAvailable + inventoryItem.quantityReserved;
          }
        }

        return {
          orderItemId: orderItem._id,
          orderId: orderItem.orderId,
          itemNo: orderItem.itemNo,
          itemName: orderItem.itemName,
          colorId: orderItem.colorId,
          colorName: orderItem.colorName,
          quantity: orderItem.quantity,
          location,
          status,
          inventoryItemId: inventoryItem?._id,
          remainingAfterPick,
          imageUrl: undefined,
        };
      }),
    );

    // Sort by location (alphabetically)
    items.sort((a, b) => a.location.localeCompare(b.location));

    return items;
  },
});

