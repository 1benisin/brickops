/**
 * Universal Refresh Manager for Bricklink Data
 *
 * Consolidated refresh orchestration system that handles:
 * - Queue management (add, process, cleanup)
 * - Freshness detection and staleness checking
 * - Rate-limited batch processing
 * - Bricklink API integration
 */

import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { catalogClient } from "./catalogClient";
import { recordMetric } from "../lib/external/metrics";

// ============================================================================
// CONSTANTS
// ============================================================================

// Refresh priorities (lower number = higher priority)
export const REFRESH_PRIORITY = {
  HIGH: 1, // Parts (user is viewing)
  MEDIUM: 2, // Colors, categories
  LOW: 3, // Prices, bulk updates
} as const;

// Freshness threshold (30 days in milliseconds)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Batch size for queue processing (10 items per minute = 600 API calls/hour max)
const BATCH_SIZE = 10;

// ============================================================================
// FRESHNESS UTILITIES
// ============================================================================

/**
 * Check if data is stale (older than 30 days)
 */
export function isStale(lastFetched: number | undefined): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > THIRTY_DAYS_MS;
}

/**
 * Check data freshness with configurable threshold and schedule refresh if stale
 * Must be called via ctx.runMutation from mutations - ensures proper transaction handling
 *
 * Priority Logic:
 * - If priority is explicitly provided, use it (for user-triggered actions)
 * - Otherwise, auto-determine: categories = LOW, others = MEDIUM
 *
 * Key Structure:
 * - parts: primaryKey = partNo
 * - colors: primaryKey = colorId (stringified)
 * - categories: primaryKey = categoryId (stringified)
 * - partColors: primaryKey = partNo, secondaryKey = colorId (stringified)
 * - partPrices: primaryKey = partNo, secondaryKey = colorId (stringified)
 *   Note: partPrices refresh fetches all 4 variants (N/U × sold/stock)
 */
export const checkAndScheduleRefresh = internalMutation({
  args: {
    tableName: v.union(
      v.literal("parts"),
      v.literal("categories"),
      v.literal("partColors"),
      v.literal("partPrices"),
    ),
    primaryKey: v.union(v.string(), v.number()),
    secondaryKey: v.optional(v.union(v.string(), v.number())),
    lastFetched: v.optional(v.number()),
    freshnessThresholdDays: v.optional(v.number()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, params) => {
    const thresholdDays = params.freshnessThresholdDays ?? 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // If no lastFetched or older than threshold, it's stale
    const isStale = !params.lastFetched || now - params.lastFetched > thresholdMs;

    if (isStale) {
      // Normalize keys to strings
      const primaryKey = String(params.primaryKey);
      const secondaryKey = params.secondaryKey ? String(params.secondaryKey) : undefined;

      // Determine priority: use explicit if provided, otherwise auto-determine
      const priority =
        params.priority ??
        (params.tableName === "categories" ? REFRESH_PRIORITY.LOW : REFRESH_PRIORITY.MEDIUM);

      // Check if already queued (pending or processing)
      const existing = await ctx.db
        .query("refreshQueue")
        .withIndex("by_table_primary_secondary", (q) =>
          q
            .eq("tableName", params.tableName)
            .eq("primaryKey", primaryKey)
            .eq("secondaryKey", secondaryKey),
        )
        .filter((q) =>
          q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "processing")),
        )
        .first();

      if (!existing) {
        // Generate display recordId for logging
        const recordId = secondaryKey ? `${primaryKey}:${secondaryKey}` : primaryKey;

        // Add to queue - cron job should pick it up.
        await ctx.db.insert("refreshQueue", {
          tableName: params.tableName,
          primaryKey,
          secondaryKey,
          recordId,
          priority,
          lastFetched: params.lastFetched,
          status: "pending",
          createdAt: now,
        });
      }
    }
  },
});

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Clean up old queue items - called by cron job daily
 * Exported as internalMutation for cron jobs to call
 */
export const cleanupQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldItems = await ctx.db
      .query("refreshQueue")
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "completed"), q.eq(q.field("status"), "failed")),
          q.lt(q.field("processedAt"), sevenDaysAgo),
        ),
      )
      .collect();

    for (const item of oldItems) {
      await ctx.db.delete(item._id);
    }

    const deletedCount = oldItems.length;

    if (deletedCount > 0) {
      console.log(`[catalog] Cleaned up ${deletedCount} old queue items`);
    }

    return { deletedCount };
  },
});

// ============================================================================
// DATABASE UPDATE MUTATIONS (Called by processQueue action)
// ============================================================================

