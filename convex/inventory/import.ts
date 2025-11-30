/**
 * Inventory Import Pipeline
 *
 * This module implements the end-to-end flow for synchronizing inventory from
 * external marketplaces (BrickLink and BrickOwl) into BrickOps. The actions
 * defined here are intentionally verbose to make the data movement clear:
 *
 * - Validation actions scan the entire remote catalog and classify each lot.
 * - Import actions persist a user-selected subset of validated candidates.
 * - Helper utilities build the deterministic keys we use to detect duplicates,
 *   normalize third-party payloads, and ensure only business owners can execute
 *   the heavy import operations.
 */

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { getBLInventories } from "../marketplaces/bricklink/inventory/actions";
import { mapBlToConvexInventory } from "../marketplaces/bricklink/inventory/transformers";
import { importSummaryValidator, type AddInventoryItemArgs } from "./validators";

/**
 * Import all BrickLink inventory items into BrickOps.
 * This is a simple import that creates all items from BrickLink without duplicate checking.
 * Sets the marketplaceSync.bricklink data with the lotId and marks items as synced.
 */
export const initialBricklinkInventoryImport = action({
  args: {},
  returns: importSummaryValidator,
  handler: async (ctx) => {
    // Get BrickLink inventory responses (includes inventory_id/lotId)
    const blInventories = await getBLInventories(ctx);
    const timestamp = Date.now();

    let imported = 0;
    const errors: Array<{ identifier: string; message: string }> = [];

    for (const blInventory of blInventories) {
      try {
        // Map to Convex inventory shape
        const baseRecord = mapBlToConvexInventory(blInventory);

        // Build the complete record with marketplace sync data
        const record: AddInventoryItemArgs = {
          ...baseRecord,
          // Set marketplace sync data for initial import
          marketplaceSync: {
            bricklink: {
              lotId: blInventory.inventory_id, // The BrickLink lot ID
              status: "synced", // Already exists on BrickLink, so it's synced
              lastSyncAttempt: timestamp,
              lastSyncedSeq: 0, // Initial import, no ledger entries yet
              lastSyncedAvailable: blInventory.quantity, // Current quantity on marketplace
            },
            // BrickOwl not synced yet
            brickowl: {
              status: "pending",
              lastSyncAttempt: timestamp,
            },
          },
        };

        await ctx.runMutation(api.inventory.mutations.addInventoryItem, record);
        imported++;

        // Ensure catalog data (part, colors, prices) is complete and up-to-date
        // This enqueues refresh for missing or stale data
        try {
          await ctx.runAction(api.catalog.parts.ensurePartCompleteness, {
            partNumber: blInventory.item.no,
          });
        } catch (error) {
          // Log but don't fail import if catalog check fails
          console.warn(
            `Failed to ensure catalog completeness for ${blInventory.item.no}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      } catch (error) {
        const identifier = `${blInventory.item?.no || "unknown"}-${blInventory.color_id || "unknown"}`;
        errors.push({
          identifier,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      imported,
      total: blInventories.length,
      errors,
    };
  },
});
