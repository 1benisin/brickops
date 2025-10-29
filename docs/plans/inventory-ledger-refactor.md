# Inventory Ledger Refactor: Event-Sourced Sync with Transactional Outbox

**Status**: Planning  
**Created**: 2025-01-XX  
**Owner**: Development Team  
**Type**: Architecture Refactor

---

## Executive Summary

This document outlines a comprehensive refactor of the inventory marketplace sync system to implement an **event-sourced ledger with transactional outbox pattern**. The refactor addresses critical gaps in retry handling, idempotency, and delta tracking that create reliability issues with marketplace synchronization.

### Key Outcomes

- **Authoritative Delta Tracking**: Sequence-numbered ledger entries enable deterministic delta computation for any point in time
- **Reliable Retry Logic**: Transactional outbox ensures no delta is lost on retry failures
- **Cursor-Based Sync**: Per-provider sequence cursors eliminate guesswork about what needs syncing
- **Built-in Idempotency**: Natural idempotency keys prevent duplicate sync operations
- **Clean Separation**: Mutation path writes ledger, worker path handles marketplace calls

### Scope

- **Core System**: Deviation Marketplace Sync (BrickLink, BrickOwl)
- **Estimated Effort**: 3-4 days across 3 incremental phases
- **Risk Level**: Medium (requires careful testing of sync correctness)
- **Breaking Changes**: None (internal refactor only)

---

## 1. Problem Statement & Motivation

### Current Pain Points

1. **Fragile Delta Calculation**

   - Sync failures rely on "previousQuantity" passed at mutation time
   - Concurrent mutations create race conditions
   - No authoritative source of truth for what delta should be sent

2. **Unreliable Retry Logic**

   - `retryFailedSync` uses sleep loops in actions (anti-pattern)
   - No idempotency guarantees
   - Lost deltas when retry happens after additional changes

3. **No Sync Progress Tracking**

   - Cannot answer "what has marketplace X actually applied?"
   - No way to replay specific seq ranges
   - UI can't show "pending +15 since 10:23"

4. **Concurrency Issues**

   - Setting "syncing" status on item causes race conditions
   - No fencing mechanism for concurrent modifications
   - Branching ledger state breaks delta calculations

5. **Architectural Deficits**
   - Direct marketplace calls in mutation path
   - No transactional guarantee between ledger write and sync
   - Schema lacks sequence tracking and cursor fields

### Business Impact

- **Inventory Discrepancies**: Marketplace quantities drift from system
- **Lost Sales**: Sync failures mean items show as "out of stock" on marketplaces
- **Support Burden**: Manual reconciliation required when syncs fail
- **User Trust**: Inconsistent inventory engages confidence

---

## 2. Current Architecture Analysis

### Schema (Current)

```typescript
// inventoryQuantityLedger
{
  businessAccountId: Id<"businessAccounts">,
  itemId: Id<"inventoryItems">,
  timestamp: number,
  deltaAvailable: number,  // ✅ Exists
  // ❌ MISSING: seq, preAvailable, postAvailable
  reason: "initial_stock" | "manual_adjustment" | "order_sale" | "item_deleted",
  source: "user" | "bricklink" | "brickowl",
  userId?: Id<"users">,
  orderId?: string,
  correlationId?: string,
}

// inventoryItems.marketplaceSync (Current)
{
  bricklink: {
    lotId?: number,
    status: "pending" | "syncing" | "synced" | "failed",
    lastSyncAttempt?: number,
    error?: string,
    // ❌ MISSING: lastSyncedSeq, lastSyncedAvailable
  }
}
```

### Sync Flow (Current)

```
User Mutates Item
  ↓
Write to ledger (deltaAvailable)
  ↓
Schedule immediate sync action (ctx.scheduler.runAfter(0, ...))
  ↓
Action: syncInventoryChange
  ↓
Direct call to marketplace API
  ↓
Update item.marketplaceSync.status
```

**Problems**:

- No sequence tracking
- Delta computed from previousQuantity passed at mutation time
- No retry cursor
- Race conditions with concurrent mutations
- Sleep loops in retry logic

### Code References (Current Issues)

```12:280:convex/inventory/mutations.ts
// Passes previousData containing "previousQuantity"
// This is fragile under concurrency
const previousData = { ...item };
await ctx.scheduler.runAfter(0, internal.inventory.sync.syncInventoryChange, {
  previousData,
  correlationId,
});
```

