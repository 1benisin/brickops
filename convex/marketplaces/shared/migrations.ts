/**
 * Migration scripts for schema changes
 * Run these once to migrate existing data
 */

import { mutation } from "../../_generated/server";
import { requireUser } from "../../inventory/helpers";

/**
 * Migrate isPicked field to status field
 * Converts existing isPicked boolean to status string
 *
 * Run this once after schema change from isPicked to status
 *
 * Usage: Call this mutation from Convex dashboard or frontend
 * This is a public mutation (not internal) so it can be called from the dashboard
 */
export const migrateIsPickedToStatus = mutation({
  args: {},
  handler: async (ctx) => {
    // Require user authentication
    await requireUser(ctx);

    // Get all order items
    const orderItems = await ctx.db.query("orderItems").collect();

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of orderItems) {
      try {
        // Check if item has isPicked field (old schema)
        // Use type assertion to check for old field
        const itemDoc = item as Record<string, unknown>;

        if ("isPicked" in itemDoc && !("status" in itemDoc)) {
          // Migrate: convert isPicked to status
          const isPicked = itemDoc.isPicked as boolean;
          const status = isPicked ? "picked" : "unpicked";

          // Update document with status
          await ctx.db.patch(item._id, {
            status: status as "picked" | "unpicked" | "skipped" | "issue",
          });

          migrated++;
        } else if ("status" in itemDoc) {
          // Already migrated
          skipped++;
        } else {
          // Missing both fields - set to unpicked
          await ctx.db.patch(item._id, {
            status: "unpicked",
          });
          migrated++;
        }
      } catch (error) {
        console.error(`Error migrating item ${item._id}:`, error);
        errors++;
      }
    }

    return {
      success: true,
      migrated,
      skipped,
      errors,
      total: orderItems.length,
      message: `Migrated ${migrated} documents, ${skipped} already had status field, ${errors} errors`,
    };
  },
});
