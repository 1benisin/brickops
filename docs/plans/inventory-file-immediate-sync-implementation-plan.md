# Inventory Immediate Sync Implementation Plan

## Overview

This plan outlines the changes needed to modify inventory sync behavior from batch processing (via sync queue) to immediate sync when inventory items are added, updated, or deleted. Instead of adding changes to the `inventorySyncQueue` table, we will immediately sync changes to marketplaces where sync is enabled.

## Current Behavior

Currently, when inventory items are created, updated, or deleted:

1. The change is added to the `inventorySyncQueue` table with `syncStatus: "pending"`
2. A cron job runs every 5 minutes to process pending changes
3. The sync orchestration (`convex/inventory/sync.ts`) processes changes in batches
4. Changes are synced to configured marketplaces (BrickLink/BrickOwl)

## Target Behavior

After implementation:

1. When inventory items are created, updated, or deleted, immediately sync to enabled marketplaces
2. No changes are added to the `inventorySyncQueue` table
3. Sync status is updated directly on the inventory item
4. Error handling and retry logic remains similar but happens immediately

## Implementation Plan

### Phase 1: Create Immediate Sync Functions

#### 1.1 Create `convex/inventory/immediateSync.ts`

Create a new file with functions to handle immediate syncing:

```typescript
// convex/inventory/immediateSync.ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { createBricklinkStoreClient, createBrickOwlStoreClient } from "../marketplace/helpers";
import { recordMetric } from "../lib/external/metrics";
import { mapConvexToBricklinkCreate } from "../bricklink/storeMappers";
import { mapConvexToBrickOwlCreate } from "../brickowl/storeMappers";

/**
 * Immediately sync an inventory change to all enabled marketplaces
 */
export const syncInventoryChangeImmediately = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
    inventoryItemId: v.id("inventoryItems"),
    changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    newData: v.optional(v.any()),
    previousData: v.optional(v.any()),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get configured providers
    const providers = await ctx.runQuery(internal.marketplace.mutations.getConfiguredProviders, {
      businessAccountId: args.businessAccountId,
    });

    if (providers.length === 0) {
      console.log("No providers configured or all sync disabled");
      return { success: true, reason: "No providers configured" };
    }

    // Sync to all providers in parallel
    const syncResults = await Promise.allSettled(
      providers.map((provider) => syncToProviderImmediately(ctx, provider, args)),
    );

    // Update sync status on inventory item based on results
    const results = syncResults.map((result, index) => ({
      provider: providers[index],
      success: result.status === "fulfilled" && result.value?.success === true,
      error: result.status === "rejected" ? result.reason : result.value?.error,
    }));

    // Update inventory item sync status
    await ctx.runMutation(internal.inventory.mutations.updateImmediateSyncStatus, {
      inventoryItemId: args.inventoryItemId,
      results,
    });

    return { success: true, results };
  },
});

/**
 * Sync to a specific provider immediately
 */
async function syncToProviderImmediately(
  ctx: ActionCtx,
  provider: "bricklink" | "brickowl",
  args: {
    businessAccountId: Id<"businessAccounts">;
    inventoryItemId: Id<"inventoryItems">;
    changeType: "create" | "update" | "delete";
    newData?: any;
    previousData?: any;
    correlationId: string;
  },
): Promise<{ success: boolean; error?: any }> {
  try {
    // Check feature flags
    const disableExternalCalls = process.env.DISABLE_EXTERNAL_CALLS === "true";
    if (disableExternalCalls) {
      // Mock success for testing
      recordMetric(`inventory.immediateSync.${provider}.mocked`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
      });
      return { success: true };
    }

    // Create provider-specific client
    const client =
      provider === "bricklink"
        ? await createBricklinkStoreClient(ctx, args.businessAccountId)
        : await createBrickOwlStoreClient(ctx, args.businessAccountId);

    // Execute operation based on change type
    let result;
    const idempotencyKey = args.correlationId;

    switch (args.changeType) {
      case "create":
        result = await syncCreateImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      case "update":
        result = await syncUpdateImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      case "delete":
        result = await syncDeleteImmediately(ctx, client, provider, args, idempotencyKey);
        break;
      default:
        throw new Error(`Unknown change type: ${args.changeType}`);
    }

    if (result.success) {
      recordMetric(`inventory.immediateSync.${provider}.success`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        marketplaceId: result.marketplaceId,
      });
      return { success: true };
    } else {
      recordMetric(`inventory.immediateSync.${provider}.failed`, {
        inventoryItemId: args.inventoryItemId,
        changeType: args.changeType,
        correlationId: args.correlationId,
        businessAccountId: args.businessAccountId,
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    recordMetric(`inventory.immediateSync.${provider}.error`, {
      inventoryItemId: args.inventoryItemId,
      changeType: args.changeType,
      correlationId: args.correlationId,
      businessAccountId: args.businessAccountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error };
  }
}

// Helper functions for each operation type (similar to existing sync.ts)
async function syncCreateImmediately(
  ctx: ActionCtx,
  client: any,
  provider: string,
  args: any,
  idempotencyKey: string,
) {
  const payload =
    provider === "bricklink"
      ? mapConvexToBricklinkCreate(args.newData)
      : mapConvexToBrickOwlCreate(args.newData);

  const result = await client.createInventory(payload, { idempotencyKey });
  const marketplaceId = provider === "bricklink" ? result.bricklinkLotId : result.brickowlLotId;

  return {
    success: result.success,
    marketplaceId,
    error: result.error,
  };
}

async function syncUpdateImmediately(
  ctx: ActionCtx,
  client: any,
  provider: string,
  args: any,
  idempotencyKey: string,
) {
  // Get current inventory item to find marketplace ID
  const inventoryItem = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
    itemId: args.inventoryItemId,
  });

  const marketplaceId =
    provider === "bricklink" ? inventoryItem?.bricklinkLotId : inventoryItem?.brickowlLotId;

  if (!marketplaceId) {
    // Item not yet synced to this provider - treat as create
    return await syncCreateImmediately(ctx, client, provider, args, idempotencyKey);
  }

  const payload = args.newData;
  const result = await client.updateInventory(marketplaceId, payload, { idempotencyKey });

  return {
    success: result.success,
    marketplaceId: result.bricklinkLotId || result.brickowlLotId || marketplaceId,
    error: result.error,
  };
}

async function syncDeleteImmediately(
  ctx: ActionCtx,
  client: any,
  provider: string,
  args: any,
  idempotencyKey: string,
) {
  const marketplaceId =
    provider === "bricklink" ? args.previousData?.bricklinkLotId : args.previousData?.brickowlLotId;

  if (!marketplaceId) {
    // Item was never synced to this provider - mark as success
    return { success: true, marketplaceId: undefined, error: undefined };
  }

  const result = await client.deleteInventory(marketplaceId, { idempotencyKey });
  return {
    success: result.success,
    marketplaceId: undefined,
    error: result.error,
  };
}
```

