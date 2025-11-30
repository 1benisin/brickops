import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireUser, assertBusinessMembership } from "./helpers";
import {
  listInventoryItemsArgs,
  listInventoryItemsReturns,
  getInventoryTotalsArgs,
  getInventoryTotalsReturns,
  getItemSyncStatusArgs,
  getItemSyncStatusReturns,
} from "./validators";
import { querySpecValidator } from "./types";

export const listInventoryItems = query({
  args: listInventoryItemsArgs,
  returns: listInventoryItemsReturns,
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Exclude archived items from standard listings
    const activeItems = items.filter((item) => !item.isArchived);

    // Sort by createdAt descending (newest first)
    return activeItems.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getInventoryTotals = query({
  args: getInventoryTotalsArgs,
  returns: getInventoryTotalsReturns,
  handler: async (ctx) => {
    const { businessAccountId } = await requireUser(ctx);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Exclude archived items
    const activeItems = items.filter((item) => !item.isArchived);

    // Calculate totals
    const totals = activeItems.reduce(
      (acc, item) => {
        acc.available += item.quantityAvailable ?? 0;
        acc.reserved += item.quantityReserved ?? 0;
        return acc;
      },
      { available: 0, reserved: 0 },
    );

    return {
      counts: {
        items: activeItems.length,
      },
      totals,
    };
  },
});

/**
 * Get sync status for a specific inventory item
 * Returns sync status from marketplaceSync field and outbox status
 */
export const getItemSyncStatus = query({
  args: getItemSyncStatusArgs,
  returns: getItemSyncStatusReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);

    // Phase 3: Count pending/inflight outbox messages
    const pendingMessages = await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_item_provider_time", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .collect();

    const nextRetryAt = pendingMessages.reduce((min, msg) => {
      if (msg.nextAttemptAt > Date.now()) {
        return Math.min(min, msg.nextAttemptAt);
      }
      return min;
    }, Infinity);

    return {
      itemId: args.itemId,
      marketplaceSync: item.marketplaceSync,
      pendingChangesCount: pendingMessages.length,
      nextRetryAt: nextRetryAt === Infinity ? undefined : nextRetryAt,
    };
  },
});

// ============================================================================
// Ledger Queries (New)
// ============================================================================

/**
 * Get quantity ledger entries for a specific item
 */
export const getItemQuantityLedger = query({
  args: {
    itemId: v.id("inventoryItems"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    const limit = args.limit ?? 100;
    return entries.slice(0, limit);
  },
});

/**
 * Get location ledger entries for a specific item
 */
export const getItemLocationLedger = query({
  args: {
    itemId: v.id("inventoryItems"),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryLocationLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    // Sort newest first
    entries.sort((a, b) => b.timestamp - a.timestamp);

    const limit = args.limit ?? 100;
    return entries.slice(0, limit);
  },
});

/**
 * Calculate current on-hand quantity from ledger (for reconciliation)
 */
export const calculateOnHandQuantity = query({
  args: {
    itemId: v.id("inventoryItems"),
  },
  returns: v.object({
    calculatedAvailable: v.number(),
    ledgerEntries: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    let calculatedAvailable = 0;

    for (const entry of entries) {
      calculatedAvailable += entry.deltaAvailable;
    }

    return {
      calculatedAvailable,
      ledgerEntries: entries.length,
    };
  },
});

// ============================================================================
// Phase 3: Worker support queries (internal)
// ============================================================================

/**
 * Compute delta from ledger window (internal query for worker)
 * Phase 3: Used by outbox worker to compute deltas for sync operations
 */
export const computeDeltaFromWindow = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
    fromSeqExclusive: v.number(),
    toSeqInclusive: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) =>
        q
          .eq("itemId", args.itemId)
          .gt("seq", args.fromSeqExclusive)
          .lte("seq", args.toSeqInclusive),
      )
      .collect();

    return entries.reduce((acc, entry) => acc + entry.deltaAvailable, 0);
  },
});

/**
 * Get current max sequence from ledger (internal query for worker)
 */
export const getCurrentLedgerSeq = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
  },
  returns: v.union(
    v.object({
      seq: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const lastEntry = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .order("desc")
      .first();

    return lastEntry ? { seq: lastEntry.seq } : null;
  },
});

