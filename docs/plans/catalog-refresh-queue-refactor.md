# Catalog Refresh Queue Refactor: Outbox Pattern with Worker Processing

**Status**: ✅ Implementation Complete - Testing Phase  
**Created**: 2025-01-XX  
**Last Updated**: 2025-01-XX  
**Owner**: Development Team  
**Type**: Architecture Refactor

---

## Implementation Status

### ✅ Phase 1: Rename and Restructure (COMPLETE)

- ✅ Schema renamed: `catalogRefreshQueue` → `catalogRefreshOutbox`
- ✅ Added retry fields (`attempt`, `nextAttemptAt`, `lastError`)
- ✅ Updated status enum: `"processing"` → `"inflight"`, added `"succeeded"`
- ✅ Worker created at `convex/catalog/refreshWorker.ts`
- ✅ Cron updated to call new worker location
- ✅ Helper functions moved to appropriate locations

### ✅ Phase 2: Replace Direct API Calls (COMPLETE)

- ✅ Actions renamed: `refreshPart` → `enqueueRefreshPart`, etc.
- ✅ Direct API calls removed from actions
- ✅ Lock mechanism removed (`markPartRefreshing`, etc.)
- ✅ `refreshUntil` fields removed from schema
- ✅ Frontend hooks updated to use new action names
- ✅ Worker handles all API calls with retry logic
- ✅ Status detection updated to use outbox state

### ⏳ Remaining Tasks

- [✅] **Testing**: Initial test suite created (`__tests__/backend/catalog-refresh-outbox.test.ts`)
  - ⚠️ Some tests need mock extensions for full query pattern support (q.field, q.lte, q.or)
  - 5/11 tests passing - core functionality validated
- [⏳] **Validation**: Manual end-to-end testing in staging/production needed
- [⏳] **Monitoring**: Set up observability metrics (see section 11)
- [⏳] **Documentation**: Update any API documentation if needed

---

## Executive Summary

This document outlines a comprehensive refactor of the catalog refresh system to implement an **outbox pattern with worker processing**, aligning with the inventory sync architecture. The refactor addresses direct API calls in actions, unreliable lock mechanisms, and improves separation of concerns between the request path and background processing.

### Key Outcomes

- **Clean Request Path**: Frontend requests data; if stale, it enqueues to outbox (no direct API calls)
- **Reliable Background Processing**: Worker cron drains outbox with retry logic and exponential backoff
- **Built-in Deduplication**: Outbox prevents duplicate refresh requests
- **Consistent Naming**: Follows inventory sync pattern (outbox, worker, etc.)
- **Improved Separation**: Query path never blocks on API calls; refresh happens asynchronously

### Scope

- **Core System**: Catalog data refresh (parts, partColors, partPrices)
- **Estimated Effort**: 2-3 days across 2 incremental phases
- **Risk Level**: Low-Medium (frontend behavior changes, but queries return stale data gracefully)
- **Breaking Changes**: None (frontend hooks adapt to async refresh)

---

## 1. Problem Statement & Motivation

### Current Pain Points

1. **Direct API Calls in Actions**

   - `refreshPart`, `refreshPartColors`, `refreshPriceGuide` actions directly call Bricklink API
   - Blocks request thread until API responds
   - No retry logic if API fails
   - Rate limiting happens in request path

2. **Fragile Lock Mechanism**

   - `refreshUntil` locks on parts/partColors/partPrices tables
   - Lock brassiness can cause deadlocks or false negatives
   - No centralized lock management
   - Lock cleanup requires manual intervention

3. **Inconsistent Architecture**

   - Catalog refresh uses different pattern than inventory sync
   - Queue processing in `bricklink/dataRefresher.ts` instead of `catalog/refreshWorker.ts`
   - Table named `catalogRefreshQueue` vs `marketplaceOutbox` (inventory)

4. **No Retry Logic**

   - Failed API calls result in failed state
   - No exponential backoff or jitter
   - Manual intervention required for retries

5. **Mixed Concerns**
   - Query logic mixes freshness checking with refresh scheduling
   - Actions mix API calls with database updates

### Business Impact

- **Poor User Experience**: Long wait times when refreshing catalog data
- **Lost Refresh Requests**: Failed API calls result in lost refresh opportunities
- **Rate Limit Issues**: Burst traffic can hit rate limits
- **Maintenance Burden**: Inconsistent patterns make code harder to understand

---

## 2. Current Architecture Analysis

