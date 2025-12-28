import { ConvexError, v } from "convex/values";
import { mutation, internalQuery, internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import type { WithoutSystemFields } from "convex/server";
import {
  now,
  requireUser,
  assertBusinessMembership,
  getNextSeqForItem,
  getCurrentAvailableFromLedger,
  getLastSyncedSeq,
  enqueueMarketplaceSync,
  shouldSyncInventoryToMarketplace,
} from "./helpers";
import { requireUserRole } from "../users/authorization";
import { ensurePartPlaceholder } from "../catalog/mutations";
import { isColorComplete } from "../catalog/helpers";
import {
  addInventoryItemArgs,
  addInventoryItemReturns,
  updateInventoryItemArgs,
  updateInventoryItemReturns,
  deleteInventoryItemArgs,
  deleteInventoryItemReturns,
} from "./validators";

/**
 * Helper function to update marketplaceSync status while preserving existing fields
 */
async function updateMarketplaceSyncStatus(
  ctx: { db: DatabaseReader },
  itemId: Id<"inventoryItems">,
  businessAccountId: Id<"businessAccounts">,
  status: "pending" | "syncing" | "synced" | "failed" | "disabled" = "pending",
): Promise<Partial<Doc<"inventoryItems">>> {
  // Get current item to preserve existing marketplace sync data
  const currentItem = await ctx.db.get(itemId);
  if (!currentItem) {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marketplaceSyncUpdates: any = currentItem.marketplaceSync
    ? { ...currentItem.marketplaceSync }
    : {};
  const timestamp = Date.now();

  const marketplaces = ["bricklink", "brickowl"] as const;

  await Promise.all(
    marketplaces.map(async (marketplace) => {
      const creds = await ctx.db
        .query("marketplaceCredentials")
        .withIndex("by_business_provider", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("provider", marketplace),
        )
        .first();

      if (creds?.isActive && creds?.syncEnabled) {
        // Preserve existing data for this provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingData = marketplaceSyncUpdates[marketplace] || {};
        marketplaceSyncUpdates[marketplace] = {
          ...existingData, // Preserve lotId, lastSyncedSeq, etc.
          status,
          lastSyncAttempt: timestamp,
        };
      }
    }),
  );

  return { marketplaceSync: marketplaceSyncUpdates };
}

export const addInventoryItem = mutation({
  args: addInventoryItemArgs,
  returns: addInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    // Ensure the catalog entry for this part exists (creates placeholder if missing)
    const part = await ensurePartPlaceholder(ctx, args.partNumber);

    // Check if the global color entry exists with BrickOwl mapping for BrickOwl sync
    // ColorId 0 means "Not Applicable" and doesn't need a global color entry
    const colorId = Number.parseInt(args.colorId, 10);
    let colorComplete = true;
    if (!Number.isNaN(colorId) && colorId !== 0) {
      const globalColor = await ctx.db
        .query("colors")
        .withIndex("by_colorId", (q) => q.eq("colorId", colorId))
        .first();
      colorComplete = isColorComplete(globalColor);
    }

    // TOTO - check for duplicate item going into same drawer
    // TODO - Similarity check: verify that other parts in the same location
    //        are not too similar to the part being added, to avoid pick errors.
    //        We'll use a similarity table in the inventory for this check.

    const timestamp = now();

    // Build marketplaceSync: use provided values as base, merge with defaults for missing providers
    const providedSync = args.marketplaceSync;
    const marketplaceSyncData: Doc<"inventoryItems">["marketplaceSync"] = {
      bricklink: {
        ...providedSync?.bricklink,
        status: providedSync?.bricklink?.status ?? "pending",
        lastSyncAttempt: providedSync?.bricklink?.lastSyncAttempt ?? timestamp,
      },
      brickowl: {
        ...providedSync?.brickowl,
        status: providedSync?.brickowl?.status ?? "pending",
        lastSyncAttempt: providedSync?.brickowl?.lastSyncAttempt ?? timestamp,
      },
    };

    // Determine lifecycle status based on part AND color completeness
    // Both part catalog data and global color (with BrickOwl mapping) must be complete
    const catalogComplete = part.status === "complete" && colorComplete;
    const lifecycleStatus = catalogComplete ? "ready_to_sync" : "awaiting_catalog";

    const document: WithoutSystemFields<Doc<"inventoryItems">> = {
      businessAccountId,
      name: args.name,
      partNumber: args.partNumber,
      colorId: args.colorId,
      location: args.location,
      quantityAvailable: args.quantityAvailable,
      quantityReserved: args.quantityReserved ?? 0,
      condition: args.condition,
      price: args.price,
      notes: args.notes,
      createdBy: user._id,
      // createdAt removed - using _creationTime
      // TODO - add tags
      marketplaceSync: marketplaceSyncData,
      lifecycleStatus,
    };

    const id = await ctx.db.insert("inventoryItems", document);

    // Generate correlationId ONCE for both ledger and marketplace sync orchestration (Critical Fix #21)
    const correlationId = crypto.randomUUID();

    // Phase 1: Compute sequence fields
    const seq = await getNextSeqForItem(ctx.db, id);
    const preAvailable = 0; // New item, starting from 0
    const postAvailable = preAvailable + args.quantityAvailable;

    // Write to quantity ledger with sequence tracking
    await ctx.db.insert("inventoryQuantityLedger", {
      businessAccountId,
      itemId: id,
      timestamp,
      seq,
      preAvailable,
      postAvailable,
      deltaAvailable: args.quantityAvailable,
      reason: "initial_stock",
      source: "user",
      userId: user._id,
      correlationId,
    });

    // Write to location ledger
    await ctx.db.insert("inventoryLocationLedger", {
      businessAccountId,
      itemId: id,
      timestamp,
      fromLocation: undefined,
      toLocation: args.location,
      reason: "initial_stock",
      source: "user",
      userId: user._id,
      correlationId,
    });

    // Phase 2: Check which providers should sync and enqueue messages
    const currentSeq = seq;
    const providers = ["bricklink", "brickowl"] as const;
    const enabledProviders = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        shouldSync: await shouldSyncInventoryToMarketplace(ctx.db, businessAccountId, provider),
      })),
    );

    // Enqueue sync for providers that should sync (ONLY if item is ready)
    if (document.lifecycleStatus === "ready_to_sync") {
      await Promise.all(
        enabledProviders
          .filter((p) => p.shouldSync)
          .map(async ({ provider }) => {
            await enqueueMarketplaceSync(ctx, {
              businessAccountId,
              itemId: id,
              provider,
              kind: "create",
              lastSyncedSeq: 0, // New item, never synced
              currentSeq,
              correlationId,
            });
          }),
      );
    }

    // Phase 3: Update sync status based on whether providers should sync
    // Set to "pending" for providers that were enqueued, "disabled" for providers that shouldn't sync
    // Preserve provided fields like lotId, lastSyncedSeq, lastSyncedAvailable from args.marketplaceSync
    // Respect provided "synced" status if provider should sync (e.g., from import)
    const syncStatusUpdates: Partial<Doc<"inventoryItems">>["marketplaceSync"] = {
      ...marketplaceSyncData,
    };
    let hasUpdates = false;
    for (const { provider, shouldSync } of enabledProviders) {
      hasUpdates = true;
      if (provider === "bricklink") {
        const providedStatus = marketplaceSyncData.bricklink?.status;
        // If provider should sync and provided status is "synced", preserve it; otherwise use shouldSync logic
        const newStatus =
          shouldSync && providedStatus === "synced"
            ? "synced"
            : shouldSync
              ? "pending"
              : "disabled";
        syncStatusUpdates.bricklink = {
          ...marketplaceSyncData.bricklink, // Preserve lotId, lastSyncedSeq, lastSyncedAvailable, etc.
          status: newStatus,
          lastSyncAttempt: timestamp,
        };
      } else {
        const providedStatus = marketplaceSyncData.brickowl?.status;
        // If provider should sync and provided status is "synced", preserve it; otherwise use shouldSync logic
        const newStatus =
          shouldSync && providedStatus === "synced"
            ? "synced"
            : shouldSync
              ? "pending"
              : "disabled";
        syncStatusUpdates.brickowl = {
          ...marketplaceSyncData.brickowl, // Preserve lotId, lastSyncedSeq, lastSyncedAvailable, etc.
          status: newStatus,
          lastSyncAttempt: timestamp,
        };
      }
    }

    if (hasUpdates) {
      await ctx.db.patch(id, {
        marketplaceSync: syncStatusUpdates,
      });
    }

    return id;
  },
});

