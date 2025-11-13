import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  mapConvexToBlCreate,
  mapConvexToBlUpdate,
} from "../marketplaces/bricklink/inventory/transformers";
import {
  createBLInventory as createBricklinkInventory,
  updateBLInventory as updateBricklinkInventory,
  deleteBLInventory as deleteBricklinkInventory,
} from "../marketplaces/bricklink/inventory/actions";
import {
  mapConvexToBrickOwlCreate,
  mapConvexToBrickOwlUpdate,
} from "../marketplaces/brickowl/inventory/transformers";
import {
  createInventory as createBrickOwlInventory,
  updateInventory as updateBrickOwlInventory,
  deleteInventory as deleteBrickOwlInventory,
} from "../marketplaces/brickowl/inventory/actions";
import { ensureBrickowlIdForPartAction, formatApiError } from "./helpers";

type InventoryItemDoc = Doc<"inventoryItems">;

/**
 * Phase 3: Worker that drains the marketplace outbox
 * Processes pending/inflight outbox messages and syncs them to marketplaces
 */

/**
 * Query to get pending outbox messages ready for processing
 */
export const getPendingOutboxMessages = internalQuery({
  args: { maxNextAttemptAt: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_status_time", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", args.maxNextAttemptAt),
      )
      .collect();
  },
});

/**
 * CAS pattern: Mark outbox message as inflight
 * Returns success: false if message is already being processed
 */
export const markOutboxInflight = internalMutation({
  args: {
    messageId: v.id("marketplaceOutbox"),
    currentAttempt: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return { success: false, reason: "Message not found" };
    }

    // Only mark as inflight if it's still pending with the expected attempt number
    if (message.status !== "pending" || message.attempt !== args.currentAttempt) {
      return { success: false, reason: "Message state changed" };
    }

    await ctx.db.patch(args.messageId, {
      status: "inflight",
    });

    return { success: true };
  },
});

/**
 * Mark outbox message as succeeded
 */
export const markOutboxSucceeded = internalMutation({
  args: {
    messageId: v.id("marketplaceOutbox"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "succeeded",
    });
  },
});

/**
 * Mark outbox message as failed and schedule retry
 */
export const markOutboxFailed = internalMutation({
  args: {
    messageId: v.id("marketplaceOutbox"),
    attempt: v.number(),
    nextAttemptAt: v.number(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "pending",
      attempt: args.attempt,
      nextAttemptAt: args.nextAttemptAt,
      lastError: args.error,
    });
  },
});

/**
 * Mark outbox message as failed permanently (no more retries)
 */
export const markOutboxFailedPermanently = internalMutation({
  args: {
    messageId: v.id("marketplaceOutbox"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "failed",
      lastError: args.error,
    });
  },
});

/**
 * Compute exponential backoff with jitter for retry attempts
 * Returns the next attempt timestamp
 */
function computeNextAttempt(attempt: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 300000; // 5 minutes
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.floor(Math.random() * 5000); // 0-5 seconds random

  return Date.now() + exponentialDelay + jitter;
}

/**
 * Worker that drains the marketplace outbox
 * Processes pending messages and syncs to marketplaces
 */
export const drainMarketplaceOutbox = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending messages ready for processing
    const pendingMessages = await ctx.runQuery(
      internal.inventory.syncWorker.getPendingOutboxMessages,
      { maxNextAttemptAt: now },
    );

    if (pendingMessages.length === 0) {
      console.log("No pending outbox messages");
      return;
    }

    console.log(`Processing ${pendingMessages.length} outbox messages`);

    // Process each message
    for (const message of pendingMessages) {
      await processOutboxMessage(ctx, message);
    }
  },
});

/**
 * Process a single outbox message
 * Computes delta from ledger window and calls marketplace API
 */