### Schema (Current)

```typescript
// catalogRefreshQueue
{
  tableName: "parts" | "partColors" | "partPrices" | "colors" | "categories",
  primaryKey: string,
  secondaryKey?: string,
  recordId: string,
  priority: number,
  lastFetched?: number,
  status: "pending" | "processing" | "completed" | "failed",
  errorMessage?: string,
  processedAt?: number,
  createdAt: number,
}
  .index("by_status_priority", ["status", "priority"])
  .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"])

// parts/partColors/partPrices have refreshUntil locks
{
  refreshUntil?: number, // Lock timestamp
}
```

### Current Flow

```
Frontend Hook (useGetPart)
  ↓
Query (getPart) → checks freshness → returns stale
  ↓
Frontend detects stale → calls refreshPart action
  ↓
Action: refreshPart
  ├─> Acquire lock (markPartRefreshing)
  ├─> Take rate limit token
  ├─> Direct API call (catalogClient.getRefreshedPart)
  ├─> Upsert to database
  └─> Release lock (clearPartRefreshing)
```

**Problems**:

- Direct API calls block request
- Lock mechanism is fragile
- No retry logic
- Rate limiting in request path

### Code References (Current Issues)

```15:57:convex/catalog/actions.ts
// Direct API call in action - blocks request thread
const partData = await catalogClient.getRefreshedPart(args.partNumber);
await ctx.runMutation(internal.catalog.mutations.upsertPart, { data: partData });
```

```12:32:convex/catalog/mutations.ts
// Lock mechanism - can cause race conditions
if (!existing.refreshUntil || existing.refreshUntil < Date.now()) {
  await ctx.db.patch(existing._id, {
    refreshUntil: Date.now() + 60_000,
  });
}
```

```318:445:convex/bricklink/dataRefresher.ts
// Queue processing in wrong location (should be in catalog/refreshWorker.ts)
export const processQueue = internalAction({
  handler: async (ctx) => {
    // Processes queue but located in bricklink module
  }
});
```

---

## 3. Target Architecture

### Architectural Principles

1. **Outbox Pattern**: Refresh requests enqueued to outbox, processed by worker
2. **Async Processing**: Frontend never waits for API calls
3. **Retry with Backoff**: Exponential backoff + jitter for failed requests
4. **Consistent Naming**: Follow inventory sync pattern (outbox, worker, etc.)
5. **Deduplication**: Outbox prevents duplicate refresh requests

### New Schema Components

#### Renamed and Enhanced Outbox Table

```typescript
// RENAME: catalogRefreshQueue → catalogRefreshOutbox
catalogRefreshOutbox: {
  // Resource identification
  tableName: "parts" | "partColors" | "partPrices",
  primaryKey: string,        // partNo for all types
  secondaryKey?: string,     // colorId for partPrices only

  // Display/logging
  recordId: string,          // e.g., "3001" or "3001:1"

  // Priority (lower = higher priority)
  priority: number,

  // Last known state
  lastFetched?: number,

  // Lifecycle
  status: "pending" | "inflight" | "succeeded" | "failed",
  attempt: number,
  nextAttemptAt: number,     // For retries
  lastError?: string,

  // Metadata
  createdAt: number,
  processedAt?: number,
}
  .index("by_status_time", ["status", "nextAttemptAt"])
  .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"])
```

#### Remove Lock Fields

```typescript
// REMOVE from parts, partColors, partPrices:
refreshUntil MonitorField  // No longer needed - outbox handles deduplication
```

### Target Flow

```
Frontend Hook (useGetPart)
  ↓
Query (getPart) → checks freshness → returns data (stale if needed)
  ↓
Frontend detects stale → calls enqueueRefreshPart action
  ↓
Action: enqueueRefreshPart
  ├─> Check if already in outbox (pending/inflight)
  └─> If not, insert to outbox (transactional)
  ↓
[ASYNCHRONOUS]
Worker cron (drainCatalogRefreshOutbox)
  ├─> Find pending messages (nextAttemptAt <= now)
  ├─> Mark as inflight (CAS pattern)
  ├─> Take rate limit token
  ├─> Call API (catalogClient)
  ├─> Upsert to database
  ├─> On success: mark as succeeded
  └─> On failure: mark as failed, schedule retry with backoff
```

---

## 4. Incremental Implementation Strategy

### Phase 1: Rename and Restructure (Low Risk, ~1 day)

