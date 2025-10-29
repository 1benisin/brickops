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
import { v } from "convex/values";
import { catalogClient } from "./catalogClient";
import { internal } from "../_generated/api";
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

// NOTE: BATCH_SIZE moved to catalog/refreshWorker.ts

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

      // Check if already queued (pending or inflight)
      const existing = await ctx.db
        .query("catalogRefreshOutbox")
        .withIndex("by_table_primary_secondary", (q) =>
          q
            .eq("tableName", params.tableName)
            .eq("primaryKey", primaryKey)
            .eq("secondaryKey", secondaryKey),
        )
        .filter((q) =>
          q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")),
        )
        .first();

      if (!existing) {
        // Generate display recordId for logging
        const recordId = secondaryKey ? `${primaryKey}:${secondaryKey}` : primaryKey;

        // Add to outbox - worker will process it
        await ctx.db.insert("catalogRefreshOutbox", {
          tableName: params.tableName,
          primaryKey,
          secondaryKey,
          recordId,
          priority,
          lastFetched: params.lastFetched,
          status: "pending",
          attempt: 0,
          nextAttemptAt: now, // Immediate processing
          createdAt: now,
        });
      }
    }
  },
});

// ============================================================================
// OUTBOX MANAGEMENT (queue processing moved to catalog/refreshWorker.ts)
// ============================================================================

/**
 * Clean up old outbox items - called by cron job daily
 * Exported as internalMutation for cron jobs to call
 */
export const cleanupOutbox = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldItems = await ctx.db
      .query("catalogRefreshOutbox")
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "succeeded"), q.eq(q.field("status"), "failed")),
          q.lt(q.field("processedAt"), sevenDaysAgo),
        ),
      )
      .collect();

    for (const item of oldItems) {
      await ctx.db.delete(item._id);
    }

    const deletedCount = oldItems.length;

    if (deletedCount > 0) {
      console.log(`[catalog] Cleaned up ${deletedCount} old outbox items`);
    }

    return { deletedCount };
  },
});

// ============================================================================
// DATABASE UPDATE MUTATIONS (Called by processQueue action)
// ============================================================================

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

// NOTE: Queue processing moved to catalog/refreshWorker.ts
// This file now only contains helper functions for enqueuing and cleanup
