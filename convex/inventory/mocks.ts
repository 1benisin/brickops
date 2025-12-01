/**
 * Development-only inventory testing utilities
 * Provides functions to generate mock inventory and manage test data
 *
 * IMPORTANT: Only available in development/staging environments
 */

import { ConvexError, v } from "convex/values";
import { mutation, query, action, internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";
import { requireUser } from "./helpers";
import { requireActiveUser } from "../users/authorization";
import { now, getNextSeqForItem, enqueueMarketplaceSync, ensureBrickowlIdForPart } from "./helpers";

/**
 * Check if we're in development mode
 */
function isDevelopmentMode(): boolean {
  // Check for Convex dev deployment or local development
  const deploymentName = process.env.CONVEX_DEPLOYMENT;
  return (
    !deploymentName || deploymentName.startsWith("dev:") || deploymentName.includes("development")
  );
}

/**
 * Helper function to generate location codes (A1-Z9 pattern)
 */
function generateLocations(): string[] {
  const locations: string[] = [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < letters.length; i++) {
    for (let j = 1; j <= 9; j++) {
      locations.push(`${letters[i]}${j}`);
    }
  }
  return locations;
}

/**
 * Create a single inventory item using the same business logic as addInventoryItem
 * This is a simplified version that duplicates the core logic for test purposes
 */
async function createInventoryItemWithLedger(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  userId: Id<"users">,
  itemData: {
    name: string;
    partNumber: string;
    colorId: string;
    location: string;
    quantityAvailable: number;
    quantityReserved: number;
    condition: "new" | "used";
    price?: number;
    note?: string;
  },
): Promise<Id<"inventoryItems">> {
  if (itemData.quantityAvailable < 0) {
    throw new ConvexError("Quantity available cannot be negative");
  }

  await ensureBrickowlIdForPart(ctx, itemData.partNumber);

  const timestamp = now();
  const document: Omit<Doc<"inventoryItems">, "_id" | "_creationTime"> = {
    businessAccountId,
    name: itemData.name,
    partNumber: itemData.partNumber,
    colorId: itemData.colorId,
    location: itemData.location,
    quantityAvailable: itemData.quantityAvailable,
    quantityReserved: itemData.quantityReserved ?? 0,
    condition: itemData.condition,
    price: itemData.price,
    note: itemData.note,
    createdByUserId: userId,
    marketplaceSync: {
      bricklink: {
        status: "pending",
        lastSyncAttempt: timestamp,
      },
      brickowl: {
        status: "pending",
        lastSyncAttempt: timestamp,
      },
    },
  };

  const id = await ctx.db.insert("inventoryItems", document);

  // Generate correlationId ONCE for both ledger and marketplace sync orchestration
  const correlationId = crypto.randomUUID();

  // Phase 1: Compute sequence fields
  const seq = await getNextSeqForItem(ctx.db, id);
  const preAvailable = 0; // New item, starting from 0
  const postAvailable = preAvailable + itemData.quantityAvailable;

  // Write to quantity ledger with sequence tracking
  await ctx.db.insert("inventoryQuantityLedger", {
    businessAccountId,
    itemId: id,
    timestamp,
    seq,
    preAvailable,
    postAvailable,
    deltaAvailable: itemData.quantityAvailable,
    reason: "initial_stock",
    source: "user",
    userId,
    correlationId,
  });

  // Write to location ledger
  await ctx.db.insert("inventoryLocationLedger", {
    businessAccountId,
    itemId: id,
    timestamp,
    fromLocation: undefined,
    toLocation: itemData.location,
    reason: "initial_stock",
    source: "user",
    userId,
    correlationId,
  });

  // Phase 2: Enqueue outbox messages for marketplace sync
  const currentSeq = seq;
  const outboxResults = await Promise.all(
    ["bricklink", "brickowl"].map(async (provider) => {
      const created = await enqueueMarketplaceSync(ctx, {
        businessAccountId,
        itemId: id,
        provider: provider as "bricklink" | "brickowl",
        kind: "create",
        lastSyncedSeq: 0, // New item, never synced
        currentSeq,
        correlationId,
      });
      return { provider, created };
    }),
  );

  // Phase 3: Update sync status based on whether outbox messages were created
  const hasAnyOutbox = outboxResults.some((r) => r.created);
  if (!hasAnyOutbox) {
    // No credentials configured or sync disabled, set to "disabled"
    await ctx.db.patch(id, {
      marketplaceSync: {
        bricklink: { status: "disabled", lastSyncAttempt: timestamp },
        brickowl: { status: "disabled", lastSyncAttempt: timestamp },
      },
    });
  }

  return id;
}

/**
 * Generate mock inventory items using random parts and colors from the catalog
 *
 * DEVELOPMENT ONLY: This mutation is only available in development environments.
 * It creates inventory items by:
 * 1. Selecting random parts from the catalog
 * 2. Finding valid colors for each part
 * 3. Generating sensible random values (location, quantity, price, condition)
 * 4. Using the same business logic as addInventoryItem to ensure proper ledger tracking
 */
export const generateMockInventoryItems = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    // Guard: only allow in development
    if (!isDevelopmentMode()) {
      throw new ConvexError("This mutation is only available in development environments");
    }

    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.count < 1 || args.count > 100) {
      throw new ConvexError("Count must be between 1 and 100");
    }

    // Get random parts from catalog (type=PART only)
    const allParts = await ctx.db
      .query("parts")
      .withIndex("by_type", (q) => q.eq("type", "PART"))
      .collect();

    if (allParts.length === 0) {
      throw new ConvexError("No parts found in catalog. Please sync catalog data first.");
    }

    const eligibleParts = allParts.filter((part) => Boolean(part.brickowlId));

    if (eligibleParts.length === 0) {
      throw new ConvexError(
        "No parts with BrickOwl mappings found in catalog. Please sync catalog data with BrickOwl IDs.",
      );
    }

    const locations = generateLocations();
    const created: string[] = [];
    const errors: string[] = [];
    const partColorCache = new Map<string, Array<Doc<"partColors">>>();

    let attempts = 0;
    const maxAttempts = args.count * 5;

    while (created.length < args.count && eligibleParts.length > 0 && attempts < maxAttempts) {
      attempts += 1;
      let itemData: {
        name: string;
        partNumber: string;
        colorId: string;
        location: string;
        quantityAvailable: number;
        quantityReserved: number;
        condition: "new" | "used";
        price?: number;
        notes?: string;
      } | null = null;
      try {
        // Pick random part
        const partIndex = Math.floor(Math.random() * eligibleParts.length);
        const part = eligibleParts[partIndex];

        // Get available colors for this part
        let partColors = partColorCache.get(part.no);
        if (!partColors) {
          partColors = await ctx.db
            .query("partColors")
            .withIndex("by_partNo", (q) => q.eq("partNo", part.no))
            .collect();
          partColorCache.set(part.no, partColors);
        }

        if (partColors.length === 0) {
          errors.push(`Attempt ${attempts}: No colors available for part ${part.no}`);
          // Remove this part from eligibility to avoid repeated failures
          eligibleParts.splice(partIndex, 1);
          continue;
        }

        // Pick random color
        const randomColor = partColors[Math.floor(Math.random() * partColors.length)];

        // Generate random values
        itemData = {
          name: part.name,
          partNumber: part.no,
          colorId: String(randomColor.colorId),
          location: locations[created.length % locations.length],
          quantityAvailable: Math.floor(Math.random() * 100) + 1, // 1-100
          quantityReserved: 0,
          condition: (Math.random() > 0.5 ? "new" : "used") as "new" | "used",
          price: parseFloat((Math.random() * 9.99 + 0.01).toFixed(2)), // $0.01-$10.00
          note: undefined, // Leave notes empty as specified
        };

        // Create item with proper ledger tracking
        const itemId = await createInventoryItemWithLedger(
          ctx,
          businessAccountId,
          user._id,
          itemData,
        );
        created.push(itemId);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : error instanceof ConvexError
              ? error.message
              : String(error);
        const errorDetails = error instanceof Error ? error.stack : undefined;
        const partInfo = itemData
          ? `${itemData.partNumber}/${itemData.colorId}`
          : "unknown/unknown";
        console.error(
          `Failed to create mock inventory item attempt ${attempts} (${partInfo}):`,
          errorMessage,
          errorDetails,
        );
        errors.push(`Attempt ${attempts} (${partInfo}): ${errorMessage}`);
      }
    }

    if (created.length < args.count) {
      errors.push(
        `Only ${created.length} of ${args.count} mock items were created. Not enough catalog parts with BrickOwl IDs and available colors.`,
      );
      if (eligibleParts.length === 0) {
        errors.push(
          "All remaining catalog parts are missing BrickOwl mappings. Please refresh catalog data with BrickOwl IDs.",
        );
      }
    }

    return {
      created: created.length,
      requested: args.count,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

/**
 * Internal mutation to delete marketplace outbox messages in batches using recursive scheduling
 * Processes one batch per execution and schedules the next batch if more items exist
 */
export const deleteMarketplaceOutboxMessages = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 1000;

    // Execute a single paginated query
    const cursor: string | null = args.cursor ?? null;
    const { page, continueCursor } = await ctx.db
      .query("marketplaceOutbox")
      .filter((q) => q.eq(q.field("businessAccountId"), args.businessAccountId))
      .paginate({ numItems: BATCH_SIZE, cursor });

    if (page.length === 0) {
      return { status: "complete" as const, count: 0 };
    }

    // Delete all items in the current batch
    await Promise.all(page.map((message) => ctx.db.delete(message._id)));

    // If there are more items, schedule the next batch
    if (continueCursor) {
      await ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteMarketplaceOutboxMessages, {
        businessAccountId: args.businessAccountId,
        cursor: continueCursor,
      });
      return { status: "processing" as const, count: page.length };
    }

    return { status: "complete" as const, count: page.length };
  },
});

