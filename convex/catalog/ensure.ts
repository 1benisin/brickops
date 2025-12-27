/**
 * Catalog Part Ensure - Self-Scheduling Orchestrator
 *
 * Implements the self-scheduling retry pattern from ideal-architecture-patterns.md.
 * Replaces the outbox-based ensurePartCompleteness with a simpler orchestrator
 * that fetches part data, colors, and prices, then signals completion.
 */

import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { isFresh, DEFAULT_FRESHNESS_THRESHOLD_MS } from "./helpers";
import { fetchBlPart, fetchBlPartColors } from "../marketplaces/bricklink/catalog/parts/actions";
import { fetchBlPriceGuide } from "../marketplaces/bricklink/catalog/priceGuides/actions";
import { RebrickableClient } from "../api/rebrickable";
import type { PriceGuideRecord } from "./prices";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_RETRIES = 3;
const PRICE_BATCH_SIZE = 5; // Process prices for N colors at a time to avoid timeout

/**
 * Schedule a continuation callback by function name.
 *
 * This is a helper for dynamic dispatch - when the function to call is determined
 * at runtime (e.g., passed as a string parameter). Convex's scheduler accepts
 * string function names at runtime, but TypeScript requires explicit typing.
 */
async function scheduleCallback(
  ctx: ActionCtx,
  functionName: string,
  args: Record<string, unknown>,
): Promise<void> {
  // Convex scheduler accepts string function names at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.scheduler.runAfter(0, functionName as any, args);
}

// ============================================================================
// TYPES
// ============================================================================

type FreshnessStatus = {
  partFresh: boolean;
  colorsFresh: boolean;
  pricesFresh: boolean;
  allFresh: boolean;
  part: Doc<"parts"> | null;
  partColors: Doc<"partColors">[];
  colorIdsNeedingPrices: number[];
};

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Get freshness status for a part and its related data.
 * Returns which data needs to be refreshed.
 */
