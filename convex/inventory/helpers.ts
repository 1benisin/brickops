import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, DatabaseReader, DatabaseWriter } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * Helper to get current timestamp
 */
export const now = () => Date.now();

/**
 * Require authenticated and active user with business account
 * Helper function - not a Convex function
 * Returns user with guaranteed businessAccountId
 */
export async function requireUser(
  ctx: Ctx,
): Promise<{ userId: Id<"users">; user: Doc<"users">; businessAccountId: Id<"businessAccounts"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("Authenticated user not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  return { userId, user, businessAccountId: user.businessAccountId };
}

/**
 * Assert that user belongs to the specified business account
 * Helper function - not a Convex function
 */
export function assertBusinessMembership(user: Doc<"users">, businessAccountId: string) {
  if (user.businessAccountId !== businessAccountId) {
    throw new ConvexError("User cannot modify another business account");
  }
}

/**
 * Require user has owner role
 * Helper function - not a Convex function
 */
export function requireOwnerRole(user: Doc<"users">) {
  if (user.role !== "owner") {
    throw new ConvexError("Only business account owners can manage inventory");
  }
}

/**
 * Phase 1: Sequence tracking helpers
 */

/**
 * Get the next sequence number for an item
 * Returns 1 for the first entry, then increments
 */
export async function getNextSeqForItem(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<number> {
  const lastEntry = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();

  return lastEntry ? lastEntry.seq + 1 : 1;
}

/**
 * Get the current available quantity from latest ledger entry
 * Falls back to 0 if no ledger entries exist
 */
export async function getCurrentAvailableFromLedger(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
): Promise<number> {
  const lastEntry = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) => q.eq("itemId", itemId))
    .order("desc")
    .first();

  return lastEntry?.postAvailable ?? 0;
}

/**
 * Phase 2: Outbox and delta computation helpers
 */

/**
 * Get the lastSyncedSeq for a provider (defaults to 0 if never synced)
 */
export async function getLastSyncedSeq(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  provider: "bricklink" | "brickowl",
): Promise<number> {
  const item = await db.get(itemId);
  if (!item) throw new Error("Item not found");

  const cursor = item.marketplaceSync?.[provider]?.lastSyncedSeq;
  return cursor ?? 0;
}

/**
 * Compute delta for a ledger sequence window
 * Returns sum of deltaAvailable for entries in range (fromSeqExclusive, toSeqInclusive]
 */
export async function computeDeltaFromWindow(
  db: DatabaseReader,
  itemId: Id<"inventoryItems">,
  fromSeqExclusive: number,
  toSeqInclusive: number,
): Promise<number> {
  const entries = await db
    .query("inventoryQuantityLedger")
    .withIndex("by_item_seq", (q) =>
      q.eq("itemId", itemId).gt("seq", fromSeqExclusive).lte("seq", toSeqInclusive),
    )
    .collect();

  return entries.reduce((acc, entry) => acc + entry.deltaAvailable, 0);
}

/**
 * Enqueue a marketplace sync operation in the outbox
 * Call this after writing to the ledger to ensure transactional consistency
 */
/**
 * Enqueue a marketplace sync operation in the outbox
 * Returns whether an outbox message was created (useful for determining sync status)
 */
export async function enqueueMarketplaceSync(
  ctx: { db: DatabaseWriter },
  args: {
    businessAccountId: Id<"businessAccounts">;
    itemId: Id<"inventoryItems">;
    provider: "bricklink" | "brickowl";
    kind: "create" | "update" | "delete";
    lastSyncedSeq: number;
    currentSeq: number;
    correlationId: string;
  },
): Promise<boolean> {
  // Check if credentials exist for this provider
  const creds = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
    )
    .first();

  // Check if credentials are active and sync enabled (default syncEnabled to true if not set)
  const syncEnabled = creds?.syncEnabled ?? true;

  if (!creds?.isActive || !syncEnabled) {
    console.log(
      `Skipping outbox for ${args.provider}: isActive=${creds?.isActive}, syncEnabled=${syncEnabled}`,
    );
    return false; // No sync needed if credentials not available or disabled
  }

  const idempotencyKey = `${args.itemId}:${args.provider}:${args.lastSyncedSeq}-${args.currentSeq}`;

  await ctx.db.insert("marketplaceOutbox", {
    businessAccountId: args.businessAccountId,
    itemId: args.itemId,
    provider: args.provider,
    kind: args.kind,
    fromSeqExclusive: args.lastSyncedSeq,
    toSeqInclusive: args.currentSeq,
    idempotencyKey,
    status: "pending",
    attempt: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
    correlationId: args.correlationId,
  });

  return true; // Outbox message created successfully
}
