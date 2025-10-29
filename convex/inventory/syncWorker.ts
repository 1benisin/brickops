import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createBricklinkStoreClient, createBrickOwlStoreClient } from "../marketplace/helpers";
import { mapConvexToBricklinkCreate, mapConvexToBricklinkUpdate } from "../bricklink/storeMappers";
import { mapConvexToBrickOwlCreate } from "../brickowl/storeMappers";

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
  },
) {
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
      // Schedule retry with backoff
      const nextAttempt = computeNextAttempt(message.attempt);

      await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailed, {
        messageId: message._id,
        attempt: message.attempt + 1,
        nextAttemptAt: nextAttempt,
        error: String(result.error),
      });

      // If too many attempts, alert
      if (message.attempt >= 5) {
        console.error(
          `Max retries exceeded for message ${message._id}, item ${message.itemId}, provider ${message.provider}`,
        );
      }
    }
  } catch (error) {
    console.error(`Error processing message ${message._id}:`, error);

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
    item: Doc<"inventoryItems">;
    delta: number;
  },
): Promise<{ success: boolean; error?: string; marketplaceId?: number | string }> {
  try {
    // Create provider-specific client
    const client =
      args.message.provider === "bricklink"
        ? await createBricklinkStoreClient(ctx, args.item.businessAccountId)
        : await createBrickOwlStoreClient(ctx, args.item.businessAccountId);

    const idempotencyKey = `${args.item._id}:${args.message.provider}:${args.message.fromSeqExclusive}-${args.message.toSeqInclusive}`;

    // Handle different operation kinds
    switch (args.message.kind) {
      case "create": {
        const payload =
          args.message.provider === "bricklink"
            ? mapConvexToBricklinkCreate(args.item)
            : mapConvexToBrickOwlCreate(args.item);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (client as any).createInventory(payload, { idempotencyKey });
        return {
          success: result.success,
          marketplaceId: result.marketplaceId,
          error: result.error ? String(result.error) : undefined,
        };
      }

      case "update": {
        // Get marketplace ID from item's sync status
        const marketplaceId =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lotId
            : args.item.marketplaceSync?.brickowl?.lotId;

        if (!marketplaceId) {
          // No lot yet - treat as create
          return await callMarketplaceAPI(ctx, {
            ...args,
            message: { ...args.message, kind: "create" },
          });
        }

        // For BrickLink, get the anchor from lastSyncedAvailable
        const anchorAvailable =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lastSyncedAvailable ?? 0
            : args.item.marketplaceSync?.brickowl?.lastSyncedAvailable ?? 0;

        if (args.message.provider === "bricklink") {
          // BrickLink update: Map with the anchor quantity
          const payload = mapConvexToBricklinkUpdate(
            args.item,
            anchorAvailable, // Previous quantity (anchor)
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (client as any).updateInventory(marketplaceId, payload, {
            idempotencyKey,
          });

          return {
            success: result.success,
            marketplaceId: marketplaceId,
            error: result.error ? String(result.error) : undefined,
          };
        } else {
          // BrickOwl: Pass full item data (no delta-based update yet)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (client as any).updateInventory(marketplaceId, args.item, {
            idempotencyKey,
          });

          return {
            success: result.success,
            marketplaceId: marketplaceId,
            error: result.error ? String(result.error) : undefined,
          };
        }
      }

      case "delete": {
        const marketplaceId =
          args.message.provider === "bricklink"
            ? args.item.marketplaceSync?.bricklink?.lotId
            : args.item.marketplaceSync?.brickowl?.lotId;

        if (!marketplaceId) {
          // Item was never synced to this marketplace - mark as success
          return { success: true, marketplaceId: undefined, error: undefined };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (client as any).deleteInventory(marketplaceId, { idempotencyKey });
        return {
          success: result.success,
          marketplaceId: undefined,
          error: result.error ? String(result.error) : undefined,
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
      error: errorMessage,
    };
  }
}