/**
 * Internal mutation to delete inventory items in batches using recursive scheduling
 * Processes one batch per execution and schedules the next batch if more items exist
 */
export const deleteInventoryItemsInternal = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 1000;

    // Execute a single paginated query
    const cursor: string | null = args.cursor ?? null;
    const { page, continueCursor } = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .paginate({ numItems: BATCH_SIZE, cursor });

    if (page.length === 0) {
      return { status: "complete" as const, count: 0 };
    }

    // Delete all items in the current batch
    await Promise.all(page.map((item) => ctx.db.delete(item._id)));

    // If there are more items, schedule the next batch
    if (continueCursor) {
      await ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteInventoryItemsInternal, {
        businessAccountId: args.businessAccountId,
        cursor: continueCursor,
      });
      return { status: "processing" as const, count: page.length };
    }

    return { status: "complete" as const, count: page.length };
  },
});

/**
 * Internal mutation to delete quantity ledger entries in batches using recursive scheduling
 * Processes one batch per execution and schedules the next batch if more items exist
 */
export const deleteQuantityLedgerEntries = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 1000;

    // Execute a single paginated query
    const cursor: string | null = args.cursor ?? null;
    const { page, continueCursor } = await ctx.db
      .query("inventoryQuantityLedger")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .paginate({ numItems: BATCH_SIZE, cursor });

    if (page.length === 0) {
      return { status: "complete" as const, count: 0 };
    }

    // Delete all items in the current batch
    await Promise.all(page.map((entry) => ctx.db.delete(entry._id)));

    // If there are more items, schedule the next batch
    if (continueCursor) {
      await ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteQuantityLedgerEntries, {
        businessAccountId: args.businessAccountId,
        cursor: continueCursor,
      });
      return { status: "processing" as const, count: page.length };
    }

    return { status: "complete" as const, count: page.length };
  },
});