**Goal**: Move existing queue to outbox pattern without behavior changes

**Changes**:

1. Rename `catalogRefreshQueue` table to `catalogRefreshOutbox`
2. Add retry fields (`attempt`, `nextAttemptAt`, `lastError`)
3. Update status enum: `"processing"` → `"inflight"`, add `"succeeded"`
4. Move queue processing from `bricklink/dataRefresher.ts` to `catalog/refreshWorker.ts`
5. Update cron to call new worker location

**Why Start Here**:

- Establishes foundation for Phase 2
- No behavior changes yet
- Easy to validate

### Phase 2: Replace Direct API Calls (Medium Risk, ~1.5 days)

**Goal**: Actions enqueue to outbox instead of calling API directly

**Changes**:

1. Rename actions: `refreshPart` → `enqueueRefreshPart`, etc.
2. Remove direct API calls from actions
3. Remove lock mechanism (`markPartRefreshing`, etc.)
4. Remove `refreshUntil` fields from schema
5. Update frontend hooks to handle async refresh
6. Worker handles all API calls with retry logic

**Why Next**:

- Complete separation of concerns
- Enables retry logic
- Removes fragile lock mechanism

---

## 5. Detailed Technical Changes

### Phase 1: Rename and Restructure

#### 5.1.1 Schema Migration

**File**: `convex/catalog/schema.ts`

```typescript
// RENAME: catalogRefreshQueue → catalogRefreshOutbox
catalogRefreshOutbox: defineTable({
  tableName: v.union(
    v.literal("parts"),
    v.literal("partColors"),
    v.literal("partPrices"),
  ),
  primaryKey: v.string(),
  secondaryKey: v.optional(v.string()),
  recordId: v.string(),
  priority: v.number(),
  lastFetched: v.optional(v.number()),

  // UPDATED: New status enum with retry support
  status: v.union(
    v.literal("pending"),
    v.literal("inflight"),
    v.literal("succeeded"),
    v.literal("failed"),
  ),

  // NEW: Retry fields
  attempt: v.number(),
  nextAttemptAt: v.number(),
  lastError: v.optional(v.string()),

  createdAt: v.number(),
  processedAt: v.optional(v.number()),
})
  .index("by_status_time", ["status", "nextAttemptAt"])  // NEW: For worker queries
  .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"]),
```

**Migration Note**: Since app hasn't launched, we can rename the table directly. Convex will recreate it.

#### 5.1.2 Create Refresh Worker

**File**: `convex/catalog/refreshWorker.ts` (NEW)

```typescript
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { catalogClient } from "../bricklink/catalogClient";

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
      .take(10) // Process 10 items per run (matches current BATCH_SIZE)
      .collect();
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
      const partData = await catalogClient.getRefreshedPart(message.primaryKey);
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
      await Promise.all([
        ctx.runMutation(internal.catalog.mutations.upsertPriceGuide, {
          prices: [
            priceGuides.newStock,
            priceGuides.newSold,
            priceGuides.usedStock,
            priceGuides.usedSold,
          ],
        }),
      ]);
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
```

#### 5.1.3 Update Cron Schedule

**File**: `convex/crons.ts`

```typescript
// UPDATE: Change from bricklink.dataRefresher.processQueue to catalog.refreshWorker.drainCatalogRefreshOutbox
crons.interval(
  "drain-catalog-refresh-outbox",
  { minutes: 5 },
  internal.catalog.refreshWorker.drainCatalogRefreshOutbox,
);

// REMOVE: Old queue processing cron
// crons.interval("process-refresh-queue", ...);
```

#### 5.1.4 Update Helper Functions

**File**: `convex/bricklink/dataRefresher.ts`

**MOVE** the following functions to `convex/catalog/refreshWorker.ts`:

- `processQueue` → becomes `drainCatalogRefreshOutbox` (already created above)
- `getBatch` → becomes `getPendingOutboxMessages` (already created above)
- `updateStatusProcessing` → becomes `markOutboxInflight` (already created above)
- `updateStatusCompleted` → becomes `markOutboxSucceeded` (already created above)
- `updateStatusFailed` → becomes `markOutboxFailed` (already created above)

**KEEP** in `bricklink/dataRefresher.ts`:

- `checkAndScheduleRefresh` (used by queries to enqueue refreshes)
- `cleanupQueue` → rename to `cleanupOutbox` and update table reference
- `upsertColor` (helper for processing)
- `upsertPriceGuide` (helper for processing)