export const updateInventoryItem = mutation({
  args: updateInventoryItemArgs,
  returns: updateInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUserRole(ctx, "owner");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);

    const nextAvailable = args.quantityAvailable ?? item.quantityAvailable;
    const nextReserved = args.quantityReserved ?? item.quantityReserved ?? 0;
    if (nextAvailable < 0 || nextReserved < 0) {
      throw new ConvexError("Quantities cannot be negative");
    }

    const total = nextAvailable + nextReserved;
    if (!Number.isFinite(total)) {
      throw new ConvexError("Invalid quantity values");
    }

    // Capture previous state for potential rollback

    const timestamp = now();
    const updates: Partial<Doc<"inventoryItems">> & { updatedAt: number } = {
      updatedAt: timestamp,
    };
    (["name", "partNumber", "colorId", "location", "condition", "price", "notes"] as const).forEach(
      (key) => {
        if (args[key] !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (updates as any)[key] = args[key] as unknown;
        }
      },
    );
    if (args.quantityAvailable !== undefined) updates.quantityAvailable = nextAvailable;
    if (args.quantityReserved !== undefined) updates.quantityReserved = nextReserved;

    // Calculate deltas BEFORE patching (Critical Fix #5)
    const oldAvailable = item.quantityAvailable;
    const newAvailable = args.quantityAvailable ?? oldAvailable;
    const deltaAvailable = newAvailable - oldAvailable;

    // Validate projected quantity won't go negative (Critical Fix #5)
    const projectedTotal = oldAvailable + deltaAvailable;
    if (projectedTotal < 0) {
      throw new ConvexError("Delta would result in negative quantity");
    }

    // Get old location for location ledger
    const oldLocation = item.location;
    const newLocation = args.location ?? oldLocation;
    const locationChanged = newLocation !== oldLocation;

    await ctx.db.patch(args.itemId, updates);

    // Generate correlationId ONCE for both ledger and outbox
    const correlationId = args.correlationId ?? crypto.randomUUID();

    // Write to quantity ledger (only if quantity changed)
    if (deltaAvailable !== 0) {
      // Phase 1: Compute sequence fields
      const seq = await getNextSeqForItem(ctx.db, args.itemId);
      const preAvailable = await getCurrentAvailableFromLedger(ctx.db, args.itemId);
      const postAvailable = preAvailable + deltaAvailable;

      await ctx.db.insert("inventoryQuantityLedger", {
        businessAccountId: item.businessAccountId,
        itemId: args.itemId,
        timestamp,
        seq,
        preAvailable,
        postAvailable,
        deltaAvailable,
        reason: "manual_adjustment" as const,
        source: "user" as const,
        userId: user._id,
        correlationId,
      });

      // Phase 2: Enqueue outbox messages for marketplace sync
      // Filter providers to only sync-enabled ones before enqueueing
      const currentSeq = seq;
      const providers = ["bricklink", "brickowl"] as const;
      const enabledProviders = await Promise.all(
        providers.map(async (provider) => ({
          provider,
          shouldSync: await shouldSyncInventoryToMarketplace(
            ctx.db,
            item.businessAccountId,
            provider,
          ),
        })),
      );

      await Promise.all(
        enabledProviders
          .filter((p) => p.shouldSync)
          .map(async ({ provider }) => {
            const lastSyncedSeq = await getLastSyncedSeq(ctx.db, args.itemId, provider);

            await enqueueMarketplaceSync(ctx, {
              businessAccountId: item.businessAccountId,
              itemId: args.itemId,
              provider,
              kind: "update",
              lastSyncedSeq,
              currentSeq,
              correlationId,
            });
          }),
      );

      // Update sync status based on enabled providers
      // Set to "pending" for providers that were enqueued, "disabled" for providers that shouldn't sync
      const syncStatusUpdates: Partial<Doc<"inventoryItems">>["marketplaceSync"] = {
        ...item.marketplaceSync,
      };
      let hasUpdates = false;
      for (const { provider, shouldSync } of enabledProviders) {
        hasUpdates = true;
        if (provider === "bricklink") {
          syncStatusUpdates.bricklink = {
            status: shouldSync ? "pending" : "disabled",
            lastSyncAttempt: timestamp,
            ...item.marketplaceSync?.bricklink,
          };
        } else {
          syncStatusUpdates.brickowl = {
            status: shouldSync ? "pending" : "disabled",
            lastSyncAttempt: timestamp,
            ...item.marketplaceSync?.brickowl,
          };
        }
      }

      if (hasUpdates) {
        await ctx.db.patch(args.itemId, {
          marketplaceSync: syncStatusUpdates,
        });
      }
    }

    // Write to location ledger (only if changed) (Critical Fix #10)
    if (locationChanged) {
      await ctx.db.insert("inventoryLocationLedger", {
        businessAccountId: item.businessAccountId,
        itemId: args.itemId,
        timestamp,
        fromLocation: oldLocation,
        toLocation: newLocation,
        reason: args.reason ?? "manual_move",
        source: "user",
        userId: user._id,
        correlationId,
      });
    }

    // Set sync status to "pending" for enabled marketplaces
    // Now preserves existing data (lotId, lastSyncedSeq, etc.) automatically
    const marketplaceSyncUpdates = await updateMarketplaceSyncStatus(
      ctx,
      args.itemId,
      item.businessAccountId,
      "pending",
    );

    // Update inventory item with syncing status
    await ctx.db.patch(args.itemId, marketplaceSyncUpdates);

    // Phase 3: Worker now handles all sync operations via outbox
    // No immediate sync - worker will process outbox message within 30 seconds

    return { itemId: args.itemId };
  },
});