/**
 * Get ledger entry at specific sequence (internal query for worker)
 */
export const getLedgerEntryAtSeq = internalQuery({
  args: {
    itemId: v.id("inventoryItems"),
    seq: v.number(),
  },
  returns: v.union(
    v.object({
      seq: v.number(),
      postAvailable: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_item_seq", (q) => q.eq("itemId", args.itemId))
      .collect();

    const entry = entries.find((e) => e.seq === args.seq);
    return entry ? { seq: entry.seq, postAvailable: entry.postAvailable } : null;
  },
});

// ============================================================================
// Unified History Query
// ============================================================================

/**
 * Get unified inventory history combining quantity and location changes
 * Returns paginated results sorted by timestamp DESC
 */
export const getUnifiedInventoryHistory = query({
  args: {
    changeType: v.optional(v.union(v.literal("quantity"), v.literal("location"))),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    partNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);

    const limit = args.limit ?? 100;
    const offset = args.offset ?? 0;

    // Collect quantity ledger entries
    let quantityEntries = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_business_timestamp", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Apply date filters if provided
    if (args.dateFrom !== undefined) {
      quantityEntries = quantityEntries.filter((e) => e.timestamp >= args.dateFrom!);
    }
    if (args.dateTo !== undefined) {
      quantityEntries = quantityEntries.filter((e) => e.timestamp <= args.dateTo!);
    }

    // Collect location ledger entries
    let locationEntries = await ctx.db
      .query("inventoryLocationLedger")
      .withIndex("by_business_timestamp", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Apply date filters if provided
    if (args.dateFrom !== undefined) {
      locationEntries = locationEntries.filter((e) => e.timestamp >= args.dateFrom!);
    }
    if (args.dateTo !== undefined) {
      locationEntries = locationEntries.filter((e) => e.timestamp <= args.dateTo!);
    }

    // Transform to unified format
    const unifiedEntries: Array<{
      _id: string;
      changeType: "quantity" | "location";
      timestamp: number;
      userId: string | undefined;
      itemId: string;
      reason: string;
      source: string;
      correlationId: string | undefined;
      // Quantity-specific fields
      deltaAvailable?: number;
      preAvailable?: number;
      postAvailable?: number;
      seq?: number;
      orderId?: string;
      // Location-specific fields
      fromLocation?: string;
      toLocation?: string;
    }> = [];

    // Process quantity entries
    if (!args.changeType || args.changeType === "quantity") {
      for (const entry of quantityEntries) {
        // Filter by userId if provided
        if (args.userId !== undefined && entry.userId !== args.userId) {
          continue;
        }

        // Get item to filter by partNumber and location
        const item = await ctx.db.get(entry.itemId);
        if (!item || item.isArchived) continue;

        if (args.partNumber !== undefined && item.partNumber !== args.partNumber) {
          continue;
        }
        if (args.location !== undefined && item.location !== args.location) {
          continue;
        }

        unifiedEntries.push({
          _id: entry._id,
          changeType: "quantity",
          timestamp: entry.timestamp,
          userId: entry.userId,
          itemId: entry.itemId,
          reason: entry.reason,
          source: entry.source,
          correlationId: entry.correlationId,
          deltaAvailable: entry.deltaAvailable,
          preAvailable: entry.preAvailable,
          postAvailable: entry.postAvailable,
          seq: entry.seq,
          orderId: entry.orderId,
        });
      }
    }

    // Process location entries
    if (!args.changeType || args.changeType === "location") {
      for (const entry of locationEntries) {
        // Filter by userId if provided
        if (args.userId !== undefined && entry.userId !== args.userId) {
          continue;
        }

        // Get item to filter by partNumber
        const item = await ctx.db.get(entry.itemId);
        if (!item || item.isArchived) continue;

        if (args.partNumber !== undefined && item.partNumber !== args.partNumber) {
          continue;
        }
        // For location changes, check if toLocation matches
        if (args.location !== undefined && entry.toLocation !== args.location) {
          continue;
        }

        unifiedEntries.push({
          _id: entry._id,
          changeType: "location",
          timestamp: entry.timestamp,
          userId: entry.userId,
          itemId: entry.itemId,
          reason: entry.reason,
          source: entry.source,
          correlationId: entry.correlationId,
          fromLocation: entry.fromLocation,
          toLocation: entry.toLocation,
        });
      }
    }

    // Sort by timestamp DESC (newest first)
    unifiedEntries.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const paginatedEntries = unifiedEntries.slice(offset, offset + limit);

    // Enrich with item and user details
    const enrichedEntries = await Promise.all(
      paginatedEntries.map(async (entry) => {
        const item = await ctx.db.get(entry.itemId as Id<"inventoryItems">);
        if (!item) return null;

        // Get user info
        let actor = null;
        if (entry.userId) {
          const user = await ctx.db.get(entry.userId as Id<"users">);
          if (user) {
            actor = {
              firstName: user.firstName ?? undefined,
              lastName: user.lastName ?? undefined,
              email: user.email ?? undefined,
            };
          }
        }

        // Get part name from catalog
        let partName: string | undefined = undefined;
        if (item.partNumber) {
          const part = await ctx.db
            .query("parts")
            .withIndex("by_no", (q) => q.eq("no", item.partNumber))
            .first();
          if (part) {
            partName = part.name;
          }
        }

        return {
          ...entry,
          item: {
            _id: item._id,
            partNumber: item.partNumber,
            name: item.name,
            colorId: item.colorId,
            location: item.location,
            condition: item.condition,
            price: item.price,
            quantityAvailable: item.quantityAvailable,
            quantityReserved: item.quantityReserved,
          },
          partName,
          actor,
        };
      }),
    );

    // Filter out null entries (items that no longer exist)
    return enrichedEntries.filter((e): e is NonNullable<typeof e> => e !== null);
  },
});

// ============================================================================
// Server-Side Filtered Query (Step 0: Server-Side Infrastructure)
// ============================================================================

/**
 * Unified query function for inventory table with server-side pagination, filtering, and sorting
 * Uses QuerySpec pattern for normalized query contract
 */
export const listInventoryItemsFiltered = query({
  args: {
    querySpec: querySpecValidator,
  },
  returns: v.object({
    items: v.array(v.any()),
    cursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const { filters, sort, pagination } = args.querySpec;

    // Choose best index based on filters and sort
    const primarySort = sort[0]?.id || "createdAt";
    const sortDesc = sort[0]?.desc ?? true;

    // Index selection logic - using const assertions for type safety
    type IndexName =
      | "by_businessAccount_createdAt"
      | "by_businessAccount_condition_createdAt"
      | "by_businessAccount_location_partNumber"
      | "by_businessAccount_price"
      | "by_businessAccount_partNumber"
      | "by_businessAccount_quantity"
      | "by_businessAccount_name"
      | "by_businessAccount_colorId"
      | "by_businessAccount_location"
      | "by_businessAccount_condition"
      | "by_businessAccount_quantityReserved"
      | "by_businessAccount_updatedAt";

    let indexName: IndexName;
    let queryBuilder;

    if (filters?.condition && primarySort === "_creationTime") {
      // Use composite index: by_businessAccount_condition_createdAt
      indexName = "by_businessAccount_condition_createdAt";
      const conditionValue = filters.condition.value as "new" | "used";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) =>
          q.eq("businessAccountId", businessAccountId).eq("condition", conditionValue),
        );
    } else if (filters?.location && primarySort === "partNumber") {
      // Use composite index: by_businessAccount_location_partNumber
      indexName = "by_businessAccount_location_partNumber";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) =>
          q.eq("businessAccountId", businessAccountId).eq("location", filters.location!.value),
        );
    } else if (primarySort === "price") {
      indexName = "by_businessAccount_price";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "partNumber") {
      indexName = "by_businessAccount_partNumber";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "quantityAvailable") {
      indexName = "by_businessAccount_quantity";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "name") {
      indexName = "by_businessAccount_name";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "colorId") {
      indexName = "by_businessAccount_colorId";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "location") {
      indexName = "by_businessAccount_location";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "condition") {
      indexName = "by_businessAccount_condition";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "quantityReserved") {
      indexName = "by_businessAccount_quantityReserved";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else if (primarySort === "updatedAt") {
      indexName = "by_businessAccount_updatedAt";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    } else {
      // Default: sort by _creationTime
      indexName = "by_businessAccount_createdAt";
      queryBuilder = ctx.db
        .query("inventoryItems")
        .withIndex(indexName, (q) => q.eq("businessAccountId", businessAccountId));
    }

    // Build query with filters
    queryBuilder = queryBuilder
      .filter((q) => {
        // Always filter out archived items
        let filter = q.eq(q.field("isArchived"), false);

        // Text prefix searches
        if (filters?.partNumber?.kind === "prefix") {
          const prefix = filters.partNumber.value;
          filter = q.and(
            filter,
            q.gte(q.field("partNumber"), prefix),
            q.lt(q.field("partNumber"), prefix + "\uffff"),
          );
        }

        if (filters?.name?.kind === "prefix") {
          const prefix = filters.name.value;
          filter = q.and(
            filter,
            q.gte(q.field("name"), prefix),
            q.lt(q.field("name"), prefix + "\uffff"),
          );
        }

        if (filters?.colorId?.kind === "prefix") {
          const prefix = filters.colorId.value;
          filter = q.and(
            filter,
            q.gte(q.field("colorId"), prefix),
            q.lt(q.field("colorId"), prefix + "\uffff"),
          );
        }

        // Number ranges
        if (filters?.price?.kind === "numberRange") {
          if (filters.price.min !== undefined) {
            filter = q.and(filter, q.gte(q.field("price"), filters.price.min));
          }
          if (filters.price.max !== undefined) {
            filter = q.and(filter, q.lte(q.field("price"), filters.price.max));
          }
        }

        if (filters?.quantityAvailable?.kind === "numberRange") {
          if (filters.quantityAvailable.min !== undefined) {
            filter = q.and(
              filter,
              q.gte(q.field("quantityAvailable"), filters.quantityAvailable.min),
            );
          }
          if (filters.quantityAvailable.max !== undefined) {
            filter = q.and(
              filter,
              q.lte(q.field("quantityAvailable"), filters.quantityAvailable.max),
            );
          }
        }

        if (filters?.quantityReserved?.kind === "numberRange") {
          if (filters.quantityReserved.min !== undefined) {
            filter = q.and(
              filter,
              q.gte(q.field("quantityReserved"), filters.quantityReserved.min),
            );
          }
          if (filters.quantityReserved.max !== undefined) {
            filter = q.and(
              filter,
              q.lte(q.field("quantityReserved"), filters.quantityReserved.max),
            );
          }
        }

        // Date ranges
        if (filters?._creationTime?.kind === "dateRange") {
          if (filters._creationTime.start !== undefined) {
            filter = q.and(filter, q.gte(q.field("_creationTime"), filters._creationTime.start));
          }
          if (filters._creationTime.end !== undefined) {
            filter = q.and(filter, q.lte(q.field("_creationTime"), filters._creationTime.end));
          }
        }

        if (filters?.updatedAt?.kind === "dateRange") {
          if (filters.updatedAt.start !== undefined) {
            filter = q.and(filter, q.gte(q.field("updatedTime"), filters.updatedAt.start));
          }
          if (filters.updatedAt.end !== undefined) {
            filter = q.and(filter, q.lte(q.field("updatedTime"), filters.updatedAt.end));
          }
        }

        // Note: condition and location filters are handled via index predicates above
        // Additional filters here if not using composite indexes

        return filter;
      })
      .order(sortDesc ? "desc" : "asc");

    // Apply cursor if provided (for pagination)
    if (pagination.cursor) {
      const cursorDoc = await ctx.db.get(pagination.cursor as Id<"inventoryItems">);
      if (cursorDoc) {
        // Filter items after cursor based on sort field
        queryBuilder = queryBuilder.filter((q) => {
          if (primarySort === "createdAt") {
            if (sortDesc) {
              // For desc: get items with createdAt < cursor OR (createdAt == cursor AND _id > cursor)
              return q.or(
                q.lt(q.field("_creationTime"), cursorDoc._creationTime),
                q.and(
                  q.eq(q.field("_creationTime"), cursorDoc._creationTime),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              // For asc: get items with createdAt > cursor OR (createdAt == cursor AND _id > cursor)
              return q.or(
                q.gt(q.field("_creationTime"), cursorDoc._creationTime),
                q.and(
                  q.eq(q.field("_creationTime"), cursorDoc._creationTime),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "partNumber") {
            // Similar logic for partNumber sort
            if (sortDesc) {
              return q.or(
                q.lt(q.field("partNumber"), cursorDoc.partNumber),
                q.and(
                  q.eq(q.field("partNumber"), cursorDoc.partNumber),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              return q.or(
                q.gt(q.field("partNumber"), cursorDoc.partNumber),
                q.and(
                  q.eq(q.field("partNumber"), cursorDoc.partNumber),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "name") {
            // String sort for name
            if (sortDesc) {
              return q.or(
                q.lt(q.field("name"), cursorDoc.name),
                q.and(q.eq(q.field("name"), cursorDoc.name), q.gt(q.field("_id"), cursorDoc._id)),
              );
            } else {
              return q.or(
                q.gt(q.field("name"), cursorDoc.name),
                q.and(q.eq(q.field("name"), cursorDoc.name), q.gt(q.field("_id"), cursorDoc._id)),
              );
            }
          } else if (primarySort === "colorId") {
            // String sort for colorId
            if (sortDesc) {
              return q.or(
                q.lt(q.field("colorId"), cursorDoc.colorId),
                q.and(
                  q.eq(q.field("colorId"), cursorDoc.colorId),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              return q.or(
                q.gt(q.field("colorId"), cursorDoc.colorId),
                q.and(
                  q.eq(q.field("colorId"), cursorDoc.colorId),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "location") {
            // String sort for location
            if (sortDesc) {
              return q.or(
                q.lt(q.field("location"), cursorDoc.location),
                q.and(
                  q.eq(q.field("location"), cursorDoc.location),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              return q.or(
                q.gt(q.field("location"), cursorDoc.location),
                q.and(
                  q.eq(q.field("location"), cursorDoc.location),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "condition") {
            // Enum sort for condition (treated as string)
            if (sortDesc) {
              return q.or(
                q.lt(q.field("condition"), cursorDoc.condition),
                q.and(
                  q.eq(q.field("condition"), cursorDoc.condition),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              return q.or(
                q.gt(q.field("condition"), cursorDoc.condition),
                q.and(
                  q.eq(q.field("condition"), cursorDoc.condition),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "quantityReserved") {
            // Number sort for quantityReserved
            if (sortDesc) {
              return q.or(
                q.lt(q.field("quantityReserved"), cursorDoc.quantityReserved),
                q.and(
                  q.eq(q.field("quantityReserved"), cursorDoc.quantityReserved),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              return q.or(
                q.gt(q.field("quantityReserved"), cursorDoc.quantityReserved),
                q.and(
                  q.eq(q.field("quantityReserved"), cursorDoc.quantityReserved),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          } else if (primarySort === "updatedAt") {
            // Date/timestamp sort for updatedTime (optional field, use _creationTime if undefined)
            // For cursor: use updatedTime if present, otherwise _creationTime
            const cursorValue = cursorDoc.updatedTime ?? cursorDoc._creationTime;
            if (sortDesc) {
              // Descending: items with updatedTime < cursor OR (updatedTime == cursor AND _id > cursor)
              // Note: Items without updatedTime will sort by _creationTime in the query itself
              return q.or(
                q.lt(q.field("updatedTime"), cursorValue),
                q.and(
                  q.eq(q.field("updatedTime"), cursorValue),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            } else {
              // Ascending: items with updatedTime > cursor OR (updatedTime == cursor AND _id > cursor)
              return q.or(
                q.gt(q.field("updatedTime"), cursorValue),
                q.and(
                  q.eq(q.field("updatedTime"), cursorValue),
                  q.gt(q.field("_id"), cursorDoc._id),
                ),
              );
            }
          }
          // Fallback: use _id for other sort fields
          return q.gt(q.field("_id"), cursorDoc._id);
        });
      }
    }

    // Take requested page size
    const results = await queryBuilder.take(pagination.pageSize);

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