#### 1.2 Add Immediate Sync Status Update Function

Add to `convex/inventory/mutations.ts`:

```typescript
/**
 * Update sync status after immediate sync attempt
 */
export const updateImmediateSyncStatus = internalMutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    results: v.array(
      v.object({
        provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
        success: v.boolean(),
        error: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const updates: {
      bricklinkSyncStatus?: "synced" | "failed";
      brickowlSyncStatus?: "synced" | "failed";
      bricklinkLotId?: number;
      brickowlLotId?: string;
    } = {};

    for (const result of args.results) {
      if (result.provider === "bricklink") {
        updates.bricklinkSyncStatus = result.success ? "synced" : "failed";
        // Note: marketplaceId would need to be passed from sync result
      } else if (result.provider === "brickowl") {
        updates.brickowlSyncStatus = result.success ? "synced" : "failed";
        // Note: marketplaceId would need to be passed from sync result
      }
    }

    await ctx.db.patch(args.inventoryItemId, updates);
  },
});
```

### Phase 2: Modify Existing Inventory Mutations

#### 2.1 Update `addInventoryItem` Function

Modify `convex/inventory/mutations.ts` - `addInventoryItem`:

```typescript
export const addInventoryItem = mutation({
  args: addInventoryItemArgs,
  returns: addInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    const timestamp = now();
    const document = {
      businessAccountId,
      name: args.name,
      partNumber: args.partNumber,
      colorId: args.colorId,
      location: args.location,
      quantityAvailable: args.quantityAvailable,
      quantityReserved: args.quantityReserved ?? 0,
      quantitySold: args.quantitySold ?? 0,
      status: args.status ?? "available",
      condition: args.condition,
      price: args.price,
      notes: args.notes,
      createdBy: user._id,
      createdAt: timestamp,
      isArchived: false,
      fileId: args.fileId,
    };

    const id = await ctx.db.insert("inventoryItems", document);

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId,
      itemId: id,
      changeType: "create",
      deltaAvailable: args.quantityAvailable,
      deltaReserved: document.quantityReserved,
      deltaSold: document.quantitySold,
      toStatus: document.status,
      actorUserId: user._id,
      createdAt: timestamp,
    });

    // REMOVED: Sync queue entry creation
    // Instead, trigger immediate sync
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId,
        inventoryItemId: id,
        changeType: "create",
        newData: document,
        correlationId,
      },
    );

    return id;
  },
});
```