export const deleteInventoryItem = mutation({
  args: deleteInventoryItemArgs,
  returns: deleteInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUserRole(ctx, "owner");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);

    // Capture previous state for potential rollback

    const timestamp = now();
    await ctx.db.patch(args.itemId, {
      isArchived: true,
      deletedAt: timestamp,
      updatedAt: timestamp,
    });

    // Generate correlationId ONCE for both ledger and immediateSync
    const correlationId = crypto.randomUUID();

    // Phase 1: Compute sequence fields for deletion
    const seq = await getNextSeqForItem(ctx.db, args.itemId);
    const preAvailable = await getCurrentAvailableFromLedger(ctx.db, args.itemId);
    const postAvailable = 0; // Deleted items have 0 quantity

    // Write to quantity ledger to reflect deletion
    await ctx.db.insert("inventoryQuantityLedger", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      seq,
      preAvailable,
      postAvailable,
      deltaAvailable: -item.quantityAvailable, // Negative to reflect deletion
      reason: "item_deleted" as const,
      source: "user" as const,
      userId: user._id,
      correlationId,
    });

    // Phase 2: Enqueue outbox messages for marketplace sync
    // Filter providers to only sync-enabled ones before enqueueing
    const currentSeq = seq;
    const providers = ["bricklink", "brickowl"] as const;
    const enabledProviders = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        shouldSync: await shouldSyncInventoryToMarketplace(
          ctx.db,
          item.businessAccountId,
          provider,
        ),
      })),
    );

    await Promise.all(
      enabledProviders
        .filter((p) => p.shouldSync)
        .map(async ({ provider }) => {
          const lastSyncedSeq = await getLastSyncedSeq(ctx.db, args.itemId, provider);

          await enqueueMarketplaceSync(ctx, {
            businessAccountId: item.businessAccountId,
            itemId: args.itemId,
            provider,
            kind: "delete",
            lastSyncedSeq,
            currentSeq,
            correlationId,
          });
        }),
    );

    // Update sync status based on enabled providers
    // Set to "pending" for providers that were enqueued, "disabled" for providers that shouldn't sync
    const syncStatusUpdates: Partial<Doc<"inventoryItems">>["marketplaceSync"] = {
      ...item.marketplaceSync,
    };
    let hasUpdates = false;
    for (const { provider, shouldSync } of enabledProviders) {
      hasUpdates = true;
      if (provider === "bricklink") {
        syncStatusUpdates.bricklink = {
          status: shouldSync ? "pending" : "disabled",
          lastSyncAttempt: timestamp,
          ...item.marketplaceSync?.bricklink,
        };
      } else {
        syncStatusUpdates.brickowl = {
          status: shouldSync ? "pending" : "disabled",
          lastSyncAttempt: timestamp,
          ...item.marketplaceSync?.brickowl,
        };
      }
    }

    if (hasUpdates) {
      await ctx.db.patch(args.itemId, {
        marketplaceSync: syncStatusUpdates,
      });
    }

    // Write to location ledger to track final location (Critical Fix #10)
    await ctx.db.insert("inventoryLocationLedger", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      fromLocation: item.location,
      toLocation: "DELETED",
      reason: args.reason ?? "item_deleted",
      source: "user",
      userId: user._id,
      correlationId,
    });

    // Set sync status to "pending" for enabled marketplaces
    // Now preserves existing data (lotId, lastSyncedSeq, etc.) automatically
    const marketplaceSyncUpdates = await updateMarketplaceSyncStatus(
      ctx,
      args.itemId,
      item.businessAccountId,
      "pending",
    );

    // Update inventory item with syncing status
    await ctx.db.patch(args.itemId, marketplaceSyncUpdates);

    // Phase 3: Worker now handles all sync operations via outbox
    // No immediate sync - worker will process outbox message within 30 seconds

    return { itemId: args.itemId, archived: true };
  },
});