async function processOutboxMessage(
  ctx: ActionCtx,
  message: {
    _id: Id<"marketplaceOutbox">;
    itemId: Id<"inventoryItems">;
    provider: "bricklink" | "brickowl";
    kind: "create" | "update" | "delete";
    fromSeqExclusive: number;
    toSeqInclusive: number;
    attempt: number;
    lastError?: string;
  },
) {
  // Early check: if already exceeded max retries, mark as failed immediately
  if (message.attempt >= 5) {
    const errorMessage = message.lastError || "Max retries exceeded";

    await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailedPermanently, {
      messageId: message._id,
      error: errorMessage,
    });

    await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
      inventoryItemId: message.itemId,
      results: [
        {
          provider: message.provider,
          success: false,
          error: errorMessage,
        },
      ],
    });

    return; // Don't process further
  }

  try {
    // Mark as inflight (CAS to avoid double processing)
    const marked = await ctx.runMutation(internal.inventory.syncWorker.markOutboxInflight, {
      messageId: message._id,
      currentAttempt: message.attempt,
    });

    if (!marked.success) {
      console.log(`Message ${message._id} already being processed or state changed`);
      return;
    }

    // Compute delta from ledger window
    const delta = await ctx.runQuery(internal.inventory.queries.computeDeltaFromWindow, {
      itemId: message.itemId,
      fromSeqExclusive: message.fromSeqExclusive,
      toSeqInclusive: message.toSeqInclusive,
    });

    // Get item and current ledger state
    const item = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
      itemId: message.itemId,
    });

    if (!item) {
      throw new Error(`Item not found: ${message.itemId}`);
    }

    // Call actual marketplace API
    const marketplaceSyncState =
      message.provider === "bricklink"
        ? item.marketplaceSync?.bricklink
        : item.marketplaceSync?.brickowl;

    console.log("[MarketplaceSync] Processing message", {
      messageId: message._id,
      provider: message.provider,
      kind: message.kind,
      itemId: message.itemId,
      fromSeqExclusive: message.fromSeqExclusive,
      toSeqInclusive: message.toSeqInclusive,
      attempt: message.attempt,
      delta,
      existingMarketplaceState: marketplaceSyncState,
    });
    const result = await callMarketplaceAPI(ctx, {
      message,
      item,
      delta,
    });

    if (result.success) {
      // Get the postAvailable from the ledger entry at toSeqInclusive
      const ledgerEntry = await ctx.runQuery(internal.inventory.queries.getLedgerEntryAtSeq, {
        itemId: message.itemId,
        seq: message.toSeqInclusive,
      });

      // Advance cursor on success
      await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
        inventoryItemId: message.itemId,
        results: [
          {
            provider: message.provider,
            success: true,
            marketplaceId: result.marketplaceId,
            lastSyncedSeq: message.toSeqInclusive,
            lastSyncedAvailable: ledgerEntry?.postAvailable ?? item.quantityAvailable,
          },
        ],
      });

      // Mark outbox message as succeeded
      await ctx.runMutation(internal.inventory.syncWorker.markOutboxSucceeded, {
        messageId: message._id,
      });
    } else {
      if (
        message.provider === "brickowl" &&
        (result.errorCode === "missing_brickowl_id" ||
          result.errorCode === "missing_brickowl_color" ||
          result.errorCode === "part_missing")
      ) {
        const errorMessage =
          result.error ??
          (result.errorCode === "missing_brickowl_id"
            ? `BrickOwl ID not available for part ${item.partNumber}`
            : result.errorCode === "part_missing"
              ? `Part ${item.partNumber} not found in catalog`
              : `BrickOwl color ID not available for BrickLink color ${item.colorId} on part ${item.partNumber}`);

        await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailedPermanently, {
          messageId: message._id,
          error: errorMessage,
        });

        await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
          inventoryItemId: message.itemId,
          results: [
            {
              provider: "brickowl",
              success: false,
              error: errorMessage,
            },
          ],
        });
        return;
      }

      if (message.attempt >= 5) {
        const errorMessage = formatApiError(result.error) || "Unknown marketplace sync error";
        console.error(
          `Max retries exceeded for message ${message._id}, item ${message.itemId}, provider ${message.provider}`,
        );
        await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailedPermanently, {
          messageId: message._id,
          error: errorMessage,
        });
      } else {
        // Schedule retry with backoff
        const nextAttempt = computeNextAttempt(message.attempt);

        await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailed, {
          messageId: message._id,
          attempt: message.attempt + 1,
          nextAttemptAt: nextAttempt,
          error: formatApiError(result.error),
        });
      }
    }
  } catch (error) {
    console.error(`Error processing message ${message._id}:`, error);

    // Check if we've exceeded max retries
    if (message.attempt >= 5) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Mark as failed permanently
      await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailedPermanently, {
        messageId: message._id,
        error: errorMessage,
      });
    } else {
      // Schedule retry
      const nextAttempt = computeNextAttempt(message.attempt);
      await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailed, {
        messageId: message._id,
        attempt: message.attempt + 1,
        nextAttemptAt: nextAttempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Call actual marketplace API based on provider and operation kind
 */
async function callMarketplaceAPI(
  ctx: ActionCtx,
  args: {
    message: {
      provider: "bricklink" | "brickowl";
      kind: "create" | "update" | "delete";
      fromSeqExclusive: number;
      toSeqInclusive: number;
    };
    item: InventoryItemDoc;
    delta: number;
  },
): Promise<{
  success: boolean;
  error?: string;
  marketplaceId?: number | string;
  errorCode?:
    | "missing_brickowl_id"
    | "missing_brickowl_color"
    | "part_missing"
    | "validation_error";
}> {
  try {
    const idempotencyKey = `${args.item._id}:${args.message.provider}:${args.message.fromSeqExclusive}-${args.message.toSeqInclusive}`;

    switch (args.message.kind) {
      case "create": {
        if (args.message.provider === "bricklink") {
          const payload = mapConvexToBlCreate(args.item);
          console.log("[BrickLink] Creating inventory item", {
            inventoryItemId: args.item._id,
            businessAccountId: args.item.businessAccountId,
            payload,
          });
          const result = await createBricklinkInventory(ctx, {
            businessAccountId: args.item.businessAccountId,
            payload,
          });

          const formattedError = result.success ? undefined : formatApiError(result.error);
          if (!result.success) {
            console.error("[BrickLink] Inventory create failed", {
              inventoryItemId: args.item._id,
              businessAccountId: args.item.businessAccountId,
              correlationId: result.correlationId,
              error: result.error,
              formattedError,
            });
          }
          return {
            success: result.success,
            marketplaceId: result.marketplaceId,
            error: formattedError,
          };
        }

        // BrickOwl: Need to fetch brickowlId from parts table
        if (!args.item.partNumber) {
          return {
            success: false,
            error: "partNumber is required for BrickOwl inventory creation",
            errorCode: "validation_error",
          };
        }

        const brickowlId = await ensureBrickowlIdForPartAction(ctx, args.item.partNumber);

        if (brickowlId === null) {
          return {
            success: false,
            error: `Part ${args.item.partNumber} not found in catalog`,
            errorCode: "part_missing",
          };
        }

        if (brickowlId === "") {
          return {
            success: false,
            error: `BrickOwl ID not available for part ${args.item.partNumber}.`,
            errorCode: "missing_brickowl_id",
          };
        }

        let brickowlColorId: number | undefined;
        if (args.item.colorId) {
          const bricklinkColorId = Number.parseInt(args.item.colorId, 10);
          if (Number.isNaN(bricklinkColorId)) {
            return {
              success: false,
              error: `Invalid BrickLink color ID "${args.item.colorId}" for part ${args.item.partNumber}.`,
              errorCode: "validation_error",
            };
          }

          const color = await ctx.runQuery(internal.catalog.queries.getColorInternal, {
            colorId: bricklinkColorId,
          });

          if (!color || color.brickowlColorId === undefined) {
            return {
              success: false,
              error: `BrickOwl color ID not available for BrickLink color ${args.item.colorId} on part ${args.item.partNumber}.`,
              errorCode: "missing_brickowl_color",
            };
          }

          brickowlColorId = color.brickowlColorId;
        }

        const payload = mapConvexToBrickOwlCreate(args.item, brickowlId, brickowlColorId);
        const result = await createBrickOwlInventory(ctx, {
          businessAccountId: args.item.businessAccountId,
          payload,
          options: { idempotencyKey },
        });
        const formattedError = result.success ? undefined : formatApiError(result.error);
        return {
          success: result.success,
          marketplaceId: result.marketplaceId,
          error: formattedError,
        };
      }

      case "update": {
        // Get marketplace ID from item's sync status
        const marketplaceIdRaw =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lotId
            : args.item.marketplaceSync?.brickowl?.lotId;

        if (!marketplaceIdRaw) {
          // No lot yet - treat as create
          return await callMarketplaceAPI(ctx, {
            ...args,
            message: { ...args.message, kind: "create" },
          });
        }

        const anchorAvailable =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lastSyncedAvailable ?? 0
            : args.item.marketplaceSync?.brickowl?.lastSyncedAvailable ?? 0;

        if (args.message.provider === "bricklink") {
          const payload = mapConvexToBlUpdate(args.item, anchorAvailable);

          const marketplaceId = Number(marketplaceIdRaw);
          if (!Number.isFinite(marketplaceId)) {
            return {
              success: false,
              error: formatApiError("Invalid BrickLink marketplace ID"),
            };
          }

          const result = await updateBricklinkInventory(ctx, {
            businessAccountId: args.item.businessAccountId,
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

        const payload = mapConvexToBrickOwlUpdate(
          args.item,
          anchorAvailable,
          false, // Use relative_quantity mode (delta-based)
        );

        const result = await updateBrickOwlInventory(ctx, {
          businessAccountId: args.item.businessAccountId,
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

      case "delete": {
        const marketplaceIdRaw =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lotId
            : args.item.marketplaceSync?.brickowl?.lotId;

        if (!marketplaceIdRaw) {
          return { success: true, marketplaceId: undefined, error: undefined };
        }

        if (args.message.provider === "bricklink") {
          const marketplaceId = Number(marketplaceIdRaw);
          if (!Number.isFinite(marketplaceId)) {
            return {
              success: false,
              error: formatApiError("Invalid BrickLink marketplace ID"),
            };
          }

          const result = await deleteBricklinkInventory(ctx, {
            businessAccountId: args.item.businessAccountId,
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
          businessAccountId: args.item.businessAccountId,
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

      default:
        throw new Error(`Unknown operation kind: ${args.message.kind}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error calling ${args.message.provider} API:`, errorMessage);
    return {
      success: false,
      error: formatApiError(errorMessage),
    };
  }
}
