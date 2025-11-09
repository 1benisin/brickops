import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { catalogClient } from "../marketplaces/bricklink/catalogClient";
import { RebrickableClient, type RebrickablePart } from "../api/rebrickable";

/**
 * Query to get pending outbox messages ready for processing
 */
export const getPendingOutboxMessages = internalQuery({
  args: { maxNextAttemptAt: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_status_time", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", args.maxNextAttemptAt),
      )
      .take(10); // Process 10 items per run (matches current BATCH_SIZE)
  },
});

/**
 * CAS pattern: Mark outbox message as inflight
 * Returns success: false if message is already being processed
 */
export const markOutboxInflight = internalMutation({
  args: {
    messageId: v.id("catalogRefreshOutbox"),
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
    messageId: v.id("catalogRefreshOutbox"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "succeeded",
      processedAt: Date.now(),
    });
  },
});

/**
 * Mark outbox message as failed and schedule retry
 */
export const markOutboxFailed = internalMutation({
  args: {
    messageId: v.id("catalogRefreshOutbox"),
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
 * Extract external IDs from Rebrickable part response
 * Returns the first element from each external ID array if available
 */
function extractExternalIdsFromRebrickable(rebrickableParts: RebrickablePart[]): {
  brickowlId?: string;
  ldrawId?: string;
  legoId?: string;
} {
  if (rebrickableParts.length === 0) {
    return {
      brickowlId: "",
    };
  }

  const part = rebrickableParts[0];
  const externalIds = part.external_ids;

  return {
    brickowlId: externalIds.BrickOwl?.[0] ?? "",
    ldrawId: externalIds.LDraw?.[0],
    legoId: externalIds.LEGO?.[0],
  };
}

/**
 * Worker that drains the catalog refresh outbox
 * Processes pending messages and refreshes data from Bricklink
 */
export const drainCatalogRefreshOutbox = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending messages ready for processing
    const pendingMessages = await ctx.runQuery(
      internal.catalog.refreshWorker.getPendingOutboxMessages,
      { maxNextAttemptAt: now },
    );

    if (pendingMessages.length === 0) {
      console.log("[catalog] No pending outbox messages");
      return;
    }

    console.log(`[catalog] Processing ${pendingMessages.length} outbox messages`);

    // Process each message
    for (const message of pendingMessages) {
      await processOutboxMessage(ctx, message);
    }
  },
});

/**
 * Process a single outbox message immediately
 * Used to provide immediate feedback when data is missing
 */
export const processSingleOutboxMessage = internalAction({
  args: {
    messageId: v.id("catalogRefreshOutbox"),
  },
  handler: async (ctx, args) => {
    // Fetch the message to ensure it exists and is still pending
    const message = await ctx.runQuery(internal.catalog.queries.getOutboxMessageById, {
      messageId: args.messageId,
    });

    if (!message || message.status !== "pending") {
      // Message already processed or doesn't exist
      return;
    }

    // Use existing processOutboxMessage helper
    await processOutboxMessage(ctx, message);
  },
});

/**
 * Process a single outbox message
 * Fetches data from Bricklink and updates database
 */
async function processOutboxMessage(ctx: ActionCtx, message: Doc<"catalogRefreshOutbox">) {
  try {
    // Mark as inflight (CAS to avoid double processing)
    const marked = await ctx.runMutation(internal.catalog.refreshWorker.markOutboxInflight, {
      messageId: message._id,
      currentAttempt: message.attempt,
    });

    if (!marked.success) {
      console.log(`Message ${message._id} already being processed or state changed`);
      return;
    }

    // Take rate limit token
    const token = await ctx.runMutation(internal.ratelimit.mutations.takeToken, {
      bucket: "bricklink:global",
    });

    if (!token.granted) {
      const retryAfterMs = Math.max(0, token.resetAt - Date.now());
      throw new Error(`RATE_LIMIT_EXCEEDED: retry after ${retryAfterMs}ms`);
    }

    // Fetch from Bricklink based on table type
    if (message.tableName === "parts") {
      // Fetch external IDs from Rebrickable first (gracefully handle failures)
      let externalIds: { brickowlId?: string; ldrawId?: string; legoId?: string } = {};
      try {
        const rebrickableClient = new RebrickableClient();
        const rebrickablePartsMap = await rebrickableClient.getPartsByBricklinkIds([
          message.primaryKey,
        ]);
        const rebrickableParts = rebrickablePartsMap.get(message.primaryKey) ?? [];
        externalIds = extractExternalIdsFromRebrickable(rebrickableParts);
      } catch (error) {
        // Log error but continue with Bricklink data only
        console.warn(
          `Failed to fetch external IDs from Rebrickable for part ${message.primaryKey}:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      // Fetch from Bricklink and merge external IDs
      const partData = await catalogClient.getRefreshedPart(message.primaryKey, externalIds);
      await ctx.runMutation(internal.catalog.mutations.upsertPart, { data: partData });
    } else if (message.tableName === "partColors") {
      const partColorsData = await catalogClient.getRefreshedPartColors(message.primaryKey);
      await ctx.runMutation(internal.catalog.mutations.upsertPartColors, {
        data: partColorsData,
      });
    } else if (message.tableName === "partPrices") {
      if (!message.secondaryKey) {
        throw new Error("secondaryKey (colorId) required for partPrices");
      }
      const priceGuides = await catalogClient.getRefreshedPriceGuide(
        message.primaryKey,
        parseInt(message.secondaryKey),
      );

      // Upsert all 4 price guide variants
      await ctx.runMutation(internal.catalog.mutations.upsertPriceGuide, {
        prices: [
          priceGuides.newStock,
          priceGuides.newSold,
          priceGuides.usedStock,
          priceGuides.usedSold,
        ],
      });
    } else if (message.tableName === "colors") {
      const colorData = await catalogClient.getRefreshedColor(parseInt(message.primaryKey));
      await ctx.runMutation(internal.marketplaces.bricklink.dataRefresher.upsertColor, {
        data: colorData,
      });
    } else if (message.tableName === "categories") {
      const categoryData = await catalogClient.getRefreshedCategory(parseInt(message.primaryKey));
      await ctx.runMutation(internal.catalog.mutations.upsertCategory, {
        data: categoryData,
      });
    }

    // Mark as succeeded
    await ctx.runMutation(internal.catalog.refreshWorker.markOutboxSucceeded, {
      messageId: message._id,
    });
  } catch (error) {
    console.error(`Error processing message ${message._id}:`, error);

    // Schedule retry with backoff
    const nextAttempt = computeNextAttempt(message.attempt);
    const errorMsg = error instanceof Error ? error.message : String(error);

    await ctx.runMutation(internal.catalog.refreshWorker.markOutboxFailed, {
      messageId: message._id,
      attempt: message.attempt + 1,
      nextAttemptAt: nextAttempt,
      error: errorMsg,
    });

    // If too many attempts, alert (but keep retrying)
    if (message.attempt >= 5) {
      console.warn(`Message ${message._id} exceeded 5 attempts: ${errorMsg}`);
    }
  }
}
