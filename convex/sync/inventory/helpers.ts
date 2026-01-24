import type { DatabaseReader, DatabaseWriter } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MarketplaceProvider, SyncStatus, LegacyMarketplaceSync } from "../validators";

/**
 * Sync State Helper Functions
 *
 * These functions provide a clean interface for reading and writing
 * to the inventorySyncState table. They replace direct access to the
 * embedded marketplaceSync field on inventoryItems.
 */

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get sync state for a specific item and provider
 */
export async function getSyncStateForItem(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
): Promise<Doc<"inventorySyncState"> | null> {
  return await db
    .query("inventorySyncState")
    .withIndex("by_item_provider", (q) => q.eq("itemId", itemId).eq("provider", provider))
    .first();
}

/**
 * Get all sync states for an item (both providers)
 */
export async function getSyncStatesForItem(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<Doc<"inventorySyncState">[]> {
  return await db
    .query("inventorySyncState")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
}

/**
 * Get the lastSyncedSeq for a provider (defaults to 0 if not synced)
 */
export async function getLastSyncedSeq(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
): Promise<number> {
  const syncState = await getSyncStateForItem(db, itemId, provider);
  return syncState?.lastSyncedSeq ?? 0;
}

/**
 * Get the lot ID for a provider
 */
export async function getLotId(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
): Promise<string | number | undefined> {
  const syncState = await getSyncStateForItem(db, itemId, provider);
  return syncState?.lotId;
}

/**
 * Get lastSyncedAvailable for a provider (defaults to 0)
 */
export async function getLastSyncedAvailable(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
): Promise<number> {
  const syncState = await getSyncStateForItem(db, itemId, provider);
  return syncState?.lastSyncedAvailable ?? 0;
}

/**
 * Transform inventorySyncState records to legacy marketplaceSync format
 * Used for API compatibility during migration
 */
export async function buildLegacyMarketplaceSync(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<LegacyMarketplaceSync> {
  const syncStates = await getSyncStatesForItem(db, itemId);

  const result: NonNullable<LegacyMarketplaceSync> = {};

  for (const state of syncStates) {
    if (state.provider === "bricklink") {
      result.bricklink = {
        lotId: typeof state.lotId === "number" ? state.lotId : undefined,
        status: state.status,
        lastSyncAttempt: state.lastSyncAttempt,
        error: state.error,
        lastSyncedSeq: state.lastSyncedSeq,
        lastSyncedAvailable: state.lastSyncedAvailable,
      };
    } else if (state.provider === "brickowl") {
      result.brickowl = {
        lotId: typeof state.lotId === "string" ? state.lotId : undefined,
        status: state.status,
        lastSyncAttempt: state.lastSyncAttempt,
        error: state.error,
        lastSyncedSeq: state.lastSyncedSeq,
        lastSyncedAvailable: state.lastSyncedAvailable,
      };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create sync state for an item and provider
 */
export async function createSyncState(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
  data: {
    lotId?: string | number;
    status: SyncStatus;
    lastSyncAttempt?: number;
    lastSyncedSeq?: number;
    lastSyncedAvailable?: number;
    error?: string;
  },
): Promise<Id<"inventorySyncState">> {
  return await db.insert("inventorySyncState", {
    itemId,
    provider,
    lotId: data.lotId,
    status: data.status,
    lastSyncAttempt: data.lastSyncAttempt,
    lastSyncedSeq: data.lastSyncedSeq,
    lastSyncedAvailable: data.lastSyncedAvailable,
    error: data.error,
  });
}

/**
 * Update sync state for an item and provider
 */
export async function updateSyncState(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
  updates: {
    lotId?: string | number;
    status?: SyncStatus;
    lastSyncAttempt?: number;
    lastSyncedSeq?: number;
    lastSyncedAvailable?: number;
    error?: string;
  },
): Promise<void> {
  const existing = await db
    .query("inventorySyncState")
    .withIndex("by_item_provider", (q) => q.eq("itemId", itemId).eq("provider", provider))
    .first();

  if (!existing) {
    throw new Error(`No sync state found for item ${itemId} and provider ${provider}`);
  }

  await db.patch(existing._id, updates);
}

/**
 * Get or create sync state for an item and provider (upsert pattern)
 */
export async function getOrCreateSyncState(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
  defaultData: {
    status: SyncStatus;
    lastSyncAttempt?: number;
  },
): Promise<Doc<"inventorySyncState">> {
  const existing = await db
    .query("inventorySyncState")
    .withIndex("by_item_provider", (q) => q.eq("itemId", itemId).eq("provider", provider))
    .first();

  if (existing) {
    return existing;
  }

  const id = await db.insert("inventorySyncState", {
    itemId,
    provider,
    status: defaultData.status,
    lastSyncAttempt: defaultData.lastSyncAttempt,
  });

  const created = await db.get(id);
  if (!created) {
    throw new Error("Failed to create sync state");
  }

  return created;
}

/**
 * Update or create sync state for an item and provider
 * Combines existing data with updates
 */
export async function upsertSyncState(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
  provider: MarketplaceProvider,
  data: {
    lotId?: string | number;
    status: SyncStatus;
    lastSyncAttempt?: number;
    lastSyncedSeq?: number;
    lastSyncedAvailable?: number;
    error?: string;
  },
): Promise<Id<"inventorySyncState">> {
  const existing = await db
    .query("inventorySyncState")
    .withIndex("by_item_provider", (q) => q.eq("itemId", itemId).eq("provider", provider))
    .first();

  if (existing) {
    await db.patch(existing._id, {
      ...(data.lotId !== undefined && { lotId: data.lotId }),
      status: data.status,
      ...(data.lastSyncAttempt !== undefined && { lastSyncAttempt: data.lastSyncAttempt }),
      ...(data.lastSyncedSeq !== undefined && { lastSyncedSeq: data.lastSyncedSeq }),
      ...(data.lastSyncedAvailable !== undefined && {
        lastSyncedAvailable: data.lastSyncedAvailable,
      }),
      ...(data.error !== undefined && { error: data.error }),
    });
    return existing._id;
  }

  return await db.insert("inventorySyncState", {
    itemId,
    provider,
    lotId: data.lotId,
    status: data.status,
    lastSyncAttempt: data.lastSyncAttempt,
    lastSyncedSeq: data.lastSyncedSeq,
    lastSyncedAvailable: data.lastSyncedAvailable,
    error: data.error,
  });
}

/**
 * Delete all sync states for an item
 * Used when deleting an inventory item
 */
export async function deleteSyncStatesForItem(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
): Promise<number> {
  const syncStates = await db
    .query("inventorySyncState")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();

  for (const state of syncStates) {
    await db.delete(state._id);
  }

  return syncStates.length;
}

/**
 * Update sync status for multiple providers at once
 * Used after sync attempts to update status based on results
 */
export async function updateSyncStatuses(
  db: DatabaseWriter,
  itemId: Id<"inventoryItems">,
  results: Array<{
    provider: MarketplaceProvider;
    success: boolean;
    error?: string;
    marketplaceId?: string | number;
    lastSyncedSeq?: number;
    lastSyncedAvailable?: number;
  }>,
): Promise<void> {
  for (const result of results) {
    const existing = await db
      .query("inventorySyncState")
      .withIndex("by_item_provider", (q) => q.eq("itemId", itemId).eq("provider", result.provider))
      .first();

    const updates = {
      status: (result.success ? "synced" : "failed") as SyncStatus,
      lastSyncAttempt: Date.now(),
      ...(result.success && result.marketplaceId !== undefined && { lotId: result.marketplaceId }),
      ...(result.error && { error: result.error }),
      ...(result.success && result.lastSyncedSeq !== undefined && {
        lastSyncedSeq: result.lastSyncedSeq,
      }),
      ...(result.success && result.lastSyncedAvailable !== undefined && {
        lastSyncedAvailable: result.lastSyncedAvailable,
      }),
    };

    if (existing) {
      await db.patch(existing._id, updates);
    } else {
      await db.insert("inventorySyncState", {
        itemId,
        provider: result.provider,
        ...updates,
      });
    }
  }
}