export const getPartFreshnessStatus = internalQuery({
  args: {
    partNumber: v.string(),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<FreshnessStatus> => {
    const { partNumber, forceRefresh = false } = args;
    const threshold = DEFAULT_FRESHNESS_THRESHOLD_MS;

    // 1. Check part freshness
    const part = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", partNumber))
      .first();

    const partFresh = !forceRefresh && part !== null && isFresh(part.lastFetched, threshold);

    // 2. Check part colors freshness
    const partColors = await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", partNumber))
      .collect();

    const colorsFresh =
      !forceRefresh &&
      partColors.length > 0 &&
      partColors.every((pc) => isFresh(pc.lastFetched, threshold));

    // 3. Check prices freshness for each color
    const colorIdsNeedingPrices: number[] = [];

    if (partColors.length > 0) {
      for (const pc of partColors) {
        const prices = await ctx.db
          .query("partPrices")
          .withIndex("by_partNo_colorId", (q) =>
            q.eq("partNo", partNumber).eq("colorId", pc.colorId),
          )
          .collect();

        // Need prices if: no prices exist, or any price is stale
        const pricesExist = prices.length > 0;
        const pricesStale = prices.some((p) => !isFresh(p.lastFetched, threshold));

        if (forceRefresh || !pricesExist || pricesStale) {
          colorIdsNeedingPrices.push(pc.colorId);
        }
      }
    }

    const pricesFresh =
      !forceRefresh && partColors.length > 0 && colorIdsNeedingPrices.length === 0;

    return {
      partFresh,
      colorsFresh,
      pricesFresh,
      allFresh: partFresh && colorsFresh && pricesFresh,
      part,
      partColors,
      colorIdsNeedingPrices,
    };
  },
});

// ============================================================================
// MAIN ORCHESTRATOR ACTION
// ============================================================================

/**
 * Ensure a catalog part exists with complete data (part + colors + prices).
 *
 * Uses self-scheduling retry pattern:
 * - Rate limit denied → schedules self for later
 * - Returns { status: "complete" } when all data is fresh
 * - Returns { status: "scheduled" } when work was scheduled
 * - Calls onComplete continuation when all data is fetched
 *
 * @example
 * // Simple usage - just ensure data exists
 * await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
 *   partNumber: "3001",
 * });
 *
 * @example
 * // With continuation callback
 * await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
 *   partNumber: "3001",
 *   onComplete: {
 *     action: "internal.inventory.processAddInventoryItem",
 *     args: { partNumber: "3001", colorId: 1, quantity: 10 },
 *   },
 * });
 */
export const ensureCatalogPart = internalAction({
  args: {
    partNumber: v.string(),
    forceRefresh: v.optional(v.boolean()),
    onComplete: v.optional(
      v.object({
        action: v.string(),
        args: v.any(),
      }),
    ),
    // Internal state for self-scheduling (callers should not set these)
    _step: v.optional(
      v.union(v.literal("check"), v.literal("part"), v.literal("colors"), v.literal("prices")),
    ),
    _priceColorOffset: v.optional(v.number()),
    _attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const {
      partNumber,
      forceRefresh = false,
      onComplete,
      _step = "check",
      _priceColorOffset = 0,
      _attempt = 1,
    } = args;

    // ========================================================================
    // STEP: CHECK - Determine what needs to be fetched
    // ========================================================================
    if (_step === "check") {
      const status = await ctx.runQuery(internal.catalog.ensure.getPartFreshnessStatus, {
        partNumber,
        forceRefresh,
      });

      // All data is fresh - return immediately
      if (status.allFresh) {
        // Fire onComplete if provided
        if (onComplete) {
          await scheduleCallback(ctx, onComplete.action, onComplete.args);
        }
        return { status: "complete" as const };
      }

      // Determine which step to start with
      if (!status.partFresh) {
        // Need to fetch part first
        await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "part",
          _attempt: 1,
        });
        return { status: "scheduled" as const };
      }

      if (!status.colorsFresh) {
        // Part is fresh, need colors
        await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "colors",
          _attempt: 1,
        });
        return { status: "scheduled" as const };
      }

      if (!status.pricesFresh) {
        // Part and colors are fresh, need prices
        await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "prices",
          _priceColorOffset: 0,
          _attempt: 1,
        });
        return { status: "scheduled" as const };
      }

      // Shouldn't reach here, but handle it
      return { status: "complete" as const };
    }

    // ========================================================================
    // STEP: PART - Fetch part data from BrickLink + optional sources
    // ========================================================================
    if (_step === "part") {
      // Check rate limit for BrickLink
      const token = await ctx.runMutation(internal.ratelimiter.consume.consumeToken, {
        bucket: "brickopsAdmin",
        provider: "bricklink",
      });

      if (!token.ok) {
        if (_attempt >= MAX_RETRIES) {
          throw new Error(
            `Failed to ensure part ${partNumber}: rate limit exceeded after ${MAX_RETRIES} attempts`,
          );
        }
        // Schedule retry after rate limit window
        await ctx.scheduler.runAfter(token.retryAfter, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "part",
          _attempt: _attempt + 1,
        });
        return { status: "scheduled" as const };
      }

      // Fetch BrickOwl ID (best effort - don't fail if this fails)
      let brickowlId = "";
      try {
        brickowlId = await ctx.runAction(internal.marketplaces.brickowl.catalog.lookupBrickowlId, {
          bricklinkPartNo: partNumber,
        });
      } catch (error) {
        console.warn(
          `[ensureCatalogPart] Failed to fetch BrickOwl ID for ${partNumber}:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      // Fetch additional external IDs from Rebrickable (best effort)
      let ldrawId: string | undefined;
      let legoId: string | undefined;
      try {
        const rebrickableClient = new RebrickableClient(ctx);
        const partsMap = await rebrickableClient.getPartsByBricklinkIds([partNumber]);
        const parts = partsMap.get(partNumber) ?? [];
        if (parts.length > 0) {
          ldrawId = parts[0].external_ids.LDraw?.[0];
          legoId = parts[0].external_ids.LEGO?.[0];
        }
      } catch (error) {
        console.warn(
          `[ensureCatalogPart] Failed to fetch Rebrickable data for ${partNumber}:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      // Fetch part from BrickLink (required)
      const partData = await fetchBlPart(ctx, {
        itemNo: partNumber,
        externalIds: { brickowlId, ldrawId, legoId },
      });

      // Save part data
      await ctx.runMutation(internal.catalog.parts.upsertPart, { data: partData });

      // Trigger promotion of inventory items waiting for this part
      await ctx.runMutation(internal.inventory.mutations.promoteItemsForPart, {
        partNumber,
      });

      // Continue to colors step
      await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
        partNumber,
        forceRefresh,
        onComplete,
        _step: "colors",
        _attempt: 1,
      });

      return { status: "scheduled" as const };
    }

    // ========================================================================
    // STEP: COLORS - Fetch part colors from BrickLink
    // ========================================================================
    if (_step === "colors") {
      // Check rate limit for BrickLink
      const token = await ctx.runMutation(internal.ratelimiter.consume.consumeToken, {
        bucket: "brickopsAdmin",
        provider: "bricklink",
      });

      if (!token.ok) {
        if (_attempt >= MAX_RETRIES) {
          throw new Error(
            `Failed to ensure colors for ${partNumber}: rate limit exceeded after ${MAX_RETRIES} attempts`,
          );
        }
        await ctx.scheduler.runAfter(token.retryAfter, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "colors",
          _attempt: _attempt + 1,
        });
        return { status: "scheduled" as const };
      }

      // Fetch part colors from BrickLink
      const partColorsData = await fetchBlPartColors(ctx, { itemNo: partNumber });

      // Save part colors
      await ctx.runMutation(internal.catalog.colors.upsertPartColors, {
        data: partColorsData,
      });

      // Continue to prices step
      await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
        partNumber,
        forceRefresh,
        onComplete,
        _step: "prices",
        _priceColorOffset: 0,
        _attempt: 1,
      });

      return { status: "scheduled" as const };
    }

    // ========================================================================
    // STEP: PRICES - Fetch price guides for each color (batched)
    // ========================================================================
    if (_step === "prices") {
      // Get current state to find which colors need prices
      const status = await ctx.runQuery(internal.catalog.ensure.getPartFreshnessStatus, {
        partNumber,
        forceRefresh,
      });

      const colorIds = status.colorIdsNeedingPrices;

      // No colors need prices - we're done!
      if (colorIds.length === 0 || _priceColorOffset >= colorIds.length) {
        // Fire onComplete if provided
        if (onComplete) {
          await scheduleCallback(ctx, onComplete.action, onComplete.args);
        }
        return { status: "complete" as const };
      }

      // Get batch of colors to process
      const batch = colorIds.slice(_priceColorOffset, _priceColorOffset + PRICE_BATCH_SIZE);

      // Process each color in the batch
      for (const colorId of batch) {
        // Check rate limit for each price fetch
        const token = await ctx.runMutation(internal.ratelimiter.consume.consumeToken, {
          bucket: "brickopsAdmin",
          provider: "bricklink",
        });

        if (!token.ok) {
          if (_attempt >= MAX_RETRIES) {
            // Log warning but continue with other colors
            console.warn(
              `[ensureCatalogPart] Rate limit exceeded for prices of ${partNumber}:${colorId}, skipping`,
            );
            continue;
          }
          // Schedule retry for remaining colors
          await ctx.scheduler.runAfter(
            token.retryAfter,
            internal.catalog.ensure.ensureCatalogPart,
            {
              partNumber,
              forceRefresh,
              onComplete,
              _step: "prices",
              _priceColorOffset,
              _attempt: _attempt + 1,
            },
          );
          return { status: "scheduled" as const };
        }

        try {
          // Fetch price guide from BrickLink
          const priceGuides = await fetchBlPriceGuide(ctx, {
            itemNo: partNumber,
            colorId,
          });

          // Upsert all 4 price guide variants
          const prices: PriceGuideRecord[] = [
            priceGuides.newStock,
            priceGuides.newSold,
            priceGuides.usedStock,
            priceGuides.usedSold,
          ];

          await ctx.runMutation(internal.catalog.prices.upsertPriceGuide, { prices });
        } catch (error) {
          // Log error but continue with other colors
          console.warn(
            `[ensureCatalogPart] Failed to fetch prices for ${partNumber}:${colorId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      // More colors to process? Schedule next batch
      const nextOffset = _priceColorOffset + PRICE_BATCH_SIZE;
      if (nextOffset < colorIds.length) {
        await ctx.scheduler.runAfter(0, internal.catalog.ensure.ensureCatalogPart, {
          partNumber,
          forceRefresh,
          onComplete,
          _step: "prices",
          _priceColorOffset: nextOffset,
          _attempt: 1,
        });
        return { status: "scheduled" as const };
      }

      // All done! Fire onComplete if provided
      if (onComplete) {
        await scheduleCallback(ctx, onComplete.action, onComplete.args);
      }

      return { status: "complete" as const };
    }

    // Shouldn't reach here
    throw new Error(`Unknown step: ${_step}`);
  },
});