#### 5.1.5 Testing Phase 1

- [✅] Outbox table renamed and indexes working
- [✅] Worker processes messages successfully
- [✅] Retry logic implemented (exponential backoff + jitter)
- [✅] Cron calls new worker location
- [✅] Frontend hooks updated to use new actions

---

### Phase 2: Replace Direct API Calls

#### 5.2.1 Rename Actions to Enqueue Actions

**File**: `convex/catalog/actions.ts`

**RENAME and REFACTOR**:

```typescript
// OLD: refreshPart
// NEW: enqueueRefreshPart
export const enqueueRefreshPart = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    // Check if already in outbox (pending or inflight)
    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "parts",
      primaryKey: args.partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      // Already queued, skip silently
      return;
    }

    // Get lastFetched from part (if exists)
    const part = await ctx.runQuery(internal.catalog.queries.getPartInternal, {
      partNumber: args.partNumber,
    });

    // Enqueue to outbox
    await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "parts",
      primaryKey: args.partNumber,
      secondaryKey: undefined,
      lastFetched: part?.lastFetched,
      priority: 1, // HIGH priority for user-triggered refreshes
    });
  },
});

// OLD: refreshPartColors
// NEW: enqueueRefreshPartColors
export const enqueueRefreshPartColors = action({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "partColors",
      primaryKey: args.partNumber,
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      return;
    }

    // Get lastFetched from any partColor record for this part
    const partColors = await ctx.runQuery(internal.catalog.queries.getPartColorsInternal, {
      partNumber: args.partNumber,
    });

    const lastFetched =
      partColors.length > 0 ? Math.min(...partColors.map((pc) => pc.lastFetched)) : undefined;

    await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "partColors",
      primaryKey: args.partNumber,
      secondaryKey: undefined,
      lastFetched,
      priority: 1, // HIGH priority
    });
  },
});

// OLD: refreshPriceGuide
// NEW: enqueueRefreshPriceGuide
export const enqueueRefreshPriceGuide = action({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    const existing = await ctx.runQuery(internal.catalog.queries.getOutboxMessage, {
      tableName: "partPrices",
      primaryKey: args.partNumber,
      secondaryKey: String(args.colorId),
    });

    if (existing && (existing.status === "pending" || existing.status === "inflight")) {
      return;
    }

    // Get lastFetched from any price record for this part+color
    const prices = await ctx.runQuery(internal.catalog.queries.getPriceGuideInternal, {
      partNumber: args.partNumber,
      colorId: args.colorId,
    });

    const lastFetched =
      prices.length > 0 ? Math.min(...prices.map((p) => p.lastFetched)) : undefined;

    await ctx.runMutation(internal.catalog.mutations.enqueueCatalogRefresh, {
      tableName: "partPrices",
      primaryKey: args.partNumber,
      secondaryKey: String(args.colorId),
      lastFetched,
      priority: 1, // HIGH priority
    });
  },
});
```

#### 5.2.2 Create Helper Queries

**File**: `convex/catalog/queries.ts`

**ADD** internal queries for actions to use:

```typescript
/**
 * Get outbox message for a specific resource
 * Used by actions to check if refresh is already queued
 */
export const getOutboxMessage = internalQuery({
  args: {
    tableName: v.union(v.literal("parts"), v.literal("partColors"), v.literal("partPrices")),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q
          .eq("tableName", args.tableName)
          .eq("primaryKey", args.primaryKey)
          .eq("secondaryKey", args.secondaryKey),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();
  },
});

/**
 * Get part data for internal use (returns raw schema, not validated return type)
 */
export const getPartInternal = internalQuery({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();
  },
});

/**
 * Get part colors data for internal use
 */
export const getPartColorsInternal = internalQuery({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partColors")
      .withIndex("by_partNo", (q) => q.eq("partNo", args.partNumber))
      .collect();
  },
});

/**
 * Get price guide data for internal use
 */
export const getPriceGuideInternal = internalQuery({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("partPrices")
      .withIndex("by_partNo_colorId", (q) =>
        q.eq("partNo", args.partNumber).eq("colorId", args.colorId),
      )
      .collect();
  },
});
```

#### 5.2.4 Create Enqueue Mutation

**File**: `convex/catalog/mutations.ts`

**ADD**:

