import { internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Migration: Move embedded marketplaceSync data to inventorySyncState table
 *
 * This migration extracts the embedded marketplaceSync field from inventoryItems
 * and creates separate records in the inventorySyncState table.
 *
 * Run with: npx convex run sync/migrations/migrateInventorySyncState:migrate
 */

const BATCH_SIZE = 100;

/**
 * Get migration status - compare embedded sync data vs migrated records
 */
export const getMigrationStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Count items with embedded sync data (either bricklink or brickowl)
    const allItems = await ctx.db.query("inventoryItems").collect();
    let itemsWithBricklinkSync = 0;
    let itemsWithBrickowlSync = 0;

    for (const item of allItems) {
      // Type assertion needed since we're reading legacy field
      const itemWithSync = item as Doc<"inventoryItems"> & {
        marketplaceSync?: {
          bricklink?: { status?: string };
          brickowl?: { status?: string };
        };
      };

      if (itemWithSync.marketplaceSync?.bricklink?.status) {
        itemsWithBricklinkSync++;
      }
      if (itemWithSync.marketplaceSync?.brickowl?.status) {
        itemsWithBrickowlSync++;
      }
    }

    // Count migrated records
    const syncStates = await ctx.db.query("inventorySyncState").collect();
    const bricklinkRecords = syncStates.filter((s) => s.provider === "bricklink").length;
    const brickowlRecords = syncStates.filter((s) => s.provider === "brickowl").length;

    return {
      totalItems: allItems.length,
      embedded: {
        bricklink: itemsWithBricklinkSync,
        brickowl: itemsWithBrickowlSync,
        total: itemsWithBricklinkSync + itemsWithBrickowlSync,
      },
      migrated: {
        bricklink: bricklinkRecords,
        brickowl: brickowlRecords,
        total: bricklinkRecords + brickowlRecords,
      },
      isComplete:
        itemsWithBricklinkSync === bricklinkRecords &&
        itemsWithBrickowlSync === brickowlRecords,
    };
  },
});

/**
 * Migrate a batch of inventory items from embedded marketplaceSync to inventorySyncState
 *
 * Returns the cursor for the next batch, or null if complete
 */
export const migrateBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Build query with pagination
    const query = ctx.db.query("inventoryItems");

    // Get batch of items
    const result = await query.paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });
    const items = result.page;

    let migratedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      // Type assertion for legacy field access
      const itemWithSync = item as Doc<"inventoryItems"> & {
        marketplaceSync?: {
          bricklink?: {
            lotId?: number;
            status?: "pending" | "syncing" | "synced" | "failed" | "disabled";
            lastSyncAttempt?: number;
            error?: string;
            lastSyncedSeq?: number;
            lastSyncedAvailable?: number;
          };
          brickowl?: {
            lotId?: string;
            status?: "pending" | "syncing" | "synced" | "failed" | "disabled";
            lastSyncAttempt?: number;
            error?: string;
            lastSyncedSeq?: number;
            lastSyncedAvailable?: number;
          };
        };
      };

      const bricklinkSync = itemWithSync.marketplaceSync?.bricklink;
      const brickowlSync = itemWithSync.marketplaceSync?.brickowl;

      // Migrate BrickLink sync state
      if (bricklinkSync?.status) {
        // Check if already migrated
        const existing = await ctx.db
          .query("inventorySyncState")
          .withIndex("by_item_provider", (q) =>
            q.eq("itemId", item._id).eq("provider", "bricklink"),
          )
          .first();

        if (!existing) {
          await ctx.db.insert("inventorySyncState", {
            itemId: item._id,
            provider: "bricklink",
            lotId: bricklinkSync.lotId,
            status: bricklinkSync.status,
            lastSyncAttempt: bricklinkSync.lastSyncAttempt,
            lastSyncedSeq: bricklinkSync.lastSyncedSeq,
            lastSyncedAvailable: bricklinkSync.lastSyncedAvailable,
            error: bricklinkSync.error,
          });
          migratedCount++;
        } else {
          skippedCount++;
        }
      }

      // Migrate BrickOwl sync state
      if (brickowlSync?.status) {
        // Check if already migrated
        const existing = await ctx.db
          .query("inventorySyncState")
          .withIndex("by_item_provider", (q) =>
            q.eq("itemId", item._id).eq("provider", "brickowl"),
          )
          .first();

        if (!existing) {
          await ctx.db.insert("inventorySyncState", {
            itemId: item._id,
            provider: "brickowl",
            lotId: brickowlSync.lotId,
            status: brickowlSync.status,
            lastSyncAttempt: brickowlSync.lastSyncAttempt,
            lastSyncedSeq: brickowlSync.lastSyncedSeq,
            lastSyncedAvailable: brickowlSync.lastSyncedAvailable,
            error: brickowlSync.error,
          });
          migratedCount++;
        } else {
          skippedCount++;
        }
      }
    }

    console.log(
      `[Migration] Batch complete: migrated=${migratedCount}, skipped=${skippedCount}, isDone=${result.isDone}`,
    );

    return {
      migratedCount,
      skippedCount,
      isDone: result.isDone,
      cursor: result.isDone ? null : result.continueCursor,
    };
  },
});

