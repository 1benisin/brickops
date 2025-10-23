/**
 * Inventory Sync Orchestration (Story 3.4)
 * Processes pending inventory changes and syncs to configured marketplaces
 */

import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, Infer } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createBricklinkStoreClient, createBrickOwlStoreClient } from "../marketplace/helpers";
import { recordMetric } from "../lib/external/metrics";
import { mapConvexToBricklinkCreate } from "../bricklink/storeMappers";
import { mapConvexToBrickOwlCreate } from "../brickowl/storeMappers";
import {
  getBusinessAccountsWithPendingChangesReturns,
  processAllPendingChangesReturns,
  processPendingChangesReturns,
} from "./validators";

type InventorySyncChange = Doc<"inventorySyncQueue">;

/**
 * Get all business accounts with pending inventory changes
 * Called by cron wrapper to determine which accounts need sync processing
 */
export const getBusinessAccountsWithPendingChanges = internalQuery({
  args: {},
  returns: getBusinessAccountsWithPendingChangesReturns,
  handler: async (ctx) => {
    const pendingChanges = await ctx.db
      .query("inventorySyncQueue")
      .withIndex("by_business_pending")
      .filter((q) => q.eq(q.field("syncStatus"), "pending"))
      .collect();

    // Extract unique business account IDs
    const accountIds = new Set<Id<"businessAccounts">>();
    for (const change of pendingChanges) {
      accountIds.add(change.businessAccountId);
    }

    return Array.from(accountIds);
  },
});

/**
 * Cron wrapper: Process pending changes for ALL business accounts
 * Called every 5 minutes by cron job
 * Task 4 (AC: 3.4.4)
 */
export const processAllPendingChanges = internalAction({
  args: {},
  returns: processAllPendingChangesReturns,
  handler: async (ctx): Promise<Infer<typeof processAllPendingChangesReturns>> => {
    const startTime = Date.now();

    // Get all accounts with pending changes
    const accountIds = await ctx.runQuery(
      internal.inventory.sync.getBusinessAccountsWithPendingChanges,
    );

    if (accountIds.length === 0) {
      console.log("[cron] Inventory sync: No pending changes");
      return {
        accountsProcessed: 0,
        totalProcessed: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        durationMs: Date.now() - startTime,
      };
    }

    console.log(
      `[cron] Inventory sync: Processing ${accountIds.length} account(s) with pending changes`,
    );

    // Process each account sequentially
    // Convex automatically serializes actions per business account for concurrency control
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (const accountId of accountIds) {
      try {
        const result = await ctx.runAction(internal.inventory.sync.processPendingChanges, {
          businessAccountId: accountId,
        });

        totalProcessed += result.processed;
        totalSucceeded += result.succeeded;
        totalFailed += result.failed;

        console.log(
          `[cron] Account ${accountId}: ${result.processed} changes (${result.succeeded} succeeded, ${result.failed} failed)`,
        );
      } catch (error) {
        console.error(`[cron] Failed to process account ${accountId}:`, error);
        // Continue processing other accounts even if one fails
      }
    }

    const durationMs = Date.now() - startTime;

    // Emit aggregate metrics
    recordMetric("inventory.sync.cron.complete", {
      accountsProcessed: accountIds.length,
      totalProcessed,
      totalSucceeded,
      totalFailed,
      durationMs,
    });

    console.log(
      `[cron] Inventory sync complete: ${totalProcessed} changes across ${accountIds.length} account(s) in ${durationMs}ms`,
    );

    return {
      accountsProcessed: accountIds.length,
      totalProcessed,
      totalSucceeded,
      totalFailed,
      durationMs,
    };
  },
});

/**
 * Process pending inventory changes for a business account
 * Called by cron wrapper (processAllPendingChanges) every 5 minutes
 */