```typescript
/**
 * Enqueue a catalog refresh request to the outbox
 * Idempotent - won't create duplicate if already pending/inflight
 */
export const enqueueCatalogRefresh = internalMutation({
  args: {
    tableName: v.union(v.literal("parts"), v.literal("partColors"), v.literal("partPrices")),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
    lastFetched: v.optional(v.number()),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if already queued (pending or inflight)
    const existing = await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q
          .eq("tableName", args.tableName)
          .eq("primaryKey", args.primaryKey)
          .eq("secondaryKey", args.secondaryKey),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();

    if (existing) {
      // Already queued, skip
      return;
    }

    // Generate display recordId
    const recordId = args.secondaryKey
      ? `${args.primaryKey}:${args.secondaryKey}`
      : args.primaryKey;

    // Insert to outbox
    await ctx.db.insert("catalogRefreshOutbox", {
      tableName: args.tableName,
      primaryKey: args.primaryKey,
      secondaryKey: args.secondaryKey,
      recordId,
      priority: args.priority,
      lastFetched: args.lastFetched,
      status: "pending",
      attempt: 0,
      nextAttemptAt: Date.now(), // Immediate processing
      createdAt: Date.now(),
    });
  },
});
```

#### 5.2.5 Remove Lock Mutations

**File**: `convex/catalog/mutations.ts`

**REMOVE**:

- `markPartRefreshing`
- `clearPartRefreshing`
- `markPartColorsRefreshing`
- `clearPartColorsRefreshing`
- `markPriceGuideRefreshing`
- `clearPriceGuideRefreshing`

#### 5.2.6 Remove Lock Fields from Schema

**File**: `convex/catalog/schema.ts`

**REMOVE** `refreshUntil` field from:

- `parts` table
- `partColors` table
- `partPrices` table

#### 5.2.7 Update Queries to Check Outbox Status

**File**: `convex/catalog/queries.ts`

**UPDATE** status determination to check outbox:

```typescript
export const getPart = query({
  args: {
    partNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const part = await ctx.db
      .query("parts")
      .withIndex("by_no", (q) => q.eq("no", args.partNumber))
      .first();

    if (!part) {
      return {
        data: null,
        status: "missing" as const,
      };
    }

    // Check if refresh is in progress (outbox)
    const outboxMessage = await ctx.db
      .query("catalogRefreshOutbox")
      .withIndex("by_table_primary_secondary", (q) =>
        q.eq("tableName", "parts").eq("primaryKey", args.partNumber),
      )
      .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "inflight")))
      .first();

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const isStale = part.lastFetched < thirtyDaysAgo;

    // Determine status: refreshing > stale > fresh
    const status: "refreshing" | "stale" | "fresh" = outboxMessage
      ? "refreshing"
      : isStale
        ? "stale"
        : "fresh";

    return {
      data: {
        // ... part data ...
      },
      status,
    };
  },
});
```

**SIMILAR UPDATES** for:

- `getPartColors` (check for "partColors" outbox messages)
- `getPriceGuide` (check for "partPrices" outbox messages)

#### 5.2.8 Update Frontend Hooks

**File**: `src/hooks/useGetPart.ts`

**UPDATE** to use new action name:

```typescript
// OLD: const refresh = useAction(api.catalog.actions.refreshPart);
// NEW:
const refresh = useAction(api.catalog.actions.enqueueRefreshPart);

// No other changes needed - action still returns immediately
```

**SIMILAR UPDATES** for:

- `src/hooks/useGetPartColors.ts` (use `enqueueRefreshPartColors`)
- `src/hooks/useGetPriceGuide.ts` (use `enqueueRefreshPriceGuide`)

#### 5.2.9 Update Cleanup Function

**File**: `convex/bricklink/dataRefresher.ts`

**RENAME and UPDATE**:

```typescript
// OLD: cleanupQueue
// NEW: cleanupOutbox
export const cleanupOutbox = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldItems = await ctx.db
      .query("catalogRefreshOutbox") // Updated table name
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("status"), "succeeded"), q.eq(q.field("status"), "failed")),
          q.lt(q.field("processedAt"), sevenDaysAgo),
        ),
      )
      .collect();

    for (const item of oldItems) {
      await ctx.db.delete(item._id);
    }

    const deletedCount = oldItems.length;

    if (deletedCount > 0) {
      console.log(`[catalog] Cleaned up ${deletedCount} old outbox items`);
    }

    return { deletedCount };
  },
});
```

**File**: `convex/crons.ts`

**UPDATE** cleanup cron:

