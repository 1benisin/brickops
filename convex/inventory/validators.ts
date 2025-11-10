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

// Reusable change type for history tracking
export const changeType = v.union(v.literal("create"), v.literal("update"), v.literal("delete"));

export const syncStatus = v.union(
  v.literal("pending"),
  v.literal("syncing"),
  v.literal("synced"),
  v.literal("failed"),
);

export const marketplaceProvider = v.union(v.literal("bricklink"), v.literal("brickowl"));

export const marketplaceSync = v.optional(
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
    marketplaceSync: marketplaceSync,
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
  correlationId: v.optional(v.string()), // For idempotency
  batchId: v.optional(v.string()), // For batch operations
});

export const deleteInventoryItemArgs = v.object({
  itemId: inventoryItemId,
  reason: v.optional(v.string()),
});

// ============================================================================
// QUERY ARGS
// ============================================================================

export const listInventoryItemsArgs = v.object({});

export const getInventoryTotalsArgs = v.object({});

export const getItemSyncStatusArgs = v.object({
  itemId: inventoryItemId,
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
    marketplaceSync: marketplaceSync,
  }),
);

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
  marketplaceSync: marketplaceSync,
  pendingChangesCount: v.number(),
  nextRetryAt: v.optional(v.number()),
});

const importError = v.object({
  identifier: v.string(),
  message: v.string(),
});

export const importSummaryValidator = v.object({
  provider: marketplaceProvider,
  imported: v.number(),
  skippedExisting: v.number(),
  skippedUnavailable: v.number(),
  skippedInvalid: v.number(),
  totalRemote: v.number(),
  errors: v.array(importError),
});

const inventoryImportIssue = v.object({
  code: v.string(),
  message: v.string(),
});

const inventoryImportCandidatePreview = v.object({
  partNumber: v.optional(v.string()),
  colorId: v.optional(v.string()),
  name: v.optional(v.string()),
  condition: v.optional(v.string()),
  quantity: v.optional(v.number()),
  location: v.optional(v.string()),
  lotId: v.optional(v.string()),
  additionalInfo: v.optional(
    v.array(
      v.object({
        label: v.string(),
        value: v.string(),
      }),
    ),
  ),
});

export const inventoryImportCandidateValidator = v.object({
  candidateId: v.string(),
  provider: marketplaceProvider,
  sourceId: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("skip-existing"),
    v.literal("skip-invalid"),
    v.literal("skip-unavailable"),
  ),
  issues: v.array(inventoryImportIssue),
  preview: inventoryImportCandidatePreview,
});

export const inventoryImportValidationResultValidator = v.object({
  provider: marketplaceProvider,
  totalRemote: v.number(),
  readyCount: v.number(),
  existingCount: v.number(),
  invalidCount: v.number(),
  unavailableCount: v.number(),
  candidates: v.array(inventoryImportCandidateValidator),
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
export type ImportSummary = Infer<typeof importSummaryValidator>;
export type InventoryImportCandidate = Infer<typeof inventoryImportCandidateValidator>;
export type InventoryImportValidationResult = Infer<typeof inventoryImportValidationResultValidator>;
