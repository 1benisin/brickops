import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createBricklinkStoreClient, createBrickOwlStoreClient } from "../marketplace/helpers";
import { recordMetric } from "../lib/external/metrics";
import { mapConvexToBricklinkCreate } from "../bricklink/storeMappers";
import { mapConvexToBrickOwlCreate } from "../brickowl/storeMappers";
import { partialInventoryItemData } from "./validators";

/**
 * Immediately sync an inventory change to all enabled marketplaces
 */
export const syncInventoryChangeImmediately = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
    inventoryItemId: v.id("inventoryItems"),
    changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    newData: partialInventoryItemData,
    previousData: partialInventoryItemData,
    correlationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get configured providers
    const providers: Array<"bricklink" | "brickowl"> = await ctx.runQuery(
      internal.marketplace.mutations.getConfiguredProviders,
      {
        businessAccountId: args.businessAccountId,
      },
    );

    if (providers.length === 0) {
      console.log("No providers configured or all sync disabled");
      return;
    }

    // Sync to all providers in parallel
    const syncResults = await Promise.allSettled(
      providers.map((provider: "bricklink" | "brickowl") =>
        syncToProviderImmediately(ctx, provider, args),
      ),
    );

    // Update sync status on inventory item based on results
    const results = syncResults.map((result, index: number) => ({
      provider: providers[index],
      success: result.status === "fulfilled" && result.value?.success === true,
      error: result.status === "rejected" ? result.reason : result.value?.error,
      marketplaceId: result.status === "fulfilled" ? result.value?.marketplaceId : undefined,
    }));

    // Update inventory item sync status
    await ctx.runMutation(internal.inventory.mutations.updateImmediateSyncStatus, {
      inventoryItemId: args.inventoryItemId,
      results,
    });
  },
});

/**
 * Sync to a specific provider immediately
 */
async function syncToProviderImmediately(
  ctx: ActionCtx,
  provider: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    inventoryItemId: Id<"inventoryItems">;
    changeType: "create" | "update" | "delete";
    newData?: Partial<Doc<"inventoryItems">>;
    previousData?: Partial<Doc<"inventoryItems">>;
    correlationId: string;
  },
): Promise<{ success: boolean; error?: unknown; marketplaceId?: string | number }> {
  try {
    // Check feature flags
    const disableExternalCalls = process.env.DISABLE_EXTERNAL_CALLS === "true";
    if (disableExternalCalls) {
      // Mock success for testing
      recordMetric(`inventory.immediateSync.${provider}.mocked`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
      });
      return { success: true, marketplaceId: "mocked" };
    }

    // Create provider-specific client
    const client =
      provider === "bricklink"
        ? await createBricklinkStoreClient(ctx, args.businessAccountId)
        : await createBrickOwlStoreClient(ctx, args.businessAccountId);

    // Execute operation based on change type
    let result;
    const idempotencyKey = args.correlationId;

    switch (args.changeType) {
      case "create":
        result = await syncCreateImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      case "update":
        result = await syncUpdateImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      case "delete":
        result = await syncDeleteImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      default:
        throw new Error(`Unknown change type: ${args.changeType}`);
    }

    if (result.success) {
      recordMetric(`inventory.immediateSync.${provider}.success`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        marketplaceId: result.marketplaceId,
      });
      return { success: true, marketplaceId: result.marketplaceId };
    } else {
      recordMetric(`inventory.immediateSync.${provider}.failed`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    recordMetric(`inventory.immediateSync.${provider}.error`, {
      inventoryItemId: args.inventoryItemId,
      changeType: args.changeType,
      correlationId: args.correlationId,
      businessAccountId: args.businessAccountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error };
  }
}

// Helper functions for each operation type (similar to existing sync.ts)
async function syncCreateImmediately(
  ctx: ActionCtx,
  client: unknown,
  provider: string,
  args: { newData?: Partial<Doc<"inventoryItems">> },
  idempotencyKey: string,
) {
  const payload =
    provider === "bricklink"
      ? mapConvexToBricklinkCreate(args.newData as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      : mapConvexToBrickOwlCreate(args.newData as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  const result = await (client as any).createInventory(payload, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const marketplaceId = result.marketplaceId;

  return {
    success: result.success,
    marketplaceId,
    error: result.error,
  };
}

async function syncUpdateImmediately(
  ctx: ActionCtx,
  client: unknown,
  provider: string,
  args: {
    inventoryItemId: Id<"inventoryItems">;
    newData?: Partial<Doc<"inventoryItems">>;
    previousData?: Partial<Doc<"inventoryItems">>;
  },
  idempotencyKey: string,
) {
  // Get current inventory item to find marketplace ID
  const inventoryItem = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
    itemId: args.inventoryItemId,
  });

  const marketplaceId =
    provider === "bricklink"
      ? inventoryItem?.marketplaceSync?.bricklink?.lotId
      : inventoryItem?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceId) {
    // Item not yet synced to this provider - treat as create
    return await syncCreateImmediately(ctx, client, provider, args, idempotencyKey);
  }

  // CRITICAL: Use the mapper to generate proper delta for BrickLink
  // The mapper expects previousQuantity to calculate the +/- delta correctly
  const { mapConvexToBricklinkUpdate } = await import("../bricklink/storeMappers");

  const argsWithPreviousData = args as { previousData?: Partial<Doc<"inventoryItems">> };
  const previousQuantity =
    (argsWithPreviousData.previousData?.quantityAvailable as number) || undefined;
  const payload =
    provider === "bricklink"
      ? mapConvexToBricklinkUpdate(args.newData as Doc<"inventoryItems">, previousQuantity)
      : (args.newData as Record<string, unknown>);

  const result = await (client as any).updateInventory(marketplaceId, payload, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any

  return {
    success: result.success,
    marketplaceId: result.marketplaceId || marketplaceId,
    error: result.error,
  };
}

async function syncDeleteImmediately(
  ctx: ActionCtx,
  client: unknown,
  provider: string,
  args: { previousData?: Partial<Doc<"inventoryItems">> },
  idempotencyKey: string,
) {
  const marketplaceId =
    provider === "bricklink"
      ? args.previousData?.marketplaceSync?.bricklink?.lotId
      : args.previousData?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceId) {
    // Item was never synced to this provider - mark as success
    return { success: true, marketplaceId: undefined, error: undefined };
  }

  const result = await (client as any).deleteInventory(marketplaceId, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    success: result.success,
    marketplaceId: undefined,
    error: result.error,
  };
}

/**
 * Retry failed sync operations
 */
export const retryFailedSync = internalAction({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
      itemId: args.inventoryItemId,
    });

    if (!item) {
      throw new ConvexError("Inventory item not found");
    }

    // Implement retry logic with exponential backoff
    const maxRetries = args.maxRetries ?? 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await syncToProviderImmediately(ctx, args.provider, {
          businessAccountId: item.businessAccountId,
          inventoryItemId: args.inventoryItemId,
          changeType: "update", // Determine based on item state
          newData: item,
          correlationId: crypto.randomUUID(),
        });

        if (result.success) {
          // Update sync status to success
          await ctx.runMutation(internal.inventory.mutations.updateImmediateSyncStatus, {
            inventoryItemId: args.inventoryItemId,
            results: [{ provider: args.provider, success: true }],
          });
          return { success: true };
        }

        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }
        // Exponential backoff
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { success: false, reason: "Max retries exceeded" };
  },
});