```218:232:convex/inventory/sync.ts
// Computes delta from previousQuantity passed in previousData
// Breaks if more mutations happened between write and sync
const previousQuantity = (argsWithPreviousData.previousData?.quantityAvailable as number) || undefined;
const payload = mapConvexToBricklinkUpdate(args.newData, previousQuantity);
```

```282:319:convex/inventory/sync.ts
// Sleep loops inside action - anti-pattern
while (attempt < maxRetries) {
  // ... sync logic ...
  await new Promise((resolve) => setTimeout(resolve, delayMs)); // ❌
}
```

---

## 3. Target Architecture

### Architectural Principles

1. **Event Sourcing**: Ledger is source of truth for all quantity changes
2. **Sequence Fencing**: Monotonic per-item sequence numbers prevent ordering issues
3. **Transactional Outbox**: Sync requests stored in same transaction as ledger writes
4. **Cursor-Based Recovery**: Each provider tracks last applied sequence number
5. **Idempotency by Design**: Replayable ledger entries with stable keys

### New Schema Components

#### Enhanced Ledger

```typescript
inventoryQuantityLedger: {
  // ... existing fields ...
  seq: number,                    // ✅ NEW: per-item monotonic sequence
  preAvailable: number,           // ✅ NEW: balance before this delta
  postAvailable: number,          // ✅ NEW: balance after this delta
}
  .index("by_item_seq", ["itemId", "seq"])  // ✅ NEW: efficient window queries
```

#### Per-Provider Cursors

```typescript
inventoryItems.marketplaceSync.bricklink: {
  // ... existing fields ...
  lastSyncedSeq: number,          // ✅ NEW: last ledger seq applied
  lastSyncedAvailable: number,    // ✅ NEW: denormalized anchor
}
```

#### Transactional Outbox

```typescript
// ✅ NEW TABLE
marketplaceOutbox: {
  businessAccountId: Id<"businessAccounts">,
  itemId: Id<"inventoryItems">,
  provider: "bricklink" | "brickowl",
  kind: "create" | "update" | "delete",

  // Delta window (what this sync covers)
  fromSeqExclusive: number,
  toSeqInclusive: number,

  // Idempotency
  idempotencyKey: string,

  // Lifecycle
  status: "pending" | "inflight" | "succeeded" | "failed",
  attempt: number,
  nextAttemptAt: number,
  lastError?: string,
  createdAt: number,
  correlationId?: string,
}
  .index("by_status_time", ["status", "nextAttemptAt"])
  .index("by_item_provider_time", ["itemId", "provider", "createdAt"])
```

### Target Sync Flow

```
User Mutates Item
  ↓
Compute next seq
  ↓
Write ledger entry with seq + preAvailable + postAvailable
  ↓
Enqueue outbox message (same transaction)
  ↓
Return success to user
  ↓
[ASYNCHRONOUS]
Worker cron drains outbox
  ↓
Compute delta by summing ledger entries [fromSeqExclusive, toSeqInclusive]
  ↓
Call marketplace API
  ↓
On success: advance cursor (lastSyncedSeq = toSeqInclusive)
  ↓
On failure: backoff + jitter, retry later
```

---

## 4. Incremental Implementation Strategy

### Phase 1: Add Sequence Tracking (Low Risk, ~1 day)

**Goal**: Make ledger authoritative with sequence numbers

**Changes**:

1. Add `seq`, `preAvailable`, `postAvailable` fields to schema
2. Update mutations to compute and store these fields
3. Add `by_item_seq` index for efficient queries

**Why Start Here**:

- Enables correct delta calculation
- No behavior changes yet
- Easy to validate

### Phase 2: Add Cursors & Outbox (Medium Risk, ~1.5 days)

**Goal**: Track sync progress and enable retries

**Changes**:

1. Add `lastSyncedSeq`, `lastSyncedAvailable` to marketplace sync schema
2. Create `marketplaceOutbox` table
3. Modify mutations to enqueue outbox messages
4. Compute deltas from ledger window instead of previousQuantity

**Why Next**:

- Builds on Phase 1 sequence tracking
- Enables correct retry logic
- Still uses immediate sync (worker in Phase 3)

### Phase 3: Move to Worker Pattern (Medium Risk, ~1.5 days)

