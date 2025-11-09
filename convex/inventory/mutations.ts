import { ConvexError, v } from "convex/values";
import { mutation, internalQuery } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import {
  now,
  requireUser,
  assertBusinessMembership,
  requireOwnerRole,
  getNextSeqForItem,
  getCurrentAvailableFromLedger,
  getLastSyncedSeq,
  enqueueMarketplaceSync,
  ensureBrickowlIdForPart,
} from "./helpers";
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
  status: "pending" | "syncing" | "synced" | "failed" = "pending",
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

    // Ensure the catalog entry for this part has a BrickOwl identifier (or an explicit placeholder).
    await ensureBrickowlIdForPart(ctx, args.partNumber);

    // TOTO - check for duplicate item going into same drawer
    // TODO - Similarity check: verify that other parts in the same location
    //        are not too similar to the part being added, to avoid pick errors.
    //        We'll use a similarity table in the inventory for this check.

    const timestamp = now();
    const document: Omit<Doc<"inventoryItems">, "_id" | "_creationTime"> = {
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
      createdAt: timestamp,
      // TODO - add tags
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
    // Only set to "syncing" if we have credentials configured
    const hasAnyOutbox = outboxResults.some((r) => r.created);
    if (!hasAnyOutbox) {
      // No credentials configured, set to "synced" (no sync needed)
      await ctx.db.patch(id, {
        marketplaceSync: {
          bricklink: { status: "synced", lastSyncAttempt: timestamp },
          brickowl: { status: "synced", lastSyncAttempt: timestamp },
        },
      });
    }
    // If outbox messages were created, status remains "pending" and worker will handle it

    return id;
  },
});

export const updateInventoryItem = mutation({
  args: updateInventoryItemArgs,
  returns: updateInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user); // AC: 3.4.1 - owner role required

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
      const currentSeq = seq;
      const outboxResults = await Promise.all(
        ["bricklink", "brickowl"].map(async (provider) => {
          const lastSyncedSeq = await getLastSyncedSeq(
            ctx.db,
            args.itemId,
            provider as "bricklink" | "brickowl",
          );

          const created = await enqueueMarketplaceSync(ctx, {
            businessAccountId: item.businessAccountId,
            itemId: args.itemId,
            provider: provider as "bricklink" | "brickowl",
            kind: "update",
            lastSyncedSeq,
            currentSeq,
            correlationId,
          });
          return { provider, created };
        }),
      );

      // Update sync status based on whether outbox messages were created
      const hasAnyOutbox = outboxResults.some(
        (r: { provider: string; created: boolean }) => r.created,
      );
      if (!hasAnyOutbox) {
        // Gate: Mark as synced if no credentials configured
        await ctx.db.patch(args.itemId, {
          marketplaceSync: {
            ...item.marketplaceSync,
            bricklink: {
              status: "synced",
              lastSyncAttempt: timestamp,
              ...item.marketplaceSync?.bricklink,
            },
            brickowl: {
              status: "synced",
              lastSyncAttempt: timestamp,
              ...item.marketplaceSync?.brickowl,
            },
          },
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
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user); // AC: 3.4.1 - owner role required

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
    const currentSeq = seq;
    const outboxResults = await Promise.all(
      ["bricklink", "brickowl"].map(async (provider) => {
        const lastSyncedSeq = await getLastSyncedSeq(
          ctx.db,
          args.itemId,
          provider as "bricklink" | "brickowl",
        );

        const created = await enqueueMarketplaceSync(ctx, {
          businessAccountId: item.businessAccountId,
          itemId: args.itemId,
          provider: provider as "bricklink" | "brickowl",
          kind: "delete",
          lastSyncedSeq,
          currentSeq,
          correlationId,
        });
        return { provider, created };
      }),
    );

    // Update sync status based on whether outbox messages were created
    const hasAnyOutbox = outboxResults.some((r) => r.created);
    if (!hasAnyOutbox) {
      // Gate: Mark as synced if no credentials configured
      await ctx.db.patch(args.itemId, {
        marketplaceSync: {
          ...item.marketplaceSync,
          bricklink: {
            status: "synced",
            lastSyncAttempt: timestamp,
            ...item.marketplaceSync?.bricklink,
          },
          brickowl: {
            status: "synced",
            lastSyncAttempt: timestamp,
            ...item.marketplaceSync?.brickowl,
          },
        },
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