export const processPendingChanges = internalAction({
  args: { businessAccountId: v.id("businessAccounts") },
  returns: processPendingChangesReturns,
  handler: async (
    ctx,
    { businessAccountId },
  ): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    durationMs?: number;
    reason?: string;
  }> => {
    const startTime = Date.now();

    // Check if external calls are disabled (for testing/development)
    const disableExternalCalls = process.env.DISABLE_EXTERNAL_CALLS === "true";

    // Log sync state for debugging
    console.log("Inventory sync state:", {
      disableExternalCalls,
      businessAccountId,
    });

    // Get pending changes (FIFO order)
    const changes = await ctx.runQuery(internal.inventory.mutations.getPendingChanges, {
      businessAccountId,
      limit: 50, // Process in batches
    });

    if (changes.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // Emit pending changes metric
    recordMetric("inventory.sync.pending", {
      businessAccountId,
      count: changes.length,
    });

    // Get configured providers (already filtered by sync settings)
    const providers = await ctx.runQuery(internal.marketplace.mutations.getConfiguredProviders, {
      businessAccountId,
    });

    if (providers.length === 0) {
      // No providers configured or all disabled by sync settings
      console.log("No providers configured or all sync disabled");
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        reason: "No providers configured or all sync disabled",
      };
    }

    console.log(`Processing ${changes.length} changes for providers: ${providers.join(", ")}`);

    let succeeded = 0;
    let failed = 0;

    // Process each change
    for (const change of changes) {
      try {
        // Mark as syncing
        await ctx.runMutation(internal.inventory.mutations.markSyncing, {
          changeId: change._id,
        });

        // Sync to all configured providers in parallel
        const syncResults = await Promise.allSettled([
          providers.includes("bricklink")
            ? syncToProvider(ctx, "bricklink", change, businessAccountId)
            : Promise.resolve(null),
          providers.includes("brickowl")
            ? syncToProvider(ctx, "brickowl", change, businessAccountId)
            : Promise.resolve(null),
        ]);

        // Check if any provider succeeded
        const anySucceeded = syncResults.some(
          (result) => result.status === "fulfilled" && result.value?.success === true,
        );

        if (anySucceeded) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to process change ${change._id}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    // Emit metrics
    recordMetric("inventory.sync.batch.complete", {
      businessAccountId,
      processed: changes.length,
      succeeded,
      failed,
      durationMs: duration,
      providers: providers.join(","),
    });

    return { processed: changes.length, succeeded, failed, durationMs: duration };
  },
});

/**
 * Sync a single change to a specific provider
 * Handles idempotency and error categorization
 */
async function syncToProvider(
  ctx: ActionCtx,
  provider: "bricklink" | "brickowl",
  change: InventorySyncChange,
  businessAccountId: Id<"businessAccounts">,
): Promise<{ success: boolean }> {
  const correlationId = change.correlationId;
  const operationStartTime = Date.now();

  try {
    // Check feature flags
    const disableExternalCalls = process.env.DISABLE_EXTERNAL_CALLS === "true";
    if (disableExternalCalls) {
      // Mock success for testing
      await ctx.runMutation(internal.inventory.mutations.updateSyncStatus, {
        changeId: change._id,
        provider,
        success: true,
        marketplaceId: provider === "bricklink" ? 99999 : "mock-lot-id",
      });

      recordMetric(`inventory.sync.${provider}.mocked`, {
        changeId: change._id,
        changeType: change.changeType,
        correlationId,
        businessAccountId,
      });

      return { success: true };
    }

    // Create provider-specific client
    const client =
      provider === "bricklink"
        ? await createBricklinkStoreClient(ctx, businessAccountId)
        : await createBrickOwlStoreClient(ctx, businessAccountId);

    // Execute operation based on change type
    let result;
    const idempotencyKey = change._id as string;

    switch (change.changeType) {
      case "create":
        result = await syncCreate(ctx, client, provider, change, idempotencyKey);
        break;
      case "update":
        result = await syncUpdate(ctx, client, provider, change, idempotencyKey);
        break;
      case "delete":
        result = await syncDelete(ctx, client, provider, change, idempotencyKey);
        break;
      default:
        throw new Error(`Unknown change type: ${change.changeType}`);
    }

    // Update sync status based on result
    if (result.success) {
      await ctx.runMutation(internal.inventory.mutations.updateSyncStatus, {
        changeId: change._id,
        provider,
        success: true,
        marketplaceId: result.marketplaceId,
      });

      const durationMs = Date.now() - operationStartTime;

      // Emit success and latency metrics
      recordMetric(`inventory.sync.${provider}.success`, {
        changeId: change._id,
        changeType: change.changeType,
        correlationId,
        businessAccountId,
        marketplaceId: result.marketplaceId,
        durationMs,
      });

      recordMetric("inventory.sync.latency", {
        provider,
        changeType: change.changeType,
        businessAccountId,
        durationMs,
      });

      return { success: true };
    } else {
      // Determine if error is transient or permanent
      const isTransient = isTransientError(result.error);

      if (isTransient) {
        // Emit retry metric before throwing
        recordMetric("inventory.sync.retry", {
          provider,
          changeType: change.changeType,
          changeId: change._id,
          correlationId,
          businessAccountId,
          errorCode: result.error?.code,
          errorMessage: result.error?.message,
        });

        // Throw to trigger Convex automatic retry
        throw new Error(`Transient ${provider} sync failure: ${result.error?.message}`);
      } else {
        // Check if this is a conflict error (HTTP 409)
        const isConflict = isConflictError(result.error);

        if (isConflict) {
          // Record conflict for user resolution
          await ctx.runMutation(internal.inventory.mutations.recordConflict, {
            changeId: change._id,
            provider,
            error: result.error?.message || "Conflict detected",
            conflictDetails: result.error,
          });

          recordMetric(`inventory.sync.${provider}.conflict`, {
            changeId: change._id,
            changeType: change.changeType,
            correlationId,
            businessAccountId,
            errorCode: result.error?.code,
            errorMessage: result.error?.message,
          });

          return { success: false };
        }

        // Permanent failure - record and don't retry
        await ctx.runMutation(internal.inventory.mutations.recordSyncError, {
          changeId: change._id,
          provider,
          error: result.error?.message || "Unknown error",
        });

        recordMetric(`inventory.sync.${provider}.failed`, {
          changeId: change._id,
          changeType: change.changeType,
          correlationId,
          businessAccountId,
          errorCode: result.error?.code,
          errorMessage: result.error?.message,
        });

        return { success: false };
      }
    }
  } catch (error) {
    // Handle exceptions (network errors, etc.)
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if it's a transient error
    if (isTransientError({ message: errorMessage })) {
      // Emit retry metric for exception-based retries
      recordMetric("inventory.sync.retry", {
        provider,
        changeType: change.changeType,
        changeId: change._id,
        correlationId,
        businessAccountId,
        errorMessage,
      });

      // Re-throw to trigger Convex retry
      throw error;
    }

    // Permanent error
    await ctx.runMutation(internal.inventory.mutations.recordSyncError, {
      changeId: change._id,
      provider,
      error: errorMessage,
    });

    recordMetric(`inventory.sync.${provider}.error`, {
      changeId: change._id,
      changeType: change.changeType,
      correlationId,
      businessAccountId,
      errorMessage,
    });

    return { success: false };
  }
}

/**
 * Sync a create operation
 */
async function syncCreate(
  ctx: ActionCtx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  provider: string,
  change: InventorySyncChange,
  idempotencyKey: string,
) {
  const payload =
    provider === "bricklink"
      ? mapConvexToBricklinkCreate(change.newData)
      : mapConvexToBrickOwlCreate(change.newData);

  const result = await client.createInventory(payload, { idempotencyKey });

  // Extract marketplace ID from provider-specific field
  const marketplaceId = provider === "bricklink" ? result.bricklinkLotId : result.brickowlLotId;

  return {
    success: result.success,
    marketplaceId,
    error: result.error,
  };
}

/**
 * Sync an update operation
 */
async function syncUpdate(
  ctx: ActionCtx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  provider: string,
  change: InventorySyncChange,
  idempotencyKey: string,
) {
  // Get marketplace ID from inventory item
  const item = await ctx.runQuery(internal.inventory.mutations.getChange, {
    changeId: change._id,
  });

  const inventoryItem = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
    itemId: item.inventoryItemId,
  });
  const marketplaceId =
    provider === "bricklink" ? inventoryItem?.bricklinkLotId : inventoryItem?.brickowlLotId;

  if (!marketplaceId) {
    // Item not yet synced to this provider - treat as create
    return await syncCreate(ctx, client, provider, change, idempotencyKey);
  }

  // Build update payload from changes
  const payload = change.newData;

  const result = await client.updateInventory(marketplaceId, payload, { idempotencyKey });

  // Extract marketplace ID from provider-specific field
  const updatedMarketplaceId =
    provider === "bricklink" ? result.bricklinkLotId : result.brickowlLotId;

  return {
    success: result.success,
    marketplaceId: updatedMarketplaceId ?? marketplaceId,
    error: result.error,
  };
}

