import { v } from "convex/values";

// ============================================================================
// SHARED / REUSABLE VALIDATORS
// ============================================================================

export const businessAccountId = v.id("businessAccounts");
export const inventoryFileId = v.id("inventoryFiles");
export const userId = v.id("users");

// ============================================================================
// MUTATION ARGS
// ============================================================================

export const createFileArgs = v.object({
  name: v.string(),
  description: v.optional(v.string()),
});

export const updateFileArgs = v.object({
  fileId: inventoryFileId,
  name: v.optional(v.string()),
  description: v.optional(v.string()),
});

export const deleteFileArgs = v.object({
  fileId: inventoryFileId,
});

// ============================================================================
// MUTATION RETURNS
// ============================================================================

export const createFileReturns = inventoryFileId;

export const updateFileReturns = v.null();

export const deleteFileReturns = v.null();

// ============================================================================
// QUERY ARGS
// ============================================================================

export const listFilesArgs = v.object({
  includeDeleted: v.optional(v.boolean()),
});

export const getFileArgs = v.object({
  fileId: inventoryFileId,
});

export const getFileItemCountArgs = v.object({
  fileId: inventoryFileId,
});

// ============================================================================
// QUERY RETURNS
// ============================================================================

export const listFilesReturns = v.array(
  v.object({
    _id: inventoryFileId,
    _creationTime: v.number(),
    businessAccountId,
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: userId,
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    itemCount: v.number(),
  }),
);

export const getFileReturns = v.union(
  v.object({
    _id: inventoryFileId,
    _creationTime: v.number(),
    businessAccountId,
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: userId,
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }),
  v.null(),
);

export const getFileItemCountReturns = v.number();

// ============================================================================
// INTERNAL QUERY ARGS (for batch sync)
// ============================================================================

export const validateBatchSyncArgs = v.object({
  businessAccountId,
  fileId: inventoryFileId,
  providers: v.array(v.union(v.literal("bricklink"), v.literal("brickowl"))),
});

export const getFileItemsForSyncArgs = v.object({
  fileId: inventoryFileId,
});

// ============================================================================
// INTERNAL QUERY RETURNS (for batch sync)
// ============================================================================

export const validateBatchSyncReturns = v.object({
  isValid: v.boolean(),
  blockingIssues: v.array(
    v.object({
      severity: v.literal("blocking"),
      message: v.string(),
      itemId: v.optional(v.id("inventoryItems")),
      field: v.optional(v.string()),
    }),
  ),
  warnings: v.array(
    v.object({
      severity: v.literal("warning"),
      message: v.string(),
      itemId: v.optional(v.id("inventoryItems")),
      field: v.optional(v.string()),
    }),
  ),
});

export const getFileItemsForSyncReturns = v.array(v.any()); // Returns Doc<"inventoryItems">[]

// ============================================================================
// PUBLIC ACTION ARGS (for batch sync from UI)
// ============================================================================

export const batchSyncFileUIArgs = v.object({
  fileId: inventoryFileId,
  marketplaces: v.array(v.union(v.literal("bricklink"), v.literal("brickowl"))),
});

export const batchSyncFileUIReturns = v.object({
  total: v.number(),
  results: v.array(
    v.object({
      marketplace: v.union(v.literal("bricklink"), v.literal("brickowl")),
      successful: v.number(),
      skipped: v.number(),
      failed: v.number(),
      errors: v.array(v.string()),
    }),
  ),
});

// ============================================================================
// INTERNAL ACTION ARGS (for batch sync)
// ============================================================================

export const batchSyncFileArgs = v.object({
  businessAccountId,
  fileId: inventoryFileId,
  providers: v.array(v.union(v.literal("bricklink"), v.literal("brickowl"))),
});

// ============================================================================
// INTERNAL ACTION RETURNS (for batch sync)
// ============================================================================

export const batchSyncFileReturns = v.object({
  totalItems: v.number(),
  batches: v.number(),
  successCount: v.number(),
  failureCount: v.number(),
  results: v.array(
    v.object({
      itemId: v.id("inventoryItems"),
      provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
      success: v.boolean(),
      marketplaceLotId: v.optional(v.union(v.number(), v.string())),
      error: v.optional(v.string()),
    }),
  ),
  providerResults: v.any(), // { [provider: string]: { succeeded: number; failed: number } }
});