/**
 * Internal mutation to delete location ledger entries in batches using recursive scheduling
 * Processes one batch per execution and schedules the next batch if more items exist
 */
export const deleteLocationLedgerEntries = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 1000;

    // Execute a single paginated query
    const cursor: string | null = args.cursor ?? null;
    const { page, continueCursor } = await ctx.db
      .query("inventoryLocationLedger")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .paginate({ numItems: BATCH_SIZE, cursor });

    if (page.length === 0) {
      return { status: "complete" as const, count: 0 };
    }

    // Delete all items in the current batch
    await Promise.all(page.map((entry) => ctx.db.delete(entry._id)));

    // If there are more items, schedule the next batch
    if (continueCursor) {
      await ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteLocationLedgerEntries, {
        businessAccountId: args.businessAccountId,
        cursor: continueCursor,
      });
      return { status: "processing" as const, count: page.length };
    }

    return { status: "complete" as const, count: page.length };
  },
});

/**
 * Delete all inventory items for the current business account
 *
 * DEVELOPMENT ONLY: This action is only available in development environments.
 * Use with caution - this permanently deletes all inventory items and cannot be undone.
 *
 * This uses an action to schedule the first batch of each deletion process.
 * Each deletion function will recursively schedule itself until all items are deleted.
 */
export const deleteAllInventoryItems = action({
  args: {},
  handler: async (ctx): Promise<{ message: string }> => {
    // Guard: only allow in development
    if (!isDevelopmentMode()) {
      throw new ConvexError("This action is only available in development environments");
    }

    // Get user and business account (works with actions)
    const { businessAccountId } = await requireActiveUser(ctx);

    // Schedule the first batch of each deletion process
    // Each function will recursively schedule itself until completion
    await Promise.all([
      ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteMarketplaceOutboxMessages, {
        businessAccountId,
      }),
      ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteInventoryItemsInternal, {
        businessAccountId,
      }),
      ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteQuantityLedgerEntries, {
        businessAccountId,
      }),
      ctx.scheduler.runAfter(0, internal.inventory.mocks.deleteLocationLedgerEntries, {
        businessAccountId,
      }),
    ]);

    return {
      message:
        "Deletion process started in the background. All inventory items and related data will be deleted recursively.",
    };
  },
});

/**
 * Check if we're in a development environment (for UI to conditionally show dev tools)
 */
export const isDevelopmentEnvironment = query({
  args: {},
  handler: async () => {
    return isDevelopmentMode();
  },
});
