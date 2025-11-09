import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  createBricklinkStoreClient,
  createBrickOwlStoreClient,
} from "../marketplaces/shared/helpers";
import { recordMetric } from "../lib/external/metrics";
import {
  mapConvexToBricklinkCreate,
  mapConvexToBricklinkUpdate,
} from "../marketplaces/bricklink/storeMappers";
import {
  mapConvexToBrickOwlCreate,
  mapConvexToBrickOwlUpdate,
} from "../marketplaces/brickowl/storeMappers";
import { partialInventoryItemData } from "./validators";
import { ensureBrickowlIdForPartAction, formatApiError } from "./helpers";

/**
 * Update sync status after immediate sync attempt
 */
export const updateSyncStatuses = internalMutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    results: v.array(
      v.object({
        provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
        success: v.boolean(),
        error: v.optional(v.any()),
        marketplaceId: v.optional(v.union(v.string(), v.number())),
        // Phase 3: Cursor advancement support
        lastSyncedSeq: v.optional(v.number()),
        lastSyncedAvailable: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Get current item to preserve existing marketplace sync data
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) return null;

    if (!args.results) return null;

    // Start with existing marketplaceSync data to preserve lotId and other fields
    const currentSync = item.marketplaceSync ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncUpdates: any = { ...currentSync };

    args.results.forEach((result) => {
      // Get existing data for this provider to preserve lotId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingData = (currentSync as any)[result.provider] ?? {};

      const syncUpdate = {
        ...existingData, // Preserve existing fields like lotId
        status: result.success ? ("synced" as const) : ("failed" as const),
        lastSyncAttempt: Date.now(),
        ...(result.success && result.marketplaceId && { lotId: result.marketplaceId }),
        ...(result.error && { error: result.error }),
        // Phase 3: Advance cursor on success
        ...(result.success && result.lastSyncedSeq && { lastSyncedSeq: result.lastSyncedSeq }),
        ...(result.success &&
          result.lastSyncedAvailable && { lastSyncedAvailable: result.lastSyncedAvailable }),
      };

      syncUpdates[result.provider] = syncUpdate;
    });

    // Wrap in marketplaceSync object and update
    await ctx.db.patch(args.inventoryItemId, { marketplaceSync: syncUpdates });
  },
});

/**
 * Sync an inventory change to all enabled marketplaces
 */
export const syncInventoryChange = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
    inventoryItemId: v.id("inventoryItems"),
    changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    // newData: Doc<"inventoryItems">,
    previousData: partialInventoryItemData,
    correlationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get current item data
    const newData = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
      itemId: args.inventoryItemId,
    });

    if (!newData) {
      console.log("Item not found, skipping sync");
      return;
    }

    // Get configured providers
    const providers: Array<"bricklink" | "brickowl"> = await ctx.runQuery(
      internal.marketplaces.shared.mutations.getConfiguredProviders,
      {
        businessAccountId: args.businessAccountId,
      },
    );

    if (providers.length === 0) {
      console.log("No providers configured or all sync disabled");
      return;
    }

    // Sync to all providers in parallel with complete data
    const syncResults = await Promise.allSettled(
      providers.map((provider: "bricklink" | "brickowl") =>
        syncToMarketplace(ctx, provider, {
          ...args,
          newData,
          previousData: args.previousData || {},
        }),
      ),
    );

    // Update sync status on inventory item based on results
    const results = syncResults.map((result, index: number) => ({
      provider: providers[index],
      success: result.status === "fulfilled" && result.value?.success === true,
      error:
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : result.value?.error
            ? String(result.value.error)
            : undefined,
      marketplaceId: result.status === "fulfilled" ? result.value?.marketplaceId : undefined,
    }));

    // Update inventory item sync status
    await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
      inventoryItemId: args.inventoryItemId,
      results,
    });
  },
});

/**
 * Sync to a specific marketplace
 */