/**
 * Promote inventory items for a specific part once catalog enrichment is complete.
 * This is called by the catalog worker after ensureCatalogPart completes.
 * Only promotes items where both part AND color data are ready.
 */
export const promoteItemsForPart = internalMutation({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Find all items awaiting catalog data for this part
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_partNumber_lifecycleStatus", (q) =>
        q.eq("partNumber", args.partNumber).eq("lifecycleStatus", "awaiting_catalog"),
      )
      .collect();

    if (items.length === 0) return;

    console.log(`[Promotion] Checking ${items.length} items for part ${args.partNumber}`);

    let promotedCount = 0;
    for (const item of items) {
      // Check if the color is also complete (has BrickOwl mapping)
      // ColorId 0 means "Not Applicable" and doesn't need a global color entry
      const colorId = Number.parseInt(item.colorId, 10);
      let colorComplete = true;
      if (!Number.isNaN(colorId) && colorId !== 0) {
        const globalColor = await ctx.db
          .query("colors")
          .withIndex("by_colorId", (q) => q.eq("colorId", colorId))
          .first();
        colorComplete = isColorComplete(globalColor);
      }

      // Skip items where color data is not yet complete
      if (!colorComplete) {
        console.log(
          `[Promotion] Skipping item ${item._id} - color ${item.colorId} not complete yet`,
        );
        continue;
      }

      const timestamp = Date.now();
      const correlationId = crypto.randomUUID();

      // 1. Update status to ready_to_sync
      await ctx.db.patch(item._id, {
        lifecycleStatus: "ready_to_sync",
        updatedAt: timestamp,
      });
      promotedCount++;

      // 2. Enqueue marketplace sync for enabled providers
      const providers = ["bricklink", "brickowl"] as const;
      const enabledProviders = await Promise.all(
        providers.map(async (provider) => ({
          provider,
          shouldSync: await shouldSyncInventoryToMarketplace(
            ctx.db,
            item.businessAccountId,
            provider,
          ),
        })),
      );

      // Get current sequence for this item
      const lastLedgerEntry = await ctx.db
        .query("inventoryQuantityLedger")
        .withIndex("by_item_seq", (q) => q.eq("itemId", item._id))
        .order("desc")
        .first();
      const currentSeq = lastLedgerEntry?.seq ?? 1;

      await Promise.all(
        enabledProviders
          .filter((p) => p.shouldSync)
          .map(async ({ provider }) => {
            const lastSyncedSeq = await getLastSyncedSeq(ctx.db, item._id, provider);

            await enqueueMarketplaceSync(ctx, {
              businessAccountId: item.businessAccountId,
              itemId: item._id,
              provider,
              kind: "create", // Treat as create since it was never synced
              lastSyncedSeq,
              currentSeq,
              correlationId,
            });
          }),
      );
    }

    if (promotedCount > 0) {
      console.log(
        `[Promotion] Promoted ${promotedCount}/${items.length} items for part ${args.partNumber}`,
      );
    }
  },
});

// ============================================================================
// INTERNAL FUNCTIONS (from internal.ts)
// Used by immediateSync action (Story 3.6)
// ============================================================================

/**
 * Get an inventory item by ID (internal query for actions)
 */
export const getInventoryItem = internalQuery({
  args: { itemId: v.id("inventoryItems") },
  returns: v.any(),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error(`Inventory item not found: ${itemId}`);
    }
    return item;
  },
});
