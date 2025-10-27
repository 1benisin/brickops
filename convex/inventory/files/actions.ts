import { ConvexError } from "convex/values";
import { action } from "../../_generated/server";
import type { Id, Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { createBricklinkStoreClient, createBrickOwlStoreClient } from "../../marketplace/helpers";
import { mapConvexToBricklinkCreate } from "../../bricklink/storeMappers";
import { mapConvexToBrickOwlCreate } from "../../brickowl/storeMappers";
import { type Provider } from "./helpers";
import { recordMetric } from "../../lib/external/metrics";
import { batchSyncFileUIArgs, batchSyncFileUIReturns } from "./validators";

export type BatchSyncItemResult = {
  itemId: Id<"inventoryItems">;
  provider: Provider;
  success: boolean;
  marketplaceLotId?: number | string;
  error?: string;
};

export type BatchSyncResult = {
  totalItems: number;
  batches: number;
  successCount: number;
  failureCount: number;
  results: BatchSyncItemResult[];
  providerResults: {
    [provider: string]: {
      succeeded: number;
      skipped: number;
      failed: number;
    };
  };
};

/**
 * Batch sync file items to marketplaces
 * AC: 3.5.6, 3.5.7, 3.5.8
 *
 * This action orchestrates the batch sync of all items in a file to selected marketplace(s).
 * It handles chunking, rate limiting, error tracking, and progress reporting.
 */
export const batchSyncFile = action({
  args: batchSyncFileUIArgs,
  returns: batchSyncFileUIReturns,
  handler: async (ctx, args) => {
    const { fileId, marketplaces } = args;

    // Get file (using internal query since action doesn't have user context)
    const file = await ctx.runQuery(internal.inventory.files.queries.getFileInternal, { fileId });
    if (!file) {
      throw new ConvexError("File not found");
    }
    const businessAccountId = file.businessAccountId;
    const providers = marketplaces as Provider[];

    // Emit start metric
    recordMetric("inventory.files.batch.start", {
      businessAccountId,
      fileId,
      providers: providers.join(","),
    });

    try {
      // 1. Pre-flight validation
      const validation = await ctx.runQuery(
        internal.inventory.files.queries.validateBatchSyncInternal,
        {
          businessAccountId,
          fileId,
          providers,
        },
      );

      if (!validation.isValid) {
        const blockingIssues = validation.blockingIssues
          .map((issue: { message: string }) => issue.message)
          .join("; ");
        throw new ConvexError({
          code: "VALIDATION_FAILED",
          message: `Batch sync validation failed: ${blockingIssues}`,
          details: validation,
        });
      }

      // 2. Get all items in file
      const items: Doc<"inventoryItems">[] = await ctx.runQuery(
        internal.inventory.files.queries.getFileItemsForSync,
        {
          fileId,
        },
      );

      if (items.length === 0) {
        throw new ConvexError({
          code: "NO_ITEMS",
          message: "File has no items to sync",
        });
      }

      // 3. Process each provider
      const allResults: BatchSyncItemResult[] = [];
      const providerResults: {
        [provider: string]: { succeeded: number; skipped: number; failed: number };
      } = {};

      for (const provider of providers) {
        const providerStartTime = Date.now();
        let itemsToSync: typeof items = [];

        try {
          // Filter out items that are already synced to this provider
          itemsToSync = items.filter((item) => {
            if (provider === "bricklink") {
              // Skip if already synced to BrickLink
              return !(item.marketplaceSync?.bricklink?.status === "synced");
            } else if (provider === "brickowl") {
              // Skip if already synced to BrickOwl
              return !(item.marketplaceSync?.brickowl?.status === "synced");
            }
            return true;
          });

          const skippedCount = items.length - itemsToSync.length;

          // If no items need syncing for this provider, skip it
          if (itemsToSync.length === 0) {
            console.log(`All ${items.length} items already synced to ${provider}, skipping`);
            providerResults[provider] = {
              succeeded: 0,
              skipped: skippedCount,
              failed: 0,
            };

            // Mark skipped items as already synced in results
            for (const item of items) {
              const lotId =
                provider === "bricklink"
                  ? item.marketplaceSync?.bricklink?.lotId
                  : item.marketplaceSync?.brickowl?.lotId;

              allResults.push({
                itemId: item._id,
                provider,
                success: true,
                marketplaceLotId: lotId,
              });
            }

            recordMetric("inventory.files.batch.provider_skipped", {
              businessAccountId,
              fileId,
              provider,
              itemsAlreadySynced: items.length,
            });

            continue;
          }

          console.log(
            `Syncing ${itemsToSync.length} items to ${provider} (${items.length - itemsToSync.length} already synced)`,
          );

          // Calculate batches (100 items per batch)
          const batchSize = 100;

          // Handle each provider separately to maintain proper typing
          let bulkResult;
          if (provider === "bricklink") {
            const client = await createBricklinkStoreClient(ctx, businessAccountId);
            const payloads = itemsToSync.map(mapConvexToBricklinkCreate);

            bulkResult = await client.bulkCreateInventories(payloads, {
              chunkSize: batchSize,
              delayBetweenBatchesMs: 0, // No artificial delay, rate limiting handled by clients
              onProgress: async (progress) => {
                // Progress callback - can be extended for real-time UI updates
                recordMetric("inventory.files.batch.progress", {
                  businessAccountId,
                  fileId,
                  provider,
                  ...progress,
                });
              },
            });
          } else if (provider === "brickowl") {
            const client = await createBrickOwlStoreClient(ctx, businessAccountId);
            const payloads = itemsToSync.map(mapConvexToBrickOwlCreate);

            bulkResult = await client.bulkCreateInventories(payloads, {
              chunkSize: batchSize,
              onProgress: async (progress) => {
                // Progress callback - can be extended for real-time UI updates
                recordMetric("inventory.files.batch.progress", {
                  businessAccountId,
                  fileId,
                  provider,
                  ...progress,
                });
              },
            });
          } else {
            throw new ConvexError({
              code: "INVALID_PROVIDER",
              message: `Invalid provider: ${provider}`,
            });
          }

          // First, add already-synced items to results
          const alreadySyncedItems = items.filter((item) => !itemsToSync.includes(item));
          for (const item of alreadySyncedItems) {
            const lotId =
              provider === "bricklink"
                ? item.marketplaceSync?.bricklink?.lotId
                : item.marketplaceSync?.brickowl?.lotId;

            allResults.push({
              itemId: item._id,
              provider,
              success: true,
              marketplaceLotId: lotId,
            });
          }

          // Process results and map back to items that were actually synced
          for (let i = 0; i < itemsToSync.length; i++) {
            const item = itemsToSync[i];
            const result = bulkResult.results[i];

            if (result.success) {
              allResults.push({
                itemId: item._id,
                provider,
                success: true,
                marketplaceLotId: result.marketplaceId, // BrickLink doesn't return IDs
              });
            } else {
              allResults.push({
                itemId: item._id,
                provider,
                success: false,
                error: result.error?.message || "Unknown error",
              });
            }
          }

          // Record provider-specific results
          providerResults[provider] = {
            succeeded: bulkResult.succeeded,
            skipped: skippedCount,
            failed: bulkResult.failed,
          };

          // Emit provider completion metric
          recordMetric("inventory.files.batch.provider_complete", {
            businessAccountId,
            fileId,
            provider,
            succeeded: bulkResult.succeeded,
            skipped: skippedCount,
            failed: bulkResult.failed,
            durationMs: Date.now() - providerStartTime,
          });
        } catch (error) {
          // Provider-level failure - mark all items as failed for this provider
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Get items that needed syncing (if itemsToSync exists, otherwise all items)
          const itemsInError =
            typeof itemsToSync !== "undefined" && itemsToSync.length > 0 ? itemsToSync : items;

          for (const item of itemsInError) {
            allResults.push({
              itemId: item._id,
              provider,
              success: false,
              error: `Provider failure: ${errorMessage}`,
            });
          }

          // Calculate skipped count
          const skippedInError = items.length - itemsInError.length;

          providerResults[provider] = {
            succeeded: 0,
            skipped: skippedInError,
            failed: itemsInError.length,
          };

          recordMetric("inventory.files.batch.provider_failed", {
            businessAccountId,
            fileId,
            provider,
            error: errorMessage,
          });
        }
      }

      // 4. Record results in database (calls Task 6 mutation)
      await ctx.runMutation(internal.inventory.files.mutations.recordBatchSyncResults, {
        fileId,
        results: allResults,
      });

      // 5. Calculate summary
      const successCount = allResults.filter((r) => r.success).length;
      const failureCount = allResults.filter((r) => !r.success).length;

      // Format results for UI
      const uiResults = providers.map((provider) => {
        const providerStats = providerResults[provider] || { succeeded: 0, skipped: 0, failed: 0 };
        const providerResultItems = allResults.filter((r) => r.provider === provider);
        const errors = providerResultItems
          .filter((r) => !r.success)
          .map((r) => r.error || "Unknown error");

        return {
          marketplace: provider as "bricklink" | "brickowl",
          successful: providerStats.succeeded,
          skipped: providerStats.skipped,
          failed: providerStats.failed,
          errors,
        };
      });

      // Emit completion metric
      recordMetric("inventory.files.batch.complete", {
        businessAccountId,
        fileId,
        providers: providers.join(","),
        totalItems: items.length,
        successCount,
        failureCount,
      });

      return {
        total: items.length,
        results: uiResults,
      };
    } catch (error) {
      // Emit failure metric
      const errorMessage = error instanceof Error ? error.message : String(error);
      recordMetric("inventory.files.batch.failed", {
        businessAccountId,
        fileId,
        providers: providers.join(","),
        error: errorMessage,
      });

      throw error;
    }
  },
});