/**
 * Upsert part data into database
 */
export const upsertPart = internalMutation({
  args: {
    data: v.object({
      no: v.string(),
      name: v.string(),
      type: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")),
      categoryId: v.optional(v.number()),
      alternateNo: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      weight: v.optional(v.number()),
      dimX: v.optional(v.string()),
      dimY: v.optional(v.string()),
      dimZ: v.optional(v.string()),
      yearReleased: v.optional(v.number()),
      description: v.optional(v.string()),
      isObsolete: v.optional(v.boolean()),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Check if part already exists
    const existing = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.data.no))
      .first();

    if (existing) {
      // Update existing part (preserve original createdAt)
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      // Insert new part
      await ctx.db.insert("parts", args.data);
    }
  },
});

/**
 * Upsert part colors into database
 */
export const upsertPartColors = internalMutation({
  args: {
    data: v.array(
      v.object({
        partNo: v.string(),
        colorId: v.number(),
        quantity: v.number(),
        lastFetched: v.number(),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const partColor of args.data) {
      // Check if this part-color combination exists
      const existing = await ctx.db
        .query("partColors")
        .withIndex("by_partNo_colorId", (q) =>
          q.eq("partNo", partColor.partNo).eq("colorId", partColor.colorId),
        )
        .first();

      if (existing) {
        // Update existing (preserve original createdAt)
        const { createdAt: _unused, ...updateData } = partColor;
        await ctx.db.patch(existing._id, updateData);
      } else {
        // Insert new
        await ctx.db.insert("partColors", partColor);
      }
    }
  },
});

/**
 * Upsert color data into database
 */
export const upsertColor = internalMutation({
  args: {
    data: v.object({
      colorId: v.number(),
      colorName: v.string(),
      colorCode: v.optional(v.string()),
      colorType: v.optional(v.string()),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("colors")
      .withIndex("by_colorId", (q) => q.eq("colorId", args.data.colorId))
      .first();

    if (existing) {
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("colors", args.data);
    }
  },
});

/**
 * Upsert category data into database
 */
export const upsertCategory = internalMutation({
  args: {
    data: v.object({
      categoryId: v.number(),
      categoryName: v.string(),
      parentId: v.optional(v.number()),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.data.categoryId))
      .first();

    if (existing) {
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("categories", args.data);
    }
  },
});

/**
 * Upsert price guide data into database
 */
export const upsertPriceGuide = internalMutation({
  args: {
    data: v.object({
      partNo: v.string(),
      partType: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")),
      colorId: v.number(),
      newOrUsed: v.union(v.literal("N"), v.literal("U")),
      currencyCode: v.string(),
      minPrice: v.optional(v.number()),
      maxPrice: v.optional(v.number()),
      avgPrice: v.optional(v.number()),
      qtyAvgPrice: v.optional(v.number()),
      unitQuantity: v.optional(v.number()),
      totalQuantity: v.optional(v.number()),
      guideType: v.union(v.literal("sold"), v.literal("stock")),
      lastFetched: v.number(),
      createdAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    // Find existing price record matching part, color, newOrUsed, and guideType
    const existing = await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.data.partNo).eq("colorId", args.data.colorId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("newOrUsed"), args.data.newOrUsed),
          q.eq(q.field("guideType"), args.data.guideType),
        ),
      )
      .first();

    if (existing) {
      const { createdAt: _unused, ...updateData } = args.data;
      await ctx.db.patch(existing._id, updateData);
    } else {
      await ctx.db.insert("partPrices", args.data);
    }
  },
});

// ============================================================================
// HELPER MUTATIONS (Called by processQueue action)
// ============================================================================

/**
 * Get next batch of items to process from queue
 * Exported as internalQuery for processQueue to call
 */
export const getBatch = internalQuery({
  args: { batchSize: v.number() },
  handler: async (ctx, args): Promise<Doc<"refreshQueue">[]> => {
    const items = await ctx.db
      .query("refreshQueue")
      .withIndex("by_status_priority", (q) => q.eq("status", "pending"))
      .order("asc") // Processes by priority (1, 2, 3)
      .take(args.batchSize);

    return items;
  },
});

/**
 * Mark queue item as processing
 * Exported as internalMutation for processQueue to call
 */
export const updateStatusProcessing = internalMutation({
  args: { queueId: v.id("refreshQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.queueId, {
      status: "processing",
    });
  },
});

/**
 * Mark queue item as completed
 * Exported as internalMutation for processQueue to call
 */
export const updateStatusCompleted = internalMutation({
  args: { queueId: v.id("refreshQueue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.queueId, {
      status: "completed",
      processedAt: Date.now(),
    });
  },
});

/**
 * Mark queue item as failed
 * Exported as internalMutation for processQueue to call
 */
export const updateStatusFailed = internalMutation({
  args: { queueId: v.id("refreshQueue"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.queueId, {
      status: "failed",
      errorMessage: args.errorMessage,
      processedAt: Date.now(),
    });
  },
});

// ============================================================================
// QUEUE PROCESSOR (Main orchestration)
// ============================================================================

/**
 * Process refresh queue - fetches data from Bricklink with rate limiting
 * Called by cron job every 5 minutes
 * Processes up to 10 items per run (120 API calls/hour max)
 * Exported as internalAction for cron jobs to call
 */
export const processQueue = internalAction({
  args: {},
  returns: v.union(
    v.object({
      processed: v.number(),
      successful: v.number(),
      failed: v.number(),
    }),
    v.object({
      processed: v.number(),
      message: v.string(),
    }),
  ),
  handler: async (ctx) => {
    // Get next batch from queue - type is inferred from getBatch return type
    const batch: Doc<"refreshQueue">[] = await ctx.runQuery(
      internal.bricklink.dataRefresher.getBatch,
      {
        batchSize: BATCH_SIZE,
      },
    );

    if (batch.length === 0) {
      return { processed: 0, message: "Queue empty" };
    }

    console.log(`[catalog] Processing ${batch.length} items from refresh queue`);

    let successCount = 0;
    let failCount = 0;

    for (const item of batch) {
      try {
        // Mark as processing
        await ctx.runMutation(internal.bricklink.dataRefresher.updateStatusProcessing, {
          queueId: item._id,
        });

        // Fetch from Bricklink and update database based on table type
        if (item.tableName === "parts") {
          // primaryKey = partNo
          const partData = await catalogClient.getRefreshedPart(item.primaryKey);
          await ctx.runMutation(internal.bricklink.dataRefresher.upsertPart, { data: partData });
        } else if (item.tableName === "partColors") {
          // primaryKey = partNo
          const partColorsData = await catalogClient.getRefreshedPartColors(item.primaryKey);
          await ctx.runMutation(internal.bricklink.dataRefresher.upsertPartColors, {
            data: partColorsData,
          });
        } else if (item.tableName === "colors") {
          // primaryKey = colorId
          const colorData = await catalogClient.getRefreshedColor(parseInt(item.primaryKey));
          await ctx.runMutation(internal.bricklink.dataRefresher.upsertColor, { data: colorData });
        } else if (item.tableName === "categories") {
          // primaryKey = categoryId
          const categoryData = await catalogClient.getRefreshedCategory(parseInt(item.primaryKey));
          await ctx.runMutation(internal.bricklink.dataRefresher.upsertCategory, {
            data: categoryData,
          });
        } else if (item.tableName === "partPrices") {
          // primaryKey = partNo, secondaryKey = colorId
          // Note: This fetches all 4 variants (N/U × sold/stock)
          const priceGuides = await catalogClient.getRefreshedPriceGuide(
            item.primaryKey,
            parseInt(item.secondaryKey!),
          );

          // Upsert all 4 price guide variants
          await Promise.all([
            ctx.runMutation(internal.bricklink.dataRefresher.upsertPriceGuide, {
              data: priceGuides.usedStock,
            }),
            ctx.runMutation(internal.bricklink.dataRefresher.upsertPriceGuide, {
              data: priceGuides.newStock,
            }),
            ctx.runMutation(internal.bricklink.dataRefresher.upsertPriceGuide, {
              data: priceGuides.usedSold,
            }),
            ctx.runMutation(internal.bricklink.dataRefresher.upsertPriceGuide, {
              data: priceGuides.newSold,
            }),
          ]);
        }

        // Mark as completed
        await ctx.runMutation(internal.bricklink.dataRefresher.updateStatusCompleted, {
          queueId: item._id,
        });

        successCount++;

        recordMetric("catalog.queue.item.success", {
          tableName: item.tableName,
          recordId: item.recordId,
        });
      } catch (error) {
        failCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        await ctx.runMutation(internal.bricklink.dataRefresher.updateStatusFailed, {
          queueId: item._id,
          errorMessage: errorMsg,
        });

        recordMetric("catalog.queue.item.failed", {
          tableName: item.tableName,
          recordId: item.recordId,
          error: errorMsg,
        });
      }
    }

    console.log(`[catalog] Queue processed: ${successCount} success, ${failCount} failed`);

    return {
      processed: batch.length,
      successful: successCount,
      failed: failCount,
    };
  },
});