**Goal**: Separate mutation and sync concerns

**Changes**:

1. Create worker cron that drains outbox
2. Implement exponential backoff + jitter
3. Remove immediate sync scheduling
4. Update UI to query outbox status

**Why Last**:

- Highest risk (behavior change)
- Requires thorough testing
- Can run in parallel with immediate sync initially

---

## 5. Detailed Technical Changes

### Phase 1: Sequence Tracking

#### 5.1.1 Schema Changes

**File**: `convex/inventory/schema.ts`

```typescript
// Add new fields to inventoryQuantityLedger
defineTable({
  // ... existing fields ...
  seq: v.number(), // Per-item monotonic sequence
  preAvailable: v.number(), // Balance before this delta
  postAvailable: v.number(), // Balance after this delta (running balance)
}).index("by_item_seq", ["itemId", "seq"]); // Enable range queries
```

#### 5.1.2 Helper Function: Get Next Sequence

**File**: `convex/inventory/helpers.ts` (create if needed)

```typescript
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
 * Falls back to item.quantityAvailable for backward compatibility
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
```

#### 5.1.3 Update Mutations to Compute Sequence

**File**: `convex/inventory/mutations.ts`

**Changes to `addInventoryItem`**:

```typescript
// After line 111 (after insert), compute sequence
const seq = await getNextSeqForItem(ctx.db, id);
const preAvailable = 0;
const postAvailable = preAvailable + args.quantityAvailable;

// Update the ledger insert to include new fields
await ctx.db.insert("inventoryQuantityLedger", {
  // ... existing fields ...
  seq,
  preAvailable,
  postAvailable,
});
```

**Changes to `updateInventoryItem`**:

```typescript
// After computing deltaAvailable (line 195)
if (deltaAvailable !== 0) {
  const seq = await getNextSeqForItem(ctx.db, args.itemId);
  const preAvailable = await getCurrentAvailableFromLedger(ctx.db, args.itemId);
  const postAvailable = preAvailable + deltaAvailable;

  await ctx.db.insert("inventoryQuantityLedger", {
    // ... existing fields ...
    seq,
    preAvailable,
    postAvailable,
  });
}
```

#### 5.1.4 Testing Phase 1

- [ ] Ledger entries have sequential seq values
- [ ] postAvailable calculates correctly (sums all deltas)
- [ ] preAvailable matches previous entry's postAvailable
- [ ] Index `by_item_seq` enables fast range queries

---

### Phase 2: Cursors & Outbox

#### 5.2.1 Schema Updates

**File**: `convex/inventory/schema.ts`

**Update `marketplaceSync` schema**:

```typescript
bricklink: v.optional(
  v.object({
    // ... existing fields ...
    lastSyncedSeq: v.optional(v.number()),        // NEW
    lastSyncedAvailable: v.optional(v.number()),  // NEW
  }),
),
```

**Add new outbox table**:

```typescript
marketplaceOutbox: defineTable({
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  kind: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),

  // Delta window
  fromSeqExclusive: v.number(),
  toSeqInclusive: v.number(),

  // Idempotency
  idempotencyKey: v.string(),

  // Lifecycle
  status: v.union(
    v.literal("pending"),
    v.literal("inflight"),
    v.literal("succeeded"),
    v.literal("failed"),
  ),
  attempt: v.number(),
  nextAttemptAt: v.number(),
  lastError: v.optional(v.string()),
  createdAt: v.number(),
  correlationId: v.optional(v.string()),
})
  .index("by_status_time", ["status", "nextAttemptAt"])
  .index("by_item_provider_time", ["itemId", "provider", "createdAt"]),
```

#### 5.2.2 Helper: Enqueue Outbox Message

**File**: `convex/inventory/helpers.ts`

```typescript
/**
 * Enqueue a marketplace sync operation
 * Call this after writing to the ledger
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
): Promise<void> {
  // Check if credentials exist for this provider
  const creds = await ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
    )
    .first();

  if (!creds?.isActive || !creds?.syncEnabled) {
    return; // No sync needed
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
}
```

#### 5.2.3 Helper: Compute Delta from Ledger Window

**File**: `convex/inventory/helpers.ts`

```typescript
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
```

#### 5.2.4 Update Mutations to Enqueue Outbox

**File**: `convex/inventory/mutations.ts`

**In `addInventoryItem`**:

```typescript
// After inserting ledger entry (with seq computed)
const currentSeq = seq;

// Enqueue outbox for each enabled provider
await Promise.all(
  ["bricklink", "brickowl"].map(async (provider) => {
    await enqueueMarketplaceSync(ctx, {
      businessAccountId,
      itemId: id,
      provider: provider as "bricklink" | "brickowl",
      kind: "create",
      lastSyncedSeq: 0, // New item, never synced
      currentSeq,
      correlationId,
    });
  }),
);

// Still schedule immediate sync (Phase 3 will remove this)
await ctx.scheduler.runAfter(0, internal.inventory.sync.syncInventoryChange, {
  // ... existing args ...
});
```

**In `updateInventoryItem`**:

```typescript
// After computing seq and inserting ledger entry
if (deltaAvailable !== 0) {
  const seq = await getNextSeqForItem(ctx.db, args.itemId);
  // ... compute pre/post available ...

  await ctx.db.insert("inventoryQuantityLedger", {
    /* ... with seq fields ... */
  });

  const currentSeq = seq;

  // Enqueue outbox for each enabled provider
  await Promise.all(
    ["bricklink", "brickowl"].map(async (provider) => {
      const lastSyncedSeq = await getLastSyncedSeq(
        ctx.db,
        args.itemId,
        provider as "bricklink" | "brickowl",
      );

      await enqueueMarketplaceSync(ctx, {
        businessAccountId: item.businessAccountId,
        itemId: args.itemId,
        provider: provider as "bricklink" | "brickowl",
        kind: "update",
        lastSyncedSeq,
        currentSeq,
        correlationId,
      });
    }),
  );

  // Still schedule immediate sync (for now)
  await ctx.scheduler.runAfter(0 /* ... */);
}
```

#### 5.2.5 Update Sync Logic to Use Ledger Window

**File**: `convex/inventory/sync.ts`

**Modify `syncUpdate` to use ledger window**:

```typescript
async function syncUpdate(
  ctx: ActionCtx,
  client: unknown,
  marketplace: string,
  args: { inventoryItemId: Id<"inventoryItems"> },
  idempotencyKey: string,
) {
  const inventoryItem = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
    itemId: args.inventoryItemId,
  });

  const lastSyncedSeq =
    marketplace === "bricklink"
      ? inventoryItem?.marketplaceSync?.bricklink?.lastSyncedSeq ?? 0
      : inventoryItem?.marketplaceSync?.brickowl?.lastSyncedSeq ?? 0;

  // Get current max seq from ledger
  const lastLedgerEntry = await ctx.runQuery(internal.inventory.queries.getCurrentLedgerSeq, {
    itemId: args.inventoryItemId,
  });

  const currentSeq = lastLedgerEntry?.seq ?? 0;

  // Compute delta from ledger window
  const delta = await ctx.runQuery(internal.inventory.queries.computeDeltaFromWindow, {
    itemId: args.inventoryItemId,
    fromSeqExclusive: lastSyncedSeq,
    toSeqInclusive: currentSeq,
  });

  const lotId =
    marketplace === "bricklink"
      ? inventoryItem?.marketplaceSync?.bricklink?.lotId
      : inventoryItem?.marketplaceSync?.brickowl?.lotId;

  if (!lotId) {
    // No lot yet - treat as create
    return await syncCreate(ctx, client, marketplace, args, idempotencyKey);
  }

  // For BrickLink, use delta-based update
  if (marketplace === "bricklink") {
    const payload = mapConvexToBricklinkUpdateFromDelta(delta, lotId);
    const result = await (client as any).updateInventory(lotId, payload, {
      idempotencyKey,
    });
    return { success: result.success, error: result.error };
  }

  // For other providers, implement as needed
  // ...
}
```

#### 5.2.6 Update Sync Status Mutation

**File**: `convex/inventory/sync.ts`

**Fix: Properly update marketplaceSync cursor**:

```typescript
export const updateSyncStatuses = internalMutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    results: v.array(
      v.object({
        provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
        success: v.boolean(),
        error: v.optional(v.any()),
        marketplaceId: v.optional(v.union(v.string(), v.number())),
        lastSyncedSeq: v.optional(v.number()), // NEW: cursor advance
        lastSyncedAvailable: v.optional(v.number()), // NEW: denormalized
      }),
    ),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.inventoryItemId);
    if (!item) return null;

    const currentMs = item.marketplaceSync ?? {};
    const next: { marketplaceSync: any } = { marketplaceSync: {} };

    args.results.forEach((result) => {
      const existing = (currentMs as any)[result.provider] ?? {};

      next.marketplaceSync[result.provider] = {
        ...existing,
        status: result.success ? "synced" : "failed",
        lastSyncAttempt: Date.now(),
        ...(result.success && result.marketplaceId && { lotId: result.marketplaceId }),
        ...(result.error && { error: String(result.error) }),
        // NEW: Advance cursor on success
        ...(result.success && result.lastSyncedSeq && { lastSyncedSeq: result.lastSyncedSeq }),
        ...(result.success &&
          result.lastSyncedAvailable && {
            lastSyncedAvailable: result.lastSyncedAvailable,
          }),
      };
    });

    await ctx.db.patch(args.inventoryItemId, next);
  },
});
```

#### 5.2.7 Testing Phase 2

- [ ] Outbox messages created for each mutation
- [ ] `lastSyncedSeq` advances on successful sync
- [ ] Delta computation from ledger window is correct
- [ ] Idempotency keys are stable and unique

---

### Phase 3: Worker Pattern

#### 5.3.1 Create Outbox Worker Cron

**File**: `convex/inventory/syncWorker.ts` (new file)

```typescript
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Worker that drains the marketplace outbox
 * Runs every 30 seconds (configurable)
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

async function processOutboxMessage(
  ctx: ActionCtx,
  message: {
    _id: Id<"marketplaceOutbox">;
    itemId: Id<"inventoryItems">;
    provider: "bricklink" | "brickowl";
    // ... other fields ...
  },
) {
  try {
    // Mark as inflight (CAS to avoid double processing)
    const marked = await ctx.runMutation(internal.inventory.syncWorker.markOutboxInflight, {
      messageId: message._id,
      currentAttempt: message.attempt,
    });

    if (!marked.success) {
      console.log(`Message ${message._id} already being processed`);
      return;
    }

    // Compute delta from ledger window
    const delta = await ctx.runQuery(internal.inventory.queries.computeDeltaFromWindow, {
      itemId: message.itemId,
      fromSeqExclusive: message.fromSeqExclusive,
      toSeqInclusive: message.toSeqInclusive,
    });

    // Get item and current seq state
    const item = await ctx.runQuery(internal.inventory.mutations.getInventoryItem, {
      itemId: message.itemId,
    });

    const currentSeq = await ctx.runQuery(internal.inventory.queries.getCurrentLedgerSeq, {
      itemId: message.itemId,
    });

    // Call marketplace API
    const result = await callMarketplaceAPI(ctx, {
      message,
      item,
      delta,
    });

    if (result.success) {
      // Advance cursor
      await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
        inventoryItemId: message.itemId,
        results: [
          {
            provider: message.provider,
            success: true,
            marketplaceId: result.marketplaceId,
            lastSyncedSeq: message.toSeqInclusive,
            lastSyncedAvailable: delta, // Or from ledger entry
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
        recordMetric(`inventory.sync.${message.provider}.max_retries_exceeded`, {
          itemId: message.itemId,
          messageId: message._id,
        });
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

function computeNextAttempt(attempt: number): number {
  const baseDelay = 1000; // 1 second
  const maxDelay = 300000; // 5 minutes
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.floor(Math.random() * 5000); // 0-5 seconds random

  return Date.now() + exponentialDelay + jitter;
}
```

#### 5.3.2 Update Cron Schedule

**File**: `convex/crons.ts`

```typescript
// Add to hourly cron
import { internal } from "./_generated/api";

export const hourly = internalMutation({
  handler: async (ctx) => {
    // ... existing cron jobs ...

    // NEW: Drain marketplace outbox
    await ctx.scheduler.runAfter(0, internal.inventory.syncWorker.drainMarketplaceOutbox);
  },
});
```

#### 5.3.3 Remove Immediate Sync Scheduling

**File**: `convex/inventory/mutations.ts`

**After Phase 2 is stable, remove**:

```typescript
// DELETE THIS from addInventoryItem, updateInventoryItem, deleteInventoryItem:
await ctx.scheduler.runAfter(0, internal.inventory.sync.syncInventoryChange, {
秀才，YI/YEYI
```

