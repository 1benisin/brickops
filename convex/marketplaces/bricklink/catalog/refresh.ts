/**
 * Universal Refresh Manager for Bricklink Data
 *
 * Consolidated refresh orchestration system that handles:
 * - Queue management (add, process, cleanup)
 * - Freshness detection and staleness checking
 * - Rate-limited batch processing
 * - Bricklink API integration
 */

import { internalMutation } from "../../../_generated/server";
import type { MutationCtx } from "../../../_generated/server";
import type { Doc } from "../../../_generated/dataModel";
import { v } from "convex/values";

const DAY_MS = 24 * 60 * 60 * 1000;

export const THIRTY_DAYS_MS = 30 * DAY_MS;

interface CatalogRefreshIndexRange {
  eq(field: "tableName", value: string): CatalogRefreshIndexRange;
  eq(field: "primaryKey", value: string): CatalogRefreshIndexRange;
  eq(field: "secondaryKey", value: string | undefined): CatalogRefreshIndexRange;
}

interface CatalogRefreshFilterBuilder {
  field(name: "status"): unknown;
  eq(lhs: unknown, rhs: unknown): unknown;
  or(...conditions: unknown[]): unknown;
}

type CatalogRefreshQuery = {
  withIndex(
    index: "by_table_primary_secondary",
    builder: (range: CatalogRefreshIndexRange) => CatalogRefreshIndexRange,
  ): {
    filter(predicate: (builder: CatalogRefreshFilterBuilder) => unknown): {
      first(): Promise<Doc | null>;
    };
  };
};

export function isStale(lastFetched: number | undefined, maxAgeMs = THIRTY_DAYS_MS): boolean {
  if (!lastFetched) return true;
  return Date.now() - lastFetched > maxAgeMs;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Refresh priorities (lower number = higher priority)
export const REFRESH_PRIORITY = {
  HIGH: 1, // Parts (user is viewing)
  MEDIUM: 2, // Colors, categories
  LOW: 3, // Prices, bulk updates
} as const;

// NOTE: BATCH_SIZE moved to catalog/refreshWorker.ts

// ============================================================================
// FRESHNESS UTILITIES
// ============================================================================

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
  handler: async (ctx: MutationCtx, params) => {
    const thresholdDays = params.freshnessThresholdDays ?? 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // If no lastFetched or older than threshold, it's stale
    const stale = isStale(params.lastFetched, thresholdMs);

    if (stale) {
      // Normalize keys to strings
      const primaryKey = String(params.primaryKey);
      const secondaryKey = params.secondaryKey ? String(params.secondaryKey) : undefined;

      // Determine priority: use explicit if provided, otherwise auto-determine
      const priority =
        params.priority ??
        (params.tableName === "categories" ? REFRESH_PRIORITY.LOW : REFRESH_PRIORITY.MEDIUM);

      // Check if already queued (pending or inflight)
      const refreshOutboxQuery = ctx.db.query(
        "catalogRefreshOutbox",
      ) as unknown as CatalogRefreshQuery;

      const existing = await refreshOutboxQuery
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
  handler: async (ctx: MutationCtx) => {
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
// NOTE: Queue processing moved to catalog/refreshWorker.ts
// This file now only contains helper functions for enqueuing and cleanup