#### 2.2 Update `updateInventoryItem` Function

Modify `convex/inventory/mutations.ts` - `updateInventoryItem`:

```typescript
export const updateInventoryItem = mutation({
  args: updateInventoryItemArgs,
  returns: updateInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user);

    // ... existing validation logic ...

    // Capture previous state for sync
    const previousData = { ...item };

    const timestamp = now();
    const updates: Partial<Doc<"inventoryItems">> & { updatedAt: number } = {
      updatedAt: timestamp,
    };

    // ... existing update logic ...

    await ctx.db.patch(args.itemId, updates);

    // Build new data (merged state)
    const newData = { ...item, ...updates };

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "update",
      deltaAvailable: nextAvailable - item.quantityAvailable,
      deltaReserved: nextReserved - (item.quantityReserved ?? 0),
      deltaSold: nextSold - (item.quantitySold ?? 0),
      fromStatus: item.status ?? "available",
      toStatus: updates.status ?? item.status ?? "available",
      actorUserId: user._id,
      reason: args.reason,
      createdAt: timestamp,
    });

    // REMOVED: Sync queue entry creation
    // Instead, trigger immediate sync
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId: item.businessAccountId,
        inventoryItemId: args.itemId,
        changeType: "update",
        newData,
        previousData,
        correlationId,
      },
    );

    return { itemId: args.itemId };
  },
});
```

#### 2.3 Update `deleteInventoryItem` Function

Modify `convex/inventory/mutations.ts` - `deleteInventoryItem`:

```typescript
export const deleteInventoryItem = mutation({
  args: deleteInventoryItemArgs,
  returns: deleteInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);
    requireOwnerRole(user);

    // Capture previous state for rollback capability
    const previousData = { ...item };

    const timestamp = now();
    await ctx.db.patch(args.itemId, {
      isArchived: true,
      deletedAt: timestamp,
      updatedAt: timestamp,
    });

    // Write to inventory history (lightweight audit)
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "delete",
      actorUserId: user._id,
      reason: args.reason,
      createdAt: timestamp,
    });

    // REMOVED: Sync queue entry creation
    // Instead, trigger immediate sync
    const correlationId = crypto.randomUUID();

    // Schedule immediate sync (non-blocking)
    await ctx.scheduler.runAfter(
      0,
      internal.inventory.immediateSync.syncInventoryChangeImmediately,
      {
        businessAccountId: item.businessAccountId,
        inventoryItemId: args.itemId,
        changeType: "delete",
        previousData,
        correlationId,
      },
    );

    return { itemId: args.itemId };
  },
});
```

### Phase 3: Update Sync Status Management

#### 3.1 Modify Sync Status Updates

Update the sync status logic in inventory mutations to set initial status to "syncing" instead of "pending":

```typescript
// In addInventoryItem, updateInventoryItem, deleteInventoryItem
// Replace the sync status logic with:

// Set initial sync status to "syncing" for enabled marketplaces
const syncStatusUpdates: {
  bricklinkSyncStatus?: "syncing" | "synced" | "failed";
  brickowlSyncStatus?: "syncing" | "synced" | "failed";
} = {};

// Get configured providers
const providers = await ctx.runQuery(internal.marketplace.mutations.getConfiguredProviders, {
  businessAccountId: item.businessAccountId,
});

if (providers.includes("bricklink")) {
  syncStatusUpdates.bricklinkSyncStatus = "syncing";
}
if (providers.includes("brickowl")) {
  syncStatusUpdates.brickowlSyncStatus = "syncing";
}

// Update inventory item with syncing status
if (Object.keys(syncStatusUpdates).length > 0) {
  await ctx.db.patch(args.itemId, syncStatusUpdates);
}
```

### Phase 4: Clean Up Legacy Sync Infrastructure

#### 4.1 Deprecate Sync Queue Functions

Mark the following functions as deprecated in `convex/inventory/sync.ts`:

- `getBusinessAccountsWithPendingChanges`
- `processAllPendingChanges`
- `processPendingChanges`

Add deprecation comments and consider removing after confirming immediate sync works correctly.

#### 4.2 Update Cron Job

Modify `convex/crons.ts` to remove or comment out the sync processing cron job:

```typescript
// Comment out or remove this cron job
// cron("inventory-sync", "*/5 * * * *", internal.inventory.sync.processAllPendingChanges);
```

#### 4.3 Update Sync Queue Mutations

Mark sync queue related functions as deprecated in `convex/inventory/mutations.ts`:

- `getPendingChanges`
- `markSyncing`
- `updateSyncStatus`
- `recordSyncError`
- `recordConflict`

### Phase 5: Error Handling and Retry Logic

#### 5.1 Implement Retry Logic for Failed Syncs

Add retry functionality to `convex/inventory/immediateSync.ts`:

```typescript
/**
 * Retry failed sync operations
 */
export const retryFailedSync = internalAction({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
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

    while (attempt < maxRetries) {
      try {
        const result = await syncToProviderImmediately(ctx, args.provider, {
          businessAccountId: item.businessAccountId,
          inventoryItemId: args.inventoryItemId,
          changeType: "update", // Determine based on item state
          newData: item,
          correlationId: crypto.randomUUID(),
        });

        if (result.success) {
          // Update sync status to success
          await ctx.runMutation(internal.inventory.mutations.updateImmediateSyncStatus, {
            inventoryItemId: args.inventoryItemId,
            results: [{ provider: args.provider, success: true }],
          });
          return { success: true };
        }

        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }
        // Exponential backoff
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { success: false, reason: "Max retries exceeded" };
  },
});
```

### Phase 6: Testing and Validation

#### 6.1 Update Tests

Update existing tests in `__tests__/backend/` to reflect the new immediate sync behavior:

- Remove tests that verify sync queue entries
- Add tests that verify immediate sync scheduling
- Update tests that check sync status transitions

#### 6.2 Add Integration Tests

Create new tests for immediate sync functionality:

```typescript
// __tests__/backend/inventory-immediate-sync.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ConvexTestingHelper } from "convex/testing";

describe("Inventory Immediate Sync", () => {
  let t: ConvexTestingHelper;

  beforeEach(async () => {
    t = new ConvexTestingHelper();
    await t.setup();
  });

  it("should immediately sync new inventory items to enabled marketplaces", async () => {
    // Test implementation
  });

  it("should handle sync failures gracefully", async () => {
    // Test implementation
  });

  it("should retry failed syncs with exponential backoff", async () => {
    // Test implementation
  });
});
```

### Phase 7: Migration Strategy

#### 7.1 Data Migration

Create a migration script to handle existing sync queue entries:

```typescript
// scripts/migrate-sync-queue.ts
/**
 * Migration script to process existing sync queue entries
 * Run this once before deploying the immediate sync changes
 */
export async function migrateExistingSyncQueue() {
  // Process any remaining pending sync queue entries
  // This ensures no data is lost during the transition
}
```

#### 7.2 Deployment Steps

1. **Pre-deployment**:

   - Run migration script to process existing sync queue entries
   - Deploy immediate sync functions alongside existing sync functions

2. **Deployment**:

   - Deploy updated inventory mutations with immediate sync
   - Monitor sync success rates and error rates

3. **Post-deployment**:
   - Verify immediate sync is working correctly
   - Remove deprecated sync queue functions after confirmation
   - Update documentation

## Benefits of Immediate Sync

1. **Real-time Updates**: Inventory changes are synced immediately instead of waiting up to 5 minutes
2. **Simplified Architecture**: Removes the complexity of batch processing and sync queue management
3. **Better User Experience**: Users see sync status updates immediately
4. **Reduced Storage**: No need to store sync queue entries
5. **Easier Debugging**: Immediate feedback on sync failures

## Risks and Mitigation

1. **API Rate Limits**: Immediate sync could hit rate limits faster

   - **Mitigation**: Implement proper rate limiting and circuit breakers
   - **Mitigation**: Add retry logic with exponential backoff

2. **Sync Failures**: Immediate failures could impact user experience

   - **Mitigation**: Implement robust error handling and retry mechanisms
   - **Mitigation**: Show clear error messages to users

3. **Performance**: Immediate sync could slow down inventory operations
   - **Mitigation**: Use non-blocking scheduler calls
   - **Mitigation**: Implement async processing

## Success Criteria

- [ ] Inventory changes sync immediately to enabled marketplaces
- [ ] No sync queue entries are created for new changes
- [ ] Sync status is updated in real-time on inventory items
- [ ] Failed syncs are retried with exponential backoff
- [ ] Error handling provides clear feedback to users
- [ ] Performance impact is minimal
- [ ] All existing tests pass
- [ ] New tests cover immediate sync functionality

## Implementation Timeline

- **Week 1**: Create immediate sync functions and update inventory mutations
- **Week 2**: Implement error handling and retry logic
- **Week 3**: Update tests and add integration tests
- **Week 4**: Deploy and monitor, clean up legacy code

This plan provides a comprehensive approach to transitioning from batch sync processing to immediate sync while maintaining reliability and error handling.
