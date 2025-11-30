import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get outbox message for a specific resource
 * Used by actions to check if refresh is already queued
 */
export const getOutboxMessage = internalQuery({
  args: {
    tableName: v.union(
      v.literal("parts"),
      v.literal("partColors"),
      v.literal("partPrices"),
      v.literal("colors"),
      v.literal("categories"),
    ),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q
          .eq("tableName", args.tableName)
          .eq("primaryKey", args.primaryKey)
          .eq("secondaryKey", args.secondaryKey),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();
  },
});

/**
 * Get outbox message by ID
 * Used to fetch a specific message for immediate processing
 */
export const getOutboxMessageById = internalQuery({
  args: {
    messageId: v.id("catalogRefreshOutbox"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Mark outbox message as permanently failed (non-retriable error or max attempts exceeded)
 */
export const markOutboxPermanentlyFailed = internalMutation({
  args: {
    messageId: v.id("catalogRefreshOutbox"),
    failureReason: v.string(),
    failureCode: v.string(),
    lastError: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "failed",
      failureReason: args.failureReason,
      failureCode: args.failureCode,
      lastError: args.lastError,
      processedAt: Date.now(),
    });
  },
});

/**
 * Enqueue a catalog refresh request to the outbox
 * Idempotent - won't create duplicate if already pending/inflight
 * Returns the message ID if created, or undefined if duplicate found
 */
export const enqueueCatalogRefresh = internalMutation({
  args: {
    tableName: v.union(
      v.literal("parts"),
      v.literal("partColors"),
      v.literal("partPrices"),
      v.literal("colors"),
      v.literal("categories"),
    ),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
    lastFetched: v.optional(v.number()),
    priority: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"catalogRefreshOutbox"> | undefined> => {
    // Check if already queued (pending or inflight)
    const existing = await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q
          .eq("tableName", args.tableName)
          .eq("primaryKey", args.primaryKey)
          .eq("secondaryKey", args.secondaryKey),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();

    if (existing) {
      // Already queued, skip
      return undefined;
    }

    // Generate display recordId
    const recordId = args.secondaryKey
      ? `${args.primaryKey}:${args.secondaryKey}`
      : args.primaryKey;

    // Insert to outbox and return ID
    const messageId = await ctx.db.insert("catalogRefreshOutbox", {
      tableName: args.tableName,
      primaryKey: args.primaryKey,
      secondaryKey: args.secondaryKey,
      recordId,
      priority: args.priority,
      lastFetched: args.lastFetched,
      status: "pending",
      attempt: 0,
      nextAttemptAt: Date.now(), // Immediate processing
    });

    return messageId;
  },
});
