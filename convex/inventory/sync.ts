import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { recordMetric } from "../lib/external/metrics";
import {
  mapConvexToBlCreate,
  mapConvexToBlUpdate,
} from "../marketplaces/bricklink/inventory/transformers";
import {
  mapConvexToBrickOwlCreate,
  mapConvexToBrickOwlUpdate,
} from "../marketplaces/brickowl/inventory/transformers";
import { partialInventoryItemData } from "./validators";
import { ensureBrickowlIdForPartAction, formatApiError } from "./helpers";
import {
  createBLInventory as createBricklinkInventory,
  updateBLInventory as updateBricklinkInventory,
  deleteBLInventory as deleteBricklinkInventory,
} from "../marketplaces/bricklink/inventory/actions";
import {
  createInventory as createBrickOwlInventory,
  updateInventory as updateBrickOwlInventory,
  deleteInventory as deleteBrickOwlInventory,
} from "../marketplaces/brickowl/inventory/actions";

type InventoryItemDoc = Doc;

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
    // newData: InventoryItemDoc,
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
      internal.marketplaces.shared.credentials.getConfiguredProviders,
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
    newData: Partial<InventoryItemDoc>;
    previousData: Partial<InventoryItemDoc>;
    correlationId: string;
  },
): Promise<{ success: boolean; error?: unknown; marketplaceId?: string | number }> {
  try {
    const idempotencyKey = args.correlationId;
    let result;

    switch (args.changeType) {
      case "create":
        result = await syncCreate(ctx, marketplace, args, idempotencyKey);
        break;
      case "update":
        result = await syncUpdate(ctx, marketplace, args, idempotencyKey);
        break;
      case "delete":
        result = await syncDelete(ctx, marketplace, args, idempotencyKey);
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

async function syncCreate(
  ctx: ActionCtx,
  marketplace: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    inventoryItemId: Id<"inventoryItems">;
    newData: Partial<InventoryItemDoc>;
    previousData: Partial<InventoryItemDoc>;
  },
  idempotencyKey: string,
) {
  if (marketplace === "bricklink") {
    const payload = mapConvexToBlCreate(args.newData as InventoryItemDoc);
    const result = await createBricklinkInventory(ctx, {
      businessAccountId: args.businessAccountId,
      payload,
    });

    const formattedError = result.success ? undefined : formatApiError(result.error);
    return {
      success: result.success,
      marketplaceId: result.marketplaceId,
      error: formattedError,
    };
  }

  const inventoryData = args.newData;
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
    inventoryData as InventoryItemDoc,
    brickowlId,
    brickowlColorId,
  );
  const result = await createBrickOwlInventory(ctx, {
    businessAccountId: args.businessAccountId,
    payload,
    options: { idempotencyKey },
  });
  const marketplaceId = result.marketplaceId;

  const formattedError = result.success ? undefined : formatApiError(result.error);
  return {
    success: result.success,
    marketplaceId,
    error: formattedError,
  };
}

async function syncUpdate(
  ctx: ActionCtx,
  marketplace: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    inventoryItemId: Id<"inventoryItems">;
    newData: Partial<InventoryItemDoc>;
    previousData: Partial<InventoryItemDoc>;
  },
  idempotencyKey: string,
) {
  const inventoryItem = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
    itemId: args.inventoryItemId,
  });

  const marketplaceIdRaw =
    marketplace === "bricklink"
      ? inventoryItem?.marketplaceSync?.bricklink?.lotId
      : inventoryItem?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceIdRaw) {
    return await syncCreate(ctx, marketplace, args, idempotencyKey);
  }

  const previousQuantity =
    (args.previousData?.quantityAvailable as number | undefined) ?? undefined;

  if (marketplace === "bricklink") {
    const payload = mapConvexToBlUpdate(args.newData as InventoryItemDoc, previousQuantity);

    const marketplaceId = Number(marketplaceIdRaw);
    if (!Number.isFinite(marketplaceId)) {
      return {
        success: false,
        marketplaceId: undefined,
        error: formatApiError("Invalid BrickLink marketplace ID"),
      };
    }

    const result = await updateBricklinkInventory(ctx, {
      businessAccountId: args.businessAccountId,
      inventoryId: marketplaceId,
      payload,
    });

    const formattedError = result.success ? undefined : formatApiError(result.error);
    return {
      success: result.success,
      marketplaceId,
      error: formattedError,
    };
  }

  const payload = mapConvexToBrickOwlUpdate(args.newData as InventoryItemDoc, previousQuantity);

  const result = await updateBrickOwlInventory(ctx, {
    businessAccountId: args.businessAccountId,
    identifier: { lotId: String(marketplaceIdRaw) },
    payload,
    options: { idempotencyKey },
  });

  const formattedError = result.success ? undefined : formatApiError(result.error);
  return {
    success: result.success,
    marketplaceId: result.marketplaceId ?? marketplaceIdRaw,
    error: formattedError,
  };
}

async function syncDelete(
  ctx: ActionCtx,
  marketplace: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    previousData: Partial<InventoryItemDoc>;
  },
  idempotencyKey: string,
) {
  const marketplaceIdRaw =
    marketplace === "bricklink"
      ? args.previousData?.marketplaceSync?.bricklink?.lotId
      : args.previousData?.marketplaceSync?.brickowl?.lotId;

  if (!marketplaceIdRaw) {
    return { success: true, marketplaceId: undefined, error: undefined };
  }

  if (marketplace === "bricklink") {
    const marketplaceId = Number(marketplaceIdRaw);
    if (!Number.isFinite(marketplaceId)) {
      return {
        success: false,
        marketplaceId: undefined,
        error: formatApiError("Invalid BrickLink marketplace ID"),
      };
    }

    const result = await deleteBricklinkInventory(ctx, {
      businessAccountId: args.businessAccountId,
      inventoryId: marketplaceId,
    });

    const formattedError = result.success ? undefined : formatApiError(result.error);
    return {
      success: result.success,
      marketplaceId: undefined,
      error: formattedError,
    };
  }

  const result = await deleteBrickOwlInventory(ctx, {
    businessAccountId: args.businessAccountId,
    identifier: { lotId: String(marketplaceIdRaw) },
    options: { idempotencyKey },
  });
  const formattedError = result.success ? undefined : formatApiError(result.error);
  return {
    success: result.success,
    marketplaceId: undefined,
    error: formattedError,
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

        lastErrorMessage = result.success ? undefined : formatApiError(result.error);
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