**The outbox worker now handles all syncing.**

#### 5.3.4 Add UI Query for Outbox Status

**File**: `convex/inventory/queries.ts`

```typescript
/**
 * Get sync status for UI
 * Combines marketplace sync cursor with outbox status
 */
export const getItemSyncStatus = query({
  args: { itemId: v.id("inventoryItems") },
  returns: v.object({
    itemId: v.id("inventoryItems"),
    marketplaceSync: v.any(),
    pendingChangesCount: v.number(),
    nextRetryAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);

    // Count pending/inflight outbox messages
    const pendingMessages = await ctx.db
      .query("marketplaceOutbox")
      .withIndex("by_item_provider_time", (q) => q.eq("itemId", args.itemId))
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .collect();

    const nextRetryAt = pendingMessages.reduce((min, msg) => {
      if (msg.nextAttemptAt > Date.now()) {
        return Math.min(min, msg.nextAttemptAt);
      }
      return min;
    }, Infinity);

    return {
      itemId: args.itemId,
      marketplaceSync: item?.marketplaceSync,
      pendingChangesCount: pendingMessages.length,
      nextRetryAt: nextRetryAt === Infinity ? undefined : nextRetryAt,
    };
  },
});
```

#### 5.3.5 Testing Phase 3

- [ ] Worker drains outbox messages successfully
- [ ] Exponential backoff + jitter works correctly
- [ ] Cursor advances on success
- [ ] Retries use correct delta from ledger window
- [ ] No more immediate sync calls in mutation path
- [ ] UI shows outbox status correctly

---

## 6. Testing Strategy

### Unit Tests

1. **Sequence Generation**

   - First entry gets seq=1
   - Subsequent entries increment correctly
   - Concurrent mutations generate unique sequences

2. **Delta Computation**

   - Empty window returns 0
   - Single-entry window returns that entry's delta
   - Multi-entry window sums correctly

3. **Cursor Management**
   - Initial cursor is 0
   - Advances on successful sync
   - Survives item updates

### Integration Tests

1. **Mutation + Outbox Flow**

   - Writing ledger entry enqueues outbox message
   - Message contains correct seq range
   - Idempotency keys are stable

2. **Worker Processing**

   - Pending messages processed in order
   - Only one worker processes a message (CAS)
   - Failures retry with backoff

3. **Sync Correctness**
   - Delta sent to marketplace is correct
   - Multiple sequential changes result in correct final state
   - Retry after failure sends correct delta

### End-to-End Tests

1. **Happy Path**

   - Add item → marketplace syncs
   - Update item → marketplace updates
   - Delete item → marketplace removes

2. **Failure Recovery**

   - Marketplace API fails → retry succeeds
   - Multiple failures → backoff increases
   - Max retries exceeded → alert logged

3. **Concurrency**
   - Two rapid updates → both deltas applied
   - No lost deltas
   - Final state is correct

### Test Files to Create

- `__tests__/backend/inventory-ledger-seq.test.ts`
- `**tests**格式内幕Inventory/outbox-work

er.test.ts`

- `__tests__/e2e/inventory-sync-retry.test.ts`

---

## 7. Rollout & Migration Plan

### Pre-Refactor Checklist

- [ ] Backup current ledger data
- [ ] Document current sync behavior
- [ ] Set up monitoring for sync operations
- [ ] Prepare rollback procedure

### Phase Rollout

#### Phase 1 Rollout (Low Risk)

1. Deploy schema changes (`seq`, `preAvailable`, `postAvailable`)
2. Deploy mutation updates
3. Monitor ledger entries populate correctly
4. Validate no sync behavior changes

**Rollback**: Revert mutations, ignore new fields

#### Phase 2 Rollout (Medium Risk)

1. Deploy cursor fields and outbox table
2. Deploy outbox enqueue logic (parallel with immediate sync)
3. Monitor outbox fills correctly
4. Validate both immediate sync and outbox work
5. Keep immediate sync as primary for 1 week

**Rollback**: Disable outbox, fall back to immediate sync

#### Phase 3 Rollout (Medium Risk)

1. Deploy worker cron
2. Remove immediate sync scheduling
3. Monitor worker success rate
4. Compare sync times and success rates

**Rollback**: Re-enable immediate sync, stop worker

### Post-Rollout Validation