/**
 * Run full migration - calls migrateBatch until complete
 * This should be called manually via the Convex dashboard
 */
export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cursor: string | undefined = undefined;
    let totalMigrated = 0;
    let totalSkipped = 0;
    let batchCount = 0;

    // Process batches until done
    // Note: In production, you may want to schedule batches separately
    // to avoid timeout issues with large datasets
    while (true) {
      const result = await ctx.db.query("inventoryItems").paginate({
        numItems: BATCH_SIZE,
        cursor: cursor ?? null,
      });

      const items = result.page;
      let batchMigrated = 0;
      let batchSkipped = 0;

      for (const item of items) {
        const itemWithSync = item as Doc<"inventoryItems"> & {
          marketplaceSync?: {
            bricklink?: {
              lotId?: number;
              status?: "pending" | "syncing" | "synced" | "failed" | "disabled";
              lastSyncAttempt?: number;
              error?: string;
              lastSyncedSeq?: number;
              lastSyncedAvailable?: number;
            };
            brickowl?: {
              lotId?: string;
              status?: "pending" | "syncing" | "synced" | "failed" | "disabled";
              lastSyncAttempt?: number;
              error?: string;
              lastSyncedSeq?: number;
              lastSyncedAvailable?: number;
            };
          };
        };

        const bricklinkSync = itemWithSync.marketplaceSync?.bricklink;
        const brickowlSync = itemWithSync.marketplaceSync?.brickowl;

        if (bricklinkSync?.status) {
          const existing = await ctx.db
            .query("inventorySyncState")
            .withIndex("by_item_provider", (q) =>
              q.eq("itemId", item._id).eq("provider", "bricklink"),
            )
            .first();

          if (!existing) {
            await ctx.db.insert("inventorySyncState", {
              itemId: item._id,
              provider: "bricklink",
              lotId: bricklinkSync.lotId,
              status: bricklinkSync.status,
              lastSyncAttempt: bricklinkSync.lastSyncAttempt,
              lastSyncedSeq: bricklinkSync.lastSyncedSeq,
              lastSyncedAvailable: bricklinkSync.lastSyncedAvailable,
              error: bricklinkSync.error,
            });
            batchMigrated++;
          } else {
            batchSkipped++;
          }
        }

        if (brickowlSync?.status) {
          const existing = await ctx.db
            .query("inventorySyncState")
            .withIndex("by_item_provider", (q) =>
              q.eq("itemId", item._id).eq("provider", "brickowl"),
            )
            .first();

          if (!existing) {
            await ctx.db.insert("inventorySyncState", {
              itemId: item._id,
              provider: "brickowl",
              lotId: brickowlSync.lotId,
              status: brickowlSync.status,
              lastSyncAttempt: brickowlSync.lastSyncAttempt,
              lastSyncedSeq: brickowlSync.lastSyncedSeq,
              lastSyncedAvailable: brickowlSync.lastSyncedAvailable,
              error: brickowlSync.error,
            });
            batchMigrated++;
          } else {
            batchSkipped++;
          }
        }
      }

      totalMigrated += batchMigrated;
      totalSkipped += batchSkipped;
      batchCount++;

      console.log(
        `[Migration] Batch ${batchCount}: migrated=${batchMigrated}, skipped=${batchSkipped}`,
      );

      if (result.isDone) {
        break;
      }

      cursor = result.continueCursor;
    }

    console.log(
      `[Migration] Complete: totalMigrated=${totalMigrated}, totalSkipped=${totalSkipped}, batches=${batchCount}`,
    );

    return {
      totalMigrated,
      totalSkipped,
      batchCount,
    };
  },
});

/**
 * Verify migration - compare counts between embedded and table data
 */
export const verify = internalQuery({
  args: {},
  handler: async (ctx) => {
    const status = await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "sync/migrations/migrateInventorySyncState:getMigrationStatus" as any,
      {},
    );

    if (status.isComplete) {
      return {
        success: true,
        message: "Migration verified: all embedded sync data has been migrated",
        details: status,
      };
    }

    return {
      success: false,
      message: "Migration incomplete: counts do not match",
      details: status,
    };
  },
});