/**
 * Sync a delete operation
 */
async function syncDelete(
  ctx: ActionCtx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  provider: string,
  change: InventorySyncChange,
  idempotencyKey: string,
) {
  // Get marketplace ID from previous data
  const marketplaceId =
    provider === "bricklink"
      ? change.previousData?.bricklinkLotId
      : change.previousData?.brickowlLotId;

  if (!marketplaceId) {
    // Item was never synced to this provider - mark as success (nothing to delete)
    return {
      success: true,
      marketplaceId: undefined,
      error: undefined,
    };
  }

  const result = await client.deleteInventory(marketplaceId, { idempotencyKey });

  return {
    success: result.success,
    marketplaceId: undefined, // Deleted, no longer has ID
    error: result.error,
  };
}

/**
 * Determine if an error is transient (should retry) or permanent (should not retry)
 */
function isTransientError(error: { message?: string; code?: string } | undefined): boolean {
  if (!error) return false;

  const message = error.message || "";
  const code = error.code || "";

  // Transient errors (retry)
  if (code === "RATE_LIMIT_EXCEEDED") return true; // Our quota exceeded
  if (code === "CIRCUIT_BREAKER_OPEN") return true; // Circuit breaker
  if (message.includes("429")) return true; // HTTP 429
  if (message.includes("5")) return true; // HTTP 5xx
  if (message.includes("timeout")) return true; // Timeout
  if (message.includes("network")) return true; // Network error
  if (message.includes("ECONNREFUSED")) return true; // Connection refused
  if (message.includes("ETIMEDOUT")) return true; // Connection timeout

  // Permanent errors (don't retry)
  if (code === "VALIDATION_ERROR") return false;
  if (code === "CONFLICT") return false;
  if (code === "NOT_FOUND") return false;
  if (code === "CREDENTIALS_NOT_FOUND") return false;
  if (message.includes("401")) return false; // Unauthorized
  if (message.includes("403")) return false; // Forbidden
  if (message.includes("404")) return false; // Not found
  if (message.includes("400")) return false; // Bad request

  // Unknown error - don't retry to be safe
  return false;
}

/**
 * Determine if an error represents a conflict (HTTP 409)
 * Conflicts require user resolution before retry
 */
function isConflictError(error: { message?: string; code?: string } | undefined): boolean {
  if (!error) return false;

  const message = error.message || "";
  const code = error.code || "";

  // Check for conflict indicators
  if (code === "CONFLICT") return true;
  if (message.includes("409")) return true; // HTTP 409 Conflict
  if (message.toLowerCase().includes("conflict")) return true;
  if (message.toLowerCase().includes("version mismatch")) return true;
  if (message.toLowerCase().includes("etag")) return true; // ETag-based conflict

  return false;
}
