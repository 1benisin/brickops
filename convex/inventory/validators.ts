import { v } from "convex/values";
import type { Infer } from "convex/values";

// ============================================================================
// SHARED / REUSABLE VALIDATORS
// ============================================================================

export const businessAccountId = v.id("businessAccounts");
export const inventoryItemId = v.id("inventoryItems");
export const userId = v.id("users");

export const itemCondition = v.union(v.literal("new"), v.literal("used"));

export const actionType = v.union(v.literal("create"), v.literal("update"), v.literal("delete"));

// For sync queue (inventorySyncQueue table still uses changeType)
export const changeType = v.union(v.literal("create"), v.literal("update"), v.literal("delete"));

export const syncStatus = v.union(
  v.literal("pending"),
  v.literal("syncing"),
  v.literal("synced"),
  v.literal("failed"),
);

export const marketplaceProvider = v.union(v.literal("bricklink"), v.literal("brickowl"));

// Partial inventory item data for sync operations (represents Partial<Doc<"inventoryItems">>)
export const partialInventoryItemData = v.optional(
  v.object({
    _id: v.optional(inventoryItemId),
    _creationTime: v.optional(v.number()),
    businessAccountId: v.optional(businessAccountId),
    name: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    colorId: v.optional(v.string()),
    location: v.optional(v.string()),
    quantityAvailable: v.optional(v.number()),
    quantityReserved: v.optional(v.number()),
    condition: v.optional(itemCondition),
    price: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.optional(userId),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    fileId: v.optional(v.id("inventoryFiles")),
    marketplaceSync: v.optional(
      v.object({
        bricklink: v.optional(
          v.object({
            lotId: v.optional(v.number()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
        brickowl: v.optional(
          v.object({
            lotId: v.optional(v.string()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
      }),
    ),
  }),
);

// ============================================================================
// MUTATION ARGS
// ============================================================================

export const addInventoryItemArgs = v.object({
  name: v.string(),
  partNumber: v.string(),
  colorId: v.string(),
  location: v.string(),
  quantityAvailable: v.number(),
  quantityReserved: v.optional(v.number()),
  condition: itemCondition,
  price: v.optional(v.number()),
  notes: v.optional(v.string()),
  fileId: v.optional(v.id("inventoryFiles")), // AC: 3.5.3 - Associate items with files
  reason: v.optional(v.string()), // For history tracking
});

export const updateInventoryItemArgs = v.object({
  itemId: inventoryItemId,
  name: v.optional(v.string()),
  partNumber: v.optional(v.string()),
  colorId: v.optional(v.string()),
  location: v.optional(v.string()),
  condition: v.optional(itemCondition),
  quantityAvailable: v.optional(v.number()),
  quantityReserved: v.optional(v.number()),
  price: v.optional(v.number()),
  notes: v.optional(v.string()),
  reason: v.optional(v.string()),
});

export const deleteInventoryItemArgs = v.object({
  itemId: inventoryItemId,
  reason: v.optional(v.string()),
});

// AC: 3.5.5 - File association mutations
export const addItemToFileArgs = v.object({
  itemId: inventoryItemId,
  fileId: v.id("inventoryFiles"),
});

export const removeItemFromFileArgs = v.object({
  itemId: inventoryItemId,
});

// ============================================================================
// QUERY ARGS
// ============================================================================

export const listInventoryItemsArgs = v.object({});

export const listInventoryItemsByFileArgs = v.object({
  fileId: v.id("inventoryFiles"),
});

export const getInventoryTotalsArgs = v.object({});

export const getItemSyncStatusArgs = v.object({
  itemId: inventoryItemId,
});

export const getPendingChangesCountArgs = v.object({});

// New history-based queries (refactor requirement)
export const listInventoryHistoryArgs = v.object({
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
  // Filters
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  action: v.optional(actionType),
  userId: v.optional(userId),
  itemId: v.optional(inventoryItemId),
  source: v.optional(v.string()),
  query: v.optional(v.string()),
});

export const getInventoryHistoryArgs = v.object({
  historyId: v.id("inventoryHistory"),
});

// ============================================================================
// INTERNAL QUERY/MUTATION ARGS
// ============================================================================

export const getPendingChangesArgs = v.object({
  businessAccountId,
  limit: v.optional(v.number()),
});

export const getChangeArgs = v.object({
  changeId: v.id("inventorySyncQueue"),
});

export const getInventoryItemArgs = v.object({
  itemId: inventoryItemId,
});

export const markSyncingArgs = v.object({
  changeId: v.id("inventorySyncQueue"),
});

export const updateSyncStatusArgs = v.object({
  changeId: v.id("inventorySyncQueue"),
  provider: marketplaceProvider,
  success: v.boolean(),
  marketplaceId: v.optional(v.union(v.number(), v.string())),
  error: v.optional(v.string()),
});

export const recordSyncErrorArgs = v.object({
  changeId: v.id("inventorySyncQueue"),
  provider: marketplaceProvider,
  error: v.string(),
});

// ============================================================================
// RETURN TYPE VALIDATORS
// ============================================================================

// Mutations
export const addInventoryItemReturns = inventoryItemId;

export const updateInventoryItemReturns = v.object({
  itemId: inventoryItemId,
});

export const deleteInventoryItemReturns = v.object({
  itemId: inventoryItemId,
  archived: v.boolean(),
});

// AC: 3.5.5 - File association mutation returns
export const addItemToFileReturns = v.null();

export const removeItemFromFileReturns = v.null();

// Queries
export const listInventoryItemsReturns = v.array(
  v.object({
    _id: inventoryItemId,
    _creationTime: v.number(),
    businessAccountId,
    name: v.string(),
    partNumber: v.string(),
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    quantityReserved: v.optional(v.number()),
    condition: itemCondition,
    price: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: userId,
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    isArchived: v.optional(v.boolean()), // Matches schema - optional field
    deletedAt: v.optional(v.number()),
    // Story 3.5 - Inventory Files fields
    fileId: v.optional(v.id("inventoryFiles")),
    marketplaceSync: v.optional(
      v.object({
        bricklink: v.optional(
          v.object({
            lotId: v.optional(v.number()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
        brickowl: v.optional(
          v.object({
            lotId: v.optional(v.string()),
            status: v.union(
              v.literal("pending"),
              v.literal("syncing"),
              v.literal("synced"),
              v.literal("failed"),
            ),
            lastSyncAttempt: v.number(),
            error: v.optional(v.string()),
          }),
        ),
      }),
    ),
  }),
);

export const listInventoryItemsByFileReturns = listInventoryItemsReturns;

export const getInventoryTotalsReturns = v.object({
  counts: v.object({
    items: v.number(),
  }),
  totals: v.object({
    available: v.number(),
    reserved: v.number(),
  }),
});

export const getItemSyncStatusReturns = v.object({
  itemId: inventoryItemId,
  marketplaceSync: v.optional(
    v.object({
      bricklink: v.optional(
        v.object({
          lotId: v.optional(v.number()),
          status: v.union(
            v.literal("pending"),
            v.literal("syncing"),
            v.literal("synced"),
            v.literal("failed"),
          ),
          lastSyncAttempt: v.number(),
          error: v.optional(v.string()),
        }),
      ),
      brickowl: v.optional(
        v.object({
          lotId: v.optional(v.string()),
          status: v.union(
            v.literal("pending"),
            v.literal("syncing"),
            v.literal("synced"),
            v.literal("failed"),
          ),
          lastSyncAttempt: v.number(),
          error: v.optional(v.string()),
        }),
      ),
    }),
  ),
  pendingChangesCount: v.number(),
});

export const getPendingChangesCountReturns = v.object({
  count: v.number(),
});

// New history-based query returns
export const inventoryHistoryEntry = v.object({
  _id: v.id("inventoryHistory"),
  _creationTime: v.number(),
  businessAccountId,
  itemId: inventoryItemId,
  timestamp: v.number(),
  userId: v.optional(userId),
  action: actionType,
  oldData: partialInventoryItemData,
  newData: partialInventoryItemData,
  source: v.string(),
  reason: v.optional(v.string()),
  relatedTransactionId: v.optional(v.string()),
  // Actor details for UI (computed)
  actorFirstName: v.optional(v.string()),
  actorLastName: v.optional(v.string()),
});

export const listInventoryHistoryReturns = v.object({
  entries: v.array(inventoryHistoryEntry),
  nextCursor: v.optional(v.string()),
});

export const getInventoryHistoryReturns = inventoryHistoryEntry;

// Internal query returns
export const getPendingChangesReturns = v.array(
  v.object({
    _id: v.id("inventorySyncQueue"),
    _creationTime: v.number(),
    businessAccountId,
    inventoryItemId,
    changeType,
    previousData: partialInventoryItemData,
    newData: partialInventoryItemData,
    reason: v.optional(v.string()),
    syncStatus,
    correlationId: v.string(),
    bricklinkSyncedAt: v.optional(v.number()),
    brickowlSyncedAt: v.optional(v.number()),
    createdBy: userId,
    createdAt: v.number(),
  }),
);

export const getChangeReturns = v.object({
  _id: v.id("inventorySyncQueue"),
  _creationTime: v.number(),
  businessAccountId,
  inventoryItemId,
  changeType,
  previousData: partialInventoryItemData,
  newData: partialInventoryItemData,
  reason: v.optional(v.string()),
  syncStatus,
  correlationId: v.string(),
  bricklinkSyncedAt: v.optional(v.number()),
  brickowlSyncedAt: v.optional(v.number()),
  createdBy: userId,
  createdAt: v.number(),
});

export const getInventoryItemReturns = v.object({
  _id: inventoryItemId,
  _creationTime: v.number(),
  businessAccountId,
  name: v.string(),
  partNumber: v.string(),
  colorId: v.string(),
  location: v.string(),
  quantityAvailable: v.number(),
  quantityReserved: v.optional(v.number()),
  condition: itemCondition,
  price: v.optional(v.number()),
  notes: v.optional(v.string()),
  createdBy: userId,
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  isArchived: v.optional(v.boolean()), // Matches schema - optional field
  deletedAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  marketplaceSync: v.optional(
    v.object({
      bricklink: v.optional(
        v.object({
          lotId: v.optional(v.number()),
          status: v.union(
            v.literal("pending"),
            v.literal("syncing"),
            v.literal("synced"),
            v.literal("failed"),
          ),
          lastSyncAttempt: v.number(),
          error: v.optional(v.string()),
        }),
      ),
      brickowl: v.optional(
        v.object({
          lotId: v.optional(v.string()),
          status: v.union(
            v.literal("pending"),
            v.literal("syncing"),
            v.literal("synced"),
            v.literal("failed"),
          ),
          lastSyncAttempt: v.number(),
          error: v.optional(v.string()),
        }),
      ),
    }),
  ),
});

// Internal mutations return void (null)
export const markSyncingReturns = v.null();
export const updateSyncStatusReturns = v.null();
export const recordSyncErrorReturns = v.null();

// Internal query return types
export const getBusinessAccountsWithPendingChangesReturns = v.array(v.id("businessAccounts"));

// Internal actions return types
export const processAllPendingChangesReturns = v.object({
  accountsProcessed: v.number(),
  totalProcessed: v.number(),
  totalSucceeded: v.number(),
  totalFailed: v.number(),
  durationMs: v.number(),
});

export const processPendingChangesReturns = v.object({
  processed: v.number(),
  succeeded: v.number(),
  failed: v.number(),
  durationMs: v.optional(v.number()),
  reason: v.optional(v.string()),
});

// ============================================================================
// TYPESCRIPT TYPE EXPORTS (for convenience)
// ============================================================================

export type AddInventoryItemArgs = Infer<typeof addInventoryItemArgs>;
export type UpdateInventoryItemArgs = Infer<typeof updateInventoryItemArgs>;
export type DeleteInventoryItemArgs = Infer<typeof deleteInventoryItemArgs>;
export type ListInventoryItemsArgs = Infer<typeof listInventoryItemsArgs>;
export type GetInventoryTotalsArgs = Infer<typeof getInventoryTotalsArgs>;

// Partial inventory item data type (equivalent to Partial<Doc<"inventoryItems">>)
export type PartialInventoryItemData = Infer<typeof partialInventoryItemData>;
