import { query, internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireUser, assertBusinessMembership } from "../helpers";
import {
  listFilesArgs,
  listFilesReturns,
  getFileArgs,
  getFileReturns,
  getFileItemCountArgs,
  getFileItemCountReturns,
  validateBatchSyncArgs,
  validateBatchSyncReturns,
  getFileItemsForSyncArgs,
  getFileItemsForSyncReturns,
} from "./validators";
import { validateBatchSyncPrerequisites, type Provider } from "./helpers";

/**
 * List all inventory files for a business account
 * AC: 3.5.2 - Display files list with summary stats
 */
export const listFiles = query({
  args: listFilesArgs,
  returns: listFilesReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    const files = await ctx.db
      .query("inventoryFiles")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    // Filter out deleted files unless includeDeleted is true
    const filteredFiles = args.includeDeleted ? files : files.filter((file) => !file.deletedAt);

    // Get item counts for each file
    const filesWithCounts = await Promise.all(
      filteredFiles.map(async (file) => {
        const items = await ctx.db
          .query("inventoryItems")
          .withIndex("by_fileId", (q) => q.eq("fileId", file._id))
          .collect();

        return {
          ...file,
          itemCount: items.length,
        };
      }),
    );

    // Sort by creation date (newest first)
    return filesWithCounts.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get a single inventory file by ID
 * AC: 3.5.4 - Display file detail view
 */
export const getFile = query({
  args: getFileArgs,
  returns: getFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return null;
    }

    assertBusinessMembership(user, file.businessAccountId);

    return file;
  },
});

/**
 * Get count of items in an inventory file
 * AC: 3.5.2 - Display item count in files list
 */
export const getFileItemCount = query({
  args: getFileItemCountArgs,
  returns: getFileItemCountReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return 0;
    }

    assertBusinessMembership(user, file.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .collect();

    return items.length;
  },
});

/**
 * Validate file for batch sync (public query for UI)
 * AC: 3.5.9 - Validate before sync
 */
export const validateBatchSync = query({
  args: {
    fileId: v.id("inventoryFiles"),
  },
  returns: v.object({
    isValid: v.boolean(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return {
        isValid: false,
        errors: ["File not found"],
      };
    }

    assertBusinessMembership(user, file.businessAccountId);

    const errors: string[] = [];

    // Check if file has items
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    if (items.length === 0) {
      errors.push("File must contain at least one item");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
});

// ============================================================================
// INTERNAL QUERIES (for batch sync action - Task 5)
// ============================================================================

/**
 * Get file for internal use (no auth check)
 * Internal query for use by batch sync action
 */
export const getFileInternal = internalQuery({
  args: getFileArgs,
  returns: getFileReturns,
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

/**
 * Validate batch sync prerequisites (internal - detailed validation)
 * Internal query for use by batch sync action with detailed item-level validation
 */
export const validateBatchSyncInternal = internalQuery({
  args: validateBatchSyncArgs,
  returns: validateBatchSyncReturns,
  handler: async (ctx, args) => {
    const result = await validateBatchSyncPrerequisites(
      ctx,
      args.businessAccountId,
      args.fileId,
      args.providers as Provider[],
    );

    // Filter issues by severity to match return type
    return {
      isValid: result.isValid,
      blockingIssues: result.blockingIssues.map((issue) => ({
        severity: "blocking" as const,
        message: issue.message,
        itemId: issue.itemId,
        field: issue.field,
      })),
      warnings: result.warnings.map((issue) => ({
        severity: "warning" as const,
        message: issue.message,
        itemId: issue.itemId,
        field: issue.field,
      })),
    };
  },
});

/**
 * Get file items for sync
 * Internal query for use by batch sync action
 */
export const getFileItemsForSync = internalQuery({
  args: getFileItemsForSyncArgs,
  returns: getFileItemsForSyncReturns,
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_fileId", (q) => q.eq("fileId", args.fileId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    return items;
  },
});