- [ ] All items with pending outbox messages process successfully
- [ ] No sync failures above baseline
- [ ] Delta calculations verified correct
- [ ] UI shows correct sync status

### Migration for Existing Data

**Option 1: Do Nothing** (Recommended for MVP)

- New mutations get sequences
- Old entries remain seq-less
- Cursor starts at 0 for all items

**Option 2: Backfill Sequences** (Future Enhancement)

- Script to assign sequences to historical ledger entries
- More accurate but not critical for functionality

---

## 8. Risk Assessment & Mitigation

### Technical Risks

| Risk                             | Severity | Probability | Mitigation                             |
| -------------------------------- | -------- | ----------- | -------------------------------------- |
| Sequence gaps in ledger          | High     | Low         | Use transaction-safe getNextSeq        |
| Delta calculation incorrect      | High     | Medium      | Extensive testing, manual verification |
| Outbox message loss              | High     | Low         | Same transaction as ledger write       |
| Worker fails silently            | Medium   | Low         | Structured logging, metrics            |
| Race conditions in cursor update | Medium   | Medium      | CAS pattern for cursor updates         |
| Backfill complexity              | Low      | High        | Option 1 (do nothing) recommended      |

### Operational Risks

| Risk                       | Severity | Probability | Mitigation                            |
| -------------------------- | -------- | ----------- | ------------------------------------- |
| Sync delays during rollout | Medium   | Medium      | Run both immediate + outbox initially |
| Marketplace API changes    | Low      | Low         | Monitor external API responses        |
| Data corruption            | High     | Very Low    | Transaction guarantees, validation    |

### Rollback Risks

| Risk                    | Severity | Probability | Mitigation                            |
| ----------------------- | -------- | ----------- | ------------------------------------- |
| Cannot rollback Phase 3 | Medium   | Low         | Keep immediate sync code              |
| Data inconsistencies    | High     | Very Low    | Validate before each phase completion |

---

## 9. Success Criteria

### Functional Success

- [ ] All ledger entries have sequential seq values
- [ ] postAvailable always equals sum of all deltas
- [ ] Outbox messages enqueue on every mutation
- [ ] Worker processes messages successfully
- [ ] Delta sent to marketplace is always correct
- [ ] Retry after failure sends correct delta
- [ ] No lost deltas under any failure scenario

### Performance Success

- [ ] Sync latency < 5 seconds for 95% of operations
- [ ] Worker cron completes in < 30 seconds
- [ ] No performance degradation in mutations

### Reliability Success

- [ ] Sync success rate > 99%
- [ ] Retry success rate > 90%
- [ ] Zero data loss events
- [ ] UI accurately reflects sync status

### Code Quality Success

- [ ] All tests pass
- [ ] No linter errors
- [ ] Code coverage > 80% for new code
- [ ] Clear comments and documentation

---

## 10. Monitoring & Observability

### Metrics to Track

1. **Ledger Health**

   - `inventory.ledger.entry_count` (gauge)
   - `inventory.ledger.seq_gaps` (counter) - should always be 0

2. **Outbox Health**

   - `inventory.outbox.pending` (gauge)
   - `inventory.outbox.inflight` (gauge)
   - `inventory.outbox.succeeded` (counter)
   - `inventory.outbox.failed` (counter)

3. **Sync Health**

   - `inventory.sync.success.{provider}` (counter)
   - `inventory.sync.failure.{provider}` (counter)
   - `inventory.sync.delta_sent.{provider}` (histogram)

4. **Cursor Health**
   - `inventory.cursor.behind.{provider}` (gauge) - items with pending messages

### Alerts to Configure

1. **Critical**

   - Outbox pending messages > 100 for > 1 hour
   - Sync failure rate > 10%
   - Sequence gaps detected

2. **Warning**
   - Outbox pending messages > 50
   - Worker processing time > 1 minute
   - Individual sync failures > 3 retries

### Logging

- **Structured Logs**: All outbox operations
- **Correlation IDs**: Track end-to-end flows
- **Debug Logs**: Sequence generation and delta computation

---

## 11. Appendix

### A. Code Examples: Complete Mutation Flow