async function syncToMarketplace(
  ctx: ActionCtx,
  marketplace: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    inventoryItemId: Id<"inventoryItems">;
    changeType: "create" | "update" | "delete";
    newData: Partial<Doc<"inventoryItems">>;
    previousData: Partial<Doc<"inventoryItems">>;
    correlationId: string;
  },
): Promise<{ success: boolean; error?: unknown; marketplaceId?: string | number }> {
  try {
    // Create provider-specific client
    const client =
      marketplace === "bricklink"
        ? await createBricklinkStoreClient(ctx, args.businessAccountId)
        : await createBrickOwlStoreClient(ctx, args.businessAccountId);

    // Execute operation based on change type
    let result;
    const idempotencyKey = args.correlationId;

    switch (args.changeType) {
      case "create":
        result = await syncCreate(ctx, client, marketplace, args, idempotencyKey);
        break;
      case "update":
        result = await syncUpdate(ctx, client, marketplace, args, idempotencyKey);
        break;
      case "delete":
        result = await syncDelete(ctx, client, marketplace, args, idempotencyKey);
        break;
      default:
        throw new Error(`Unknown change type: ${args.changeType}`);
    }

    if (result.success) {
      recordMetric(`inventory.sync.${marketplace}.success`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        marketplaceId: result.marketplaceId,
      });
      return { success: true, marketplaceId: result.marketplaceId };
    } else {
      recordMetric(`inventory.sync.${marketplace}.failed`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    recordMetric(`inventory.sync.${marketplace}.error`, {
      inventoryItemId: args.inventoryItemId,
      changeType: args.changeType,
      correlationId: args.correlationId,
      businessAccountId: args.businessAccountId,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

// Helper functions for each operation type
async function syncCreate(
  ctx: ActionCtx,
  client: unknown,
  marketplace: string,
  args: { newData?: Partial<Doc<"inventoryItems">> },
  idempotencyKey: string,
) {
  if (marketplace === "bricklink") {
    const payload = mapConvexToBricklinkCreate(args.newData as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const result = await (client as any).createInventory(payload, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const marketplaceId = result.marketplaceId;

    return {
      success: result.success,
      marketplaceId,
      error: result.error ? formatApiError(result.error) : undefined,
    };
  } else {
    // BrickOwl: Need to fetch brickowlId from parts table
    const inventoryData = args.newData as Partial<Doc<"inventoryItems">>;
    if (!inventoryData?.partNumber) {
      return {
        success: false,
        marketplaceId: undefined,
        error: "partNumber is required for BrickOwl inventory creation",
      };
    }

    const brickowlId = await ensureBrickowlIdForPartAction(ctx, inventoryData.partNumber);

    if (brickowlId === null) {
      return {
        success: false,
        marketplaceId: undefined,
        error: `Part ${inventoryData.partNumber} not found in catalog`,
      };
    }

    if (brickowlId === "") {
      return {
        success: false,
        marketplaceId: undefined,
        error: `BrickOwl ID not available for part ${inventoryData.partNumber}.`,
      };
    }

    let brickowlColorId: number | undefined;
    if (inventoryData?.colorId) {
      const bricklinkColorId = Number.parseInt(inventoryData.colorId, 10);
      if (Number.isNaN(bricklinkColorId)) {
        return {
          success: false,
          marketplaceId: undefined,
          error: `Invalid BrickLink color ID "${inventoryData.colorId}" for part ${inventoryData.partNumber}.`,
        };
      }

      const color = await ctx.runQuery(internal.catalog.queries.getColorInternal, {
        colorId: bricklinkColorId,
      });

      if (!color || color.brickowlColorId === undefined) {
        return {
          success: false,
          marketplaceId: undefined,
          error: `BrickOwl color ID not available for BrickLink color ${inventoryData.colorId} on part ${inventoryData.partNumber}.`,
        };
      }

      brickowlColorId = color.brickowlColorId;
    }

    const payload = mapConvexToBrickOwlCreate(
      inventoryData as Doc<"inventoryItems">,
      brickowlId,
      brickowlColorId,
    );
    const result = await (client as any).createInventory(payload, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const marketplaceId = result.marketplaceId;

    return {
      success: result.success,
      marketplaceId,
      error: result.error ? formatApiError(result.error) : undefined,
    };
  }
}

async function syncUpdate(
  ctx: ActionCtx,
  client: unknown,
  marketplace: string,
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
    marketplace === "bricklink"
      ? inventoryItem?.marketplaceSync?.bricklink?.lotId
      : inventoryItem?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceId) {
    // Item not yet synced to this marketplace - treat as create
    return await syncCreate(ctx, client, marketplace, args, idempotencyKey);
  }

  // CRITICAL: Use the mapper to generate proper delta for both marketplaces
  // The mapper expects previousQuantity to calculate the +/- delta correctly
  const argsWithPreviousData = args as { previousData?: Partial<Doc<"inventoryItems">> };
  const previousQuantity =
    (argsWithPreviousData.previousData?.quantityAvailable as number) || undefined;
  const payload =
    marketplace === "bricklink"
      ? mapConvexToBricklinkUpdate(args.newData as Doc<"inventoryItems">, previousQuantity)
      : mapConvexToBrickOwlUpdate(args.newData as Doc<"inventoryItems">, previousQuantity);

  const result = await (client as any).updateInventory(marketplaceId, payload, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any

  return {
    success: result.success,
    marketplaceId: marketplaceId,
    error: result.error ? formatApiError(result.error) : undefined,
  };
}

async function syncDelete(
  ctx: ActionCtx,
  client: unknown,
  marketplace: string,
  args: { previousData?: Partial<Doc<"inventoryItems">> },
  idempotencyKey: string,
) {
  const marketplaceId =
    marketplace === "bricklink"
      ? args.previousData?.marketplaceSync?.bricklink?.lotId
      : args.previousData?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceId) {
    // Item was never synced to this marketplace - mark as success
    return { success: true, marketplaceId: undefined, error: undefined };
  }

  const result = await (client as any).deleteInventory(marketplaceId, { idempotencyKey }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    success: result.success,
    marketplaceId: undefined,
    error: result.error ? formatApiError(result.error) : undefined,
  };
}

/**
 * Retry failed sync operations
 */
export const retryFailedSync = internalAction({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    marketplace: v.union(v.literal("bricklink"), v.literal("brickowl")),
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
    let lastErrorMessage: string | undefined;

    while (attempt < maxRetries) {
      try {
        const result = await syncToMarketplace(ctx, args.marketplace, {
          businessAccountId: item.businessAccountId,
          inventoryItemId: args.inventoryItemId,
          changeType: "update", // Determine based on item state
          newData: item,
          previousData: {},
          correlationId: crypto.randomUUID(),
        });

        if (result.success) {
          // Update sync status to success
          await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
            inventoryItemId: args.inventoryItemId,
            results: [{ provider: args.marketplace, success: true }],
          });
          return { success: true };
        }

        lastErrorMessage = result.error ? formatApiError(result.error) : undefined;
        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        attempt++;
        lastErrorMessage = error instanceof Error ? error.message : String(error);
        if (attempt >= maxRetries) {
          throw error;
        }
        // Exponential backoff
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { success: false, reason: "Max retries exceeded", error: lastErrorMessage };
  },
});