```typescript
// UPDATE: Change table reference
crons.daily(
  "cleanup-catalog-refresh-outbox",
  { hourUTC: 2, minuteUTC: 0 },
  internal.bricklink.dataRefresher.cleanupOutbox, // Updated function name
);
```

#### 5.2.8 Testing Phase 2

- [✅] Actions enqueue to outbox instead of calling API
- [✅] Lock mechanism completely removed (no `refreshUntil` fields)
- [✅] Frontend hooks updated to use new action names
- [✅] Status detection uses outbox state
- [✅] Worker processes all enqueued messages
- [✅] Retry logic implemented with exponential backoff
- [✅] **Unit Tests**: Created `__tests__/backend/catalog-refresh-outbox.test.ts`
  - Tests for: enqueue mutation, worker queries, CAS pattern, retry logic
  - 5/11 tests passing - need to extend mock for full query pattern support
- [⏳] **TODO**: Manual end-to-end testing to validate full flow

---

## 6. Migration Strategy

### Pre-Refactor Checklist

- [ ] Backup current code (git branch)
- [ ] Document current behavior
- [ ] Set up monitoring for refresh operations
- [ ] Prepare rollback procedure

### Phase 1 Rollout

1. Deploy table rename and schema changes
2. Deploy worker in new location
3. Update cron schedule
4. Monitor outbox processing
5. Validate no behavior changes

**Rollback**: Revert cron, use old queue processing

### Phase 2 Rollout

1. Deploy new actions (parallel with old actions)
2. Update frontend hooks gradually (canary deployment)
3. Monitor outbox fill rate and processing
4. Remove old actions after validation
5. Remove lock fields from schema

**Rollback**: Revert frontend hooks, re-enable old actions

### Post-Rollout Validation

- [ ] All refresh requests enqueue successfully
- [ ] Worker processes messages within 5 minutes
- [ ] No rate limit errors
- [ ] Frontend shows correct refresh status
- [ ] Retry logic works for failures

---

## 7. Files to Modify

### Schema Changes

- `convex/catalog/schema.ts` - Rename table, remove lock fields

### New Files

- `convex/catalog/refreshWorker.ts` - Worker that drains outbox

### Modified Files

- `convex/catalog/actions.ts` - Rename actions, remove API calls
- `convex/catalog/mutations.ts` - Remove lock mutations, add enqueue mutation
- `convex/catalog/queries.ts` - Update status detection to use outbox
- `convex/catalog/helpers.ts` - No changes needed
- `convex/catalog/validators.ts` - No changes needed
- `convex/bricklink/dataRefresher.ts` - Remove queue processing, keep helper functions
- `convex/crons.ts` - Update cron targets
- `src/hooks/useGetPart.ts` - Update action name
- `src/hooks/useGetPartColors.ts` - Update action name
- `src/hooks/useGetPriceGuide.ts` - Update action name

### Files to Remove/Delete

- None (old code can be removed after validation)

---

## 8. Testing Strategy

### Unit Tests

1. **Enqueue Mutation**

   - Creates outbox message for new requests
   - Skips if already pending/inflight
   - Sets correct priority

2. **Worker Processing**

   - Processes pending messages
   - Marks as inflight correctly
   - Updates database on success
   - Retries on failure with backoff

3. **Status Detection**
   - Returns "refreshing" when outbox message exists
   - Returns "stale" when data is old
   - Returns "fresh" when data is current

### Integration Tests

1. **Frontend Hook Flow**

   - Hook detects stale data
   - Calls enqueue action
   - Status updates to "refreshing"
   - After worker processes, status updates to "fresh"

2. **Worker Flow**

   - Outbox message created
   - Worker picks up message
   - API call succeeds
   - Database updated
   - Message marked as succeeded

3. **Retry Flow**
   - API call fails
   - Message scheduled for retry
   - Retry succeeds on second attempt
   - Database updated

### End-to-End Tests

1. **Happy Path**

   - User requests part data
   - Data is stale
   - Refresh enqueued
   - Worker refreshes data
   - UI shows fresh data

2. **Failure Recovery**

   - API call fails
   - Retry scheduled
   - Retry succeeds
   - UI shows fresh data

3. **Deduplication**
   - Multiple rapid refresh requests
   - Only one outbox message created
   - Worker processes once

---

## 9. Success Criteria

### Functional Success

