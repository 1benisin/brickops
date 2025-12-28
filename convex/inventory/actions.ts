/**
 * Inventory Actions - Action-based flows for inventory operations
 *
 * This module provides action-based alternatives to mutations for cases
 * where blocking behavior is preferred (e.g., waiting for catalog data
 * to be complete before returning to the caller).
 *
 * The action-based flow uses the continuation pattern from
 * ideal-architecture-patterns.md.
 */

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { addInventoryItemArgs, itemCondition, marketplaceSync } from "./validators";

// ============================================================================
// TYPES
// ============================================================================

type AddWithCatalogResult =
  | { status: "complete"; itemId: Id<"inventoryItems"> }
  | { status: "pending_catalog"; itemId: Id<"inventoryItems">; message: string };

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Add an inventory item with catalog completeness checking.
 *
 * This action-based flow:
 * 1. Creates the inventory item immediately (may be in awaiting_catalog status)
 * 2. Ensures catalog data (part + colors) is complete via ensureCatalogPart
 * 3. Returns status indicating whether catalog is complete or pending
 *
 * Unlike the mutation-based flow, this ensures ensureCatalogPart is triggered
 * synchronously rather than relying on background processing.
 *
 * @example
 * // Using the action-based flow
 * const result = await ctx.runAction(api.inventory.actions.addInventoryItemWithCatalog, {
 *   name: "2x4 Brick",
 *   partNumber: "3001",
 *   colorId: "11",
 *   location: "A1",
 *   quantityAvailable: 10,
 *   condition: "new",
 * });
 *
 * if (result.status === "complete") {
 *   console.log("Item ready for marketplace sync:", result.itemId);
 * } else {
 *   console.log("Item created, catalog data loading:", result.itemId);
 * }
 */
export const addInventoryItemWithCatalog = action({
  args: addInventoryItemArgs,
  handler: async (ctx, args): Promise<AddWithCatalogResult> => {
    // Step 1: Create the inventory item via the mutation
    // This will set lifecycleStatus based on current catalog completeness
    const itemId = await ctx.runMutation(api.inventory.mutations.addInventoryItem, args);

    // Step 2: Trigger ensureCatalogPart to fetch/refresh catalog data
    // This ensures catalog data is being fetched even if part already exists
    try {
      const result = await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
        partNumber: args.partNumber,
      });

      if (result.status === "complete") {
        // Catalog data is already complete - item should be ready_to_sync
        return { status: "complete", itemId };
      }

      // Catalog data is being fetched - item will be promoted when ready
      return {
        status: "pending_catalog",
        itemId,
        message: "Catalog data is being fetched. Item will be synced once complete.",
      };
    } catch (error) {
      // Catalog fetch failed - item was still created, just waiting for catalog
      console.warn(
        `[addInventoryItemWithCatalog] Failed to ensure catalog for ${args.partNumber}:`,
        error instanceof Error ? error.message : String(error),
      );
      return {
        status: "pending_catalog",
        itemId,
        message: "Catalog data fetch failed. Will retry automatically.",
      };
    }
  },
});

/**
 * Add an inventory item and wait for catalog completeness.
 *
 * This is a more strict version that:
 * 1. Checks if catalog data is complete BEFORE creating the item
 * 2. If not complete, triggers ensureCatalogPart and returns pending status
 * 3. Item is only created after catalog is ready (via continuation)
 *
 * Note: This uses the continuation pattern internally. The item creation
 * is scheduled to happen after ensureCatalogPart completes.
 *
 * @example
 * const result = await ctx.runAction(api.inventory.actions.addInventoryItemStrict, {
 *   name: "2x4 Brick",
 *   partNumber: "3001",
 *   colorId: "11",
 *   // ... other fields
 * });
 *
 * if (result.status === "pending") {
 *   // Item will be created once catalog is ready
 *   console.log("Waiting for catalog data...");
 * } else {
 *   console.log("Item created with complete catalog:", result.itemId);
 * }
 */
export const addInventoryItemStrict = action({
  args: {
    ...addInventoryItemArgs.fields,
    // Allow overriding for testing
    _skipCatalogWait: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { status: "complete"; itemId: Id<"inventoryItems"> }
    | { status: "pending"; message: string }
  > => {
    const { _skipCatalogWait = false, ...inventoryArgs } = args;

    // Skip catalog wait if requested (for testing)
    if (_skipCatalogWait) {
      const itemId = await ctx.runMutation(api.inventory.mutations.addInventoryItem, inventoryArgs);
      return { status: "complete", itemId };
    }

    // Step 1: Check if catalog data is complete
    const freshnessStatus = await ctx.runQuery(internal.catalog.ensure.getPartFreshnessStatus, {
      partNumber: args.partNumber,
    });

    // Step 2: Also check if the specific color is complete
    const colorId = Number.parseInt(args.colorId, 10);
    let colorComplete = true;
    if (!Number.isNaN(colorId) && colorId !== 0) {
      const colorStatus = await ctx.runQuery(internal.catalog.ensure.getColorFreshnessStatus, {
        colorId,
      });
      colorComplete = colorStatus.isComplete;
    }

    const catalogComplete = freshnessStatus.allFresh && colorComplete;

    if (catalogComplete) {
      // Catalog is ready - create item immediately
      const itemId = await ctx.runMutation(api.inventory.mutations.addInventoryItem, inventoryArgs);
      return { status: "complete", itemId };
    }

    // Catalog is not ready - create item (will be in awaiting_catalog status)
    // and trigger catalog fetch
    const itemId = await ctx.runMutation(api.inventory.mutations.addInventoryItem, inventoryArgs);

    // Trigger catalog fetch - item will be promoted when complete
    await ctx.runAction(internal.catalog.ensure.ensureCatalogPart, {
      partNumber: args.partNumber,
    });

    return {
      status: "pending",
      message:
        "Item created in awaiting_catalog status. Will be ready for sync once catalog data is fetched.",
    };
  },
});

