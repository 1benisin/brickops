import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sync Module Schema
 *
 * This module owns all marketplace synchronization state and orchestration.
 * It coordinates between core inventory and external marketplace APIs.
 *
 * Tables:
 * - inventorySyncState: Per-item, per-provider sync status tracking
 * - marketplaceOutbox: Transactional outbox for marketplace sync operations
 */

export const syncTables = {
  /**
   * Tracks marketplace sync state for each inventory item per provider.
   * Replaces the embedded marketplaceSync field on inventoryItems.
   *
   * One row per (itemId, provider) pair.
   */
  inventorySyncState: defineTable({
    itemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),

    // Marketplace identifier (lot ID)
    // BrickLink uses numeric IDs, BrickOwl uses string IDs
    lotId: v.optional(v.union(v.string(), v.number())),

    // Sync status
    status: v.union(
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("failed"),
      v.literal("disabled"),
    ),

    // Timing
    lastSyncAttempt: v.optional(v.number()),

    // Cursor tracking for retry logic (Phase 2)
    lastSyncedSeq: v.optional(v.number()), // Last ledger sequence applied to marketplace
    lastSyncedAvailable: v.optional(v.number()), // Denormalized available quantity at last sync

    // Error tracking
    error: v.optional(v.string()),
  })
    .index("by_item", ["itemId"])
    .index("by_item_provider", ["itemId", "provider"])
    .index("by_status", ["status"])
    .index("by_provider_status", ["provider", "status"]),

  /**
   * Transactional outbox for marketplace sync operations.
   * Moved from inventory/schema.ts to sync module.
   *
   * The worker drains this outbox and processes sync operations.
   */
  marketplaceOutbox: defineTable({
    businessAccountId: v.id("businessAccounts"),
    itemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    kind: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),

    // Delta window (what this sync covers)
    fromSeqExclusive: v.number(),
    toSeqInclusive: v.number(),

    // Idempotency
    idempotencyKey: v.string(),

    // Lifecycle
    status: v.union(
      v.literal("pending"),
      v.literal("inflight"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    attempt: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    // createdAt removed - using _creationTime
    correlationId: v.optional(v.string()),
  })
    .index("by_status_time", ["status", "nextAttemptAt"])
    .index("by_item_provider", ["itemId", "provider"]),
};