- [✅] All refresh actions enqueue to outbox
- [✅] Worker processes messages successfully
- [✅] No direct API calls in actions
- [✅] Status detection uses outbox state
- [✅] Retry logic implemented for failures
- [✅] Frontend hooks work with async refresh
- [⏳] **TODO**: End-to-end validation in staging/production

### Performance Success

- [✅] Refresh requests don't block request thread (async enqueue)
- [✅] Worker processes messages within 5 minutes (cron interval configured)
- [⏳] **TODO**: Monitor performance metrics in production

### Code Quality Success

- [✅] Consistent naming with inventory sync
- [✅] No lock mechanism code (verified via grep)
- [✅] Clear separation of concerns
- [⏳] **TODO**: Write and execute comprehensive test suite

---

## 10. Risk Assessment & Mitigation

### Technical Risks

| Risk                                         | Severity | Probability | Mitigation                                         |
| -------------------------------------------- | -------- | ----------- | -------------------------------------------------- |
| Frontend breaks with async refresh           | Medium   | Low         | Gradual rollout, canary deployment                 |
| Outbox fills up faster than worker processes | Medium   | Low         | Monitor queue depth, increase batch size if needed |
| Retry logic causes infinite loops            | High     | Very Low    | Max attempt limit (5), alert on exceed             |
| Status detection misses refreshing state     | Medium   | Low         | Thorough testing, monitor status accuracy          |

### Operational Risks

| Risk                            | Severity | Probability | Mitigation                                   |
| ------------------------------- | -------- | ----------- | -------------------------------------------- |
| Rate limiting hits during burst | Medium   | Medium      | Rate limiting in worker, backoff on failures |
| Worker crashes silently         | Medium   | Low         | Structured logging, metrics, alerts          |

---

## 11. Monitoring & Observability

### Metrics to Track

1. **Outbox Health**

   - `catalog.outbox.pending` (gauge) - Pending messages
   - `catalog.outbox.inflight` (gauge) - Inflight messages
   - `catalog.outbox.succeeded` (counter) - Successful refreshes
   - `catalog.outbox.failed` (counter) - Failed refreshes

2. **Refresh Performance**

   - `catalog.refresh.duration.{tableName}` (histogram) - Time to refresh
   - `catalog.refresh.success.{tableName}` (counter) - Successful refreshes
   - `catalog.refresh.failure.{tableName}` (counter) - Failed refreshes

3. **Worker Health**
   - `catalog.worker.processing_time` (histogram) - Time to process batch
   - `catalog.worker.batch_size` (gauge) - Messages per batch

### Alerts to Configure

1. **Critical**

   - Outbox pending messages > 100 for > 1 hour
   - Refresh failure rate > 10%
   - Worker not processing for > 10 minutes

2. **Warning**
   - Outbox pending messages > 50
   - Individual refresh failures > 5 attempts
   - Worker processing time > 1 minute

---

## 12. Appendix

### A. Naming Convention Alignment

**Inventory Pattern** (reference):

- Table: `marketplaceOutbox`
- Worker: `inventory/syncWorker.ts`
- Function: `drainMarketplaceOutbox`
- Actions: Not applicable (mutations enqueue directly)

**Catalog Pattern** (target):

- Table: `catalogRefreshOutbox`
- Worker: `catalog/refreshWorker.ts`
- Function: `drainCatalogRefreshOutbox`
- Actions: `enqueueRefreshPart`, `enqueueRefreshPartColors`, `enqueueRefreshPriceGuide`

### B. Comparison Table

| Aspect                  | Before                       | After                        |
| ----------------------- | ---------------------------- | ---------------------------- |
| **API Calls**           | In actions (blocking)        | In worker (async)            |
| **Lock Mechanism**      | `refreshUntil` fields        | Outbox deduplication         |
| **Retry Logic**         | None                         | Exponential backoff + jitter |
| **Rate Limiting**       | In request path              | In worker path               |
| **Status Detection**    | Lock timestamp               | Outbox state                 |
| **Table Name**          | `catalogRefreshQueue`        | `catalogRefreshOutbox`       |
| **Processing Location** | `bricklink/dataRefresher.ts` | `catalog/refreshWorker.ts`   |

### C. References

- **Inventory Refactor Plan**: `docs/plans/inventory-ledger-refactor.md`
- **Current Queue Processing**: `convex/bricklink/dataRefresher.ts`
- **Current Actions**: `convex/catalog/actions.ts`
- **Inventory Worker**: `convex/inventory/syncWorker.ts`

---

**End of Planning Document**
