import { v } from "convex/values";
import type { Infer } from "convex/values";

// ============================================================================
// SHARED VALIDATORS
// ============================================================================

export const marketplaceProvider = v.union(v.literal("bricklink"), v.literal("brickowl"));

export const syncStatus = v.union(
  v.literal("pending"),
  v.literal("syncing"),
  v.literal("synced"),
  v.literal("failed"),
  v.literal("disabled"),
);

export const outboxStatus = v.union(
  v.literal("pending"),
  v.literal("inflight"),
  v.literal("succeeded"),
  v.literal("failed"),
);

export const outboxKind = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
);

// ============================================================================
// INVENTORY SYNC STATE VALIDATORS
// ============================================================================

/**
 * Validator for inventorySyncState table document
 */
export const inventorySyncStateDoc = v.object({
  _id: v.id("inventorySyncState"),
  _creationTime: v.number(),
  itemId: v.id("inventoryItems"),
  provider: marketplaceProvider,
  lotId: v.optional(v.union(v.string(), v.number())),
  status: syncStatus,
  lastSyncAttempt: v.optional(v.number()),
  lastSyncedSeq: v.optional(v.number()),
  lastSyncedAvailable: v.optional(v.number()),
  error: v.optional(v.string()),
});

/**
 * Validator for creating/updating sync state (without system fields)
 */
export const inventorySyncStateData = v.object({
  itemId: v.id("inventoryItems"),
  provider: marketplaceProvider,
  lotId: v.optional(v.union(v.string(), v.number())),
  status: syncStatus,
  lastSyncAttempt: v.optional(v.number()),
  lastSyncedSeq: v.optional(v.number()),
  lastSyncedAvailable: v.optional(v.number()),
  error: v.optional(v.string()),
});

/**
 * Validator for partial updates to sync state
 */
export const inventorySyncStateUpdate = v.object({
  lotId: v.optional(v.union(v.string(), v.number())),
  status: v.optional(syncStatus),
  lastSyncAttempt: v.optional(v.number()),
  lastSyncedSeq: v.optional(v.number()),
  lastSyncedAvailable: v.optional(v.number()),
  error: v.optional(v.string()),
});

// ============================================================================
// MARKETPLACE OUTBOX VALIDATORS
// ============================================================================

/**
 * Validator for marketplaceOutbox table document
 */
export const marketplaceOutboxDoc = v.object({
  _id: v.id("marketplaceOutbox"),
  _creationTime: v.number(),
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  provider: marketplaceProvider,
  kind: outboxKind,
  fromSeqExclusive: v.number(),
  toSeqInclusive: v.number(),
  idempotencyKey: v.string(),
  status: outboxStatus,
  attempt: v.number(),
  nextAttemptAt: v.number(),
  lastError: v.optional(v.string()),
  correlationId: v.optional(v.string()),
});

/**
 * Validator for creating outbox entries (without system fields)
 */
export const marketplaceOutboxData = v.object({
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  provider: marketplaceProvider,
  kind: outboxKind,
  fromSeqExclusive: v.number(),
  toSeqInclusive: v.number(),
  idempotencyKey: v.string(),
  status: outboxStatus,
  attempt: v.number(),
  nextAttemptAt: v.number(),
  lastError: v.optional(v.string()),
  correlationId: v.optional(v.string()),
});

// ============================================================================
// LEGACY COMPATIBILITY - marketplaceSync shape for API responses
// ============================================================================

/**
 * Legacy shape for API responses that expect the embedded marketplaceSync format.
 * Used to transform inventorySyncState records back to the expected shape.
 */
export const legacyMarketplaceSync = v.optional(
  v.object({
    bricklink: v.optional(
      v.object({
        lotId: v.optional(v.number()),
        status: syncStatus,
        lastSyncAttempt: v.optional(v.number()),
        error: v.optional(v.string()),
        lastSyncedSeq: v.optional(v.number()),
        lastSyncedAvailable: v.optional(v.number()),
      }),
    ),
    brickowl: v.optional(
      v.object({
        lotId: v.optional(v.string()),
        status: syncStatus,
        lastSyncAttempt: v.optional(v.number()),
        error: v.optional(v.string()),
        lastSyncedSeq: v.optional(v.number()),
        lastSyncedAvailable: v.optional(v.number()),
      }),
    ),
  }),
);

// ============================================================================
// TYPESCRIPT TYPE EXPORTS
// ============================================================================

export type MarketplaceProvider = Infer<typeof marketplaceProvider>;
export type SyncStatus = Infer<typeof syncStatus>;
export type OutboxStatus = Infer<typeof outboxStatus>;
export type OutboxKind = Infer<typeof outboxKind>;

export type InventorySyncStateDoc = Infer<typeof inventorySyncStateDoc>;
export type InventorySyncStateData = Infer<typeof inventorySyncStateData>;
export type InventorySyncStateUpdate = Infer<typeof inventorySyncStateUpdate>;

export type MarketplaceOutboxDoc = Infer<typeof marketplaceOutboxDoc>;
export type MarketplaceOutboxData = Infer<typeof marketplaceOutboxData>;

export type LegacyMarketplaceSync = Infer<typeof legacyMarketplaceSync>;
