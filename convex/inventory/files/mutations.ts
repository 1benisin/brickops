import { ConvexError } from "convex/values";
import { mutation, internalMutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import { requireUser, assertBusinessMembership, requireOwnerRole, now } from "../helpers";
import {
  createFileArgs,
  createFileReturns,
  updateFileArgs,
  updateFileReturns,
  deleteFileArgs,
  deleteFileReturns,
} from "./validators";

/**
 * Create a new inventory file (batch collection)
 * Any authenticated user can create files for their business account
 */
export const createFile = mutation({
  args: createFileArgs,
  returns: createFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    const timestamp = now();

    const fileId = await ctx.db.insert("inventoryFiles", {
      businessAccountId,
      name: args.name,
      description: args.description,
      createdBy: user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return fileId;
  },
});

/**
 * Update an existing inventory file
 * AC: 3.5.1, 3.5.12 - Only owner role can modify files
 */
export const updateFile = mutation({
  args: updateFileArgs,
  returns: updateFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }

    assertBusinessMembership(user, file.businessAccountId);
    requireOwnerRole(user); // AC: 3.5.12 - owner role required

    if (file.deletedAt) {
      throw new ConvexError("Cannot update deleted file");
    }

    const updates: {
      name?: string;
      description?: string;
      updatedAt: number;
    } = {
      updatedAt: now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name;
    }

    if (args.description !== undefined) {
      updates.description = args.description;
    }

    await ctx.db.patch(args.fileId, updates);

    return null;
  },
});

/**
 * Delete an inventory file (soft delete)
 * AC: 3.5.1, 3.5.12 - Only owner role can delete files
 * Implements soft delete for audit trail
 */
export const deleteFile = mutation({
  args: deleteFileArgs,
  returns: deleteFileReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }

    assertBusinessMembership(user, file.businessAccountId);
    requireOwnerRole(user); // AC: 3.5.12 - owner role required

    if (file.deletedAt) {
      throw new ConvexError("File already deleted");
    }

    // Soft delete: set deletedAt timestamp instead of hard delete
    await ctx.db.patch(args.fileId, {
      deletedAt: now(),
      updatedAt: now(),
    });

    return null;
  },
});

// ============================================================================
// INTERNAL MUTATIONS (for batch sync action - Task 5)
// ============================================================================

/**
 * Record batch sync results
 * Internal mutation for use by batch sync action
 * AC: 3.5.8, 3.5.14 - Update items with sync results and create history entries
 *
 * All updates are atomic within this mutation (Convex transactional guarantee)
 */
export const recordBatchSyncResults = internalMutation({
  args: {
    fileId: v.id("inventoryFiles"),
    results: v.array(
      v.object({
        itemId: v.id("inventoryItems"),
        provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
        success: v.boolean(),
        marketplaceLotId: v.optional(v.union(v.number(), v.string())),
        error: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const timestamp = now();

    // Get the file to extract businessAccountId and use as actorUserId (system operation)
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }

    // Process each result
    for (const result of args.results) {
      const item = await ctx.db.get(result.itemId);
      if (!item) {
        // Item may have been deleted during sync - skip
        continue;
      }

      if (result.success) {
        // ========================================
        // SUCCESSFUL SYNC
        // ========================================

        // Update inventoryItems with sync status and marketplace IDs
        const updates: {
          bricklinkSyncStatus?: "synced";
          brickowlSyncStatus?: "synced";
          bricklinkLotId?: number;
          brickowlLotId?: string;
          lastSyncedAt: number;
          updatedAt: number;
        } = {
          lastSyncedAt: timestamp,
          updatedAt: timestamp,
        };

        // Set provider-specific sync status and marketplace ID
        if (result.provider === "bricklink") {
          updates.bricklinkSyncStatus = "synced";
          if (typeof result.marketplaceLotId === "number") {
            updates.bricklinkLotId = result.marketplaceLotId;
          }
        } else if (result.provider === "brickowl") {
          updates.brickowlSyncStatus = "synced";
          if (typeof result.marketplaceLotId === "string") {
            updates.brickowlLotId = result.marketplaceLotId;
          }
        }

        await ctx.db.patch(result.itemId, updates);

        // Create inventoryHistory entry for successful sync
        await ctx.db.insert("inventoryHistory", {
          businessAccountId: item.businessAccountId,
          itemId: result.itemId,
          changeType: "batch_sync",
          actorUserId: file.createdBy, // Use file creator as actor for system operation
          reason: `Batch sync to ${result.provider} via file ${file.name}`,
          createdAt: timestamp,
          marketplace: result.provider,
          marketplaceLotId: result.marketplaceLotId,
        });
      } else {
        // ========================================
        // FAILED SYNC
        // ========================================

        // Update inventoryItems with failed status and add to syncErrors
        const syncErrors = item.syncErrors || [];
        syncErrors.push({
          provider: result.provider,
          error: result.error || "Unknown error",
          occurredAt: timestamp,
        });

        // Set provider-specific failed status
        const failedUpdates: {
          bricklinkSyncStatus?: "failed";
          brickowlSyncStatus?: "failed";
          syncErrors: typeof syncErrors;
          updatedAt: number;
        } = {
          syncErrors,
          updatedAt: timestamp,
        };

        if (result.provider === "bricklink") {
          failedUpdates.bricklinkSyncStatus = "failed";
        } else if (result.provider === "brickowl") {
          failedUpdates.brickowlSyncStatus = "failed";
        }

        await ctx.db.patch(result.itemId, failedUpdates);

        // Create inventoryHistory entry for failed sync
        await ctx.db.insert("inventoryHistory", {
          businessAccountId: item.businessAccountId,
          itemId: result.itemId,
          changeType: "batch_sync_failed",
          actorUserId: file.createdBy, // Use file creator as actor for system operation
          reason: `Batch sync to ${result.provider} failed via file ${file.name}`,
          createdAt: timestamp,
          marketplace: result.provider,
          syncError: result.error || "Unknown error",
        });
      }
    }

    // Update file's updatedAt timestamp
    await ctx.db.patch(args.fileId, {
      updatedAt: timestamp,
    });

    return null;
  },
});