```typescript
export const updateInventoryItem = mutation({
  // ... existing validation ...
  handler: async (ctx, args) => {
    // 1. Compute delta
    const deltaAvailable = newAvailable - oldAvailable;

    // 2. Get next sequence
    const seq = await getNextSeqForItem(ctx.db, args.itemId);

    // 3. Get current balance from ledger
    const preAvailable = await getCurrentAvailableFromLedger(ctx.db, args.itemId);
    const postAvailable = preAvailable + deltaAvailable;

    // 4. Write ledger entry (atomic)
    await ctx.db.insert("inventoryQuantityLedger", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp: now(),
      seq,
      preAvailable,
      postAvailable,
      deltaAvailable,
      reason: "manual_adjustment",
      source: "user",
      userId: user._id,
      correlationId,
    });

    // 5. Enqueue outbox for each provider (same transaction)
    const currentSeq = seq;
    for (const provider of ["bricklink", "brickowl"] as const) {
      const lastSyncedSeq = await getLastSyncedSeq(ctx.db, args.itemId, provider);

      if (lastSyncedSeq < currentSeq) {
        await enqueueMarketplaceSync(ctx, {
          businessAccountId: item.businessAccountId,
          itemId: args.itemId,
          provider,
          kind: "update",
          lastSyncedSeq,
          currentSeq,
          correlationId,
        });
      }
    }

    return { itemId: args.itemId };
  },
});
```

### B. Complete Outbox Worker Flow

```typescript
export const drainMarketplaceOutbox = internalAction({
  handler: async (ctx) => {
    // 1. Find pending messages
    const messages = await ctx.runQuery(internal.inventory.syncWorker.getPendingOutboxMessages, {
      maxNextAttemptAt: Date.now(),
    });

    // 2. Process each
    for (const msg of messages) {
      // 3. Mark inflight (CAS)
      const marked = await ctx.runMutation(internal.inventory.syncWorker.markOutboxInflight, {
        messageId: msg._id,
      });

      if (!marked) continue;

      // 4. Compute delta from ledger
      const delta = await ctx.runQuery(internal.inventory.queries.computeDeltaFromWindow, {
        itemId: msg.itemId,
        fromSeqExclusive: msg.fromSeqExclusive,
        toSeqInclusive: msg.toSeqInclusive,
      });

      // 5. Call marketplace
      const result = await callMarketplace(ctx, { msg, delta });

      // 6. Handle result
      if (result.success) {
        await ctx.runMutation(internal.inventory.sync.updateSyncStatuses, {
          inventoryItemId: msg.itemId,
          results: [
            {
              provider: msg.provider,
              success: true,
              lastSyncedSeq: msg.toSeqInclusive,
            },
          ],
        });
        await ctx.runMutation(internal.inventory.syncWorker.markOutboxSucceeded, {
          messageId: msg._id,
        });
      } else {
        await ctx.runMutation(internal.inventory.syncWorker.markOutboxFailed, {
          messageId: msg._id,
          attempt: msg.attempt + 1,
          nextAttemptAt: computeBackoff(msg.attempt),
          error: String(result.error),
        });
      }
    }
  },
});
```

### C. Critical Schema Changes Summary

```typescript
// 1. Enhanced ledger
inventoryQuantityLedger {
  seq: number                    // NEW
  preAvailable: number           // NEW
  postAvailable: number          // NEW
}

// 2. Per-provider cursors
marketplaceSync.bricklink {
  lastSyncedSeq: number          // NEW
  lastSyncedAvailable: number    // NEW
}

// 3. Transactional outbox
marketplaceOutbox {
  // NEW TABLE
}
```

### D. References

- **Current Code**: `convex/inventory/`
- **Sync Implementation**: `convex/inventory/sync.ts`
- **Related Plan**: `docs/plans/inventory-bricklink-duplicate-sync-fix.md`
- **BMAD Pattern**: Transactional Outbox Pattern
- **Event Sourcing**: Martin Fowler's Event Sourcing

---

## 12. Decision Log

| Date       | Decision                                     | Rationale                                            |
| ---------- | -------------------------------------------- | ---------------------------------------------------- |
| 2025-01-XX | Use sequence numbers instead of timestamps   | Timestamps can conflict; sequences are deterministic |
| 2025-01-XX | Don't backfill historical sequences          | Complexity not worth it; cursor at 0 is acceptable   |
| 2025-01-XX | Keep immediate sync during Phase 2 rollout   | Reduces risk; validates both approaches              |
| 2025-01-XX | One ledger with two columns over two ledgers | Simpler to keep sequence monotonic                   |

---

**End of Planning Document**
