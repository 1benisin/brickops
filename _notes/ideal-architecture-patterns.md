# Ideal Architecture Patterns

> **Purpose**: This document outlines the architecture patterns we would use if starting from scratch. The goal is maximum simplicity while handling real-world concerns like rate limiting, retries, and dependent operations.

---

## Core Principles

1. **Self-scheduling over polling** - Functions schedule their own retries instead of cron jobs polling a queue
2. **Fail fast, retry smart** - Don't catch errors silently; let them bubble up with proper retry logic
3. **Data dependencies are explicit** - If operation B needs data from operation A, make that relationship clear
4. **Single source of truth** - BrickLink is our primary data source; other sources enrich but don't override

---

## Pattern 1: Rate-Limited External API Calls

### The Problem

External APIs (BrickLink, BrickOwl, Rebrickable) have rate limits. We need to:

- Respect those limits
- Retry when rate limited
- Give up after reasonable attempts

### The Pattern: Self-Scheduling Retry

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACTION                                    │
│                                                                  │
│   1. Try to consume rate limit token                            │
│      │                                                          │
│      ├─► DENIED → Schedule self for later (attempt + 1)         │
│      │            If attempt >= MAX_RETRIES → throw error       │
│      │                                                          │
│      └─► GRANTED → Make API call                                │
│                    │                                            │
│                    ├─► SUCCESS → Call mutation to save result   │
│                    │                                            │
│                    └─► FAILURE → Schedule self for later        │
│                                  (with exponential backoff)     │
└─────────────────────────────────────────────────────────────────┘
```

### Example Implementation

```typescript
const MAX_RETRIES = 3;

export const fetchPartFromBricklink = internalAction({
  args: {
    partNumber: v.string(),
    attempt: v.optional(v.number()),
    onComplete: v.optional(
      v.object({
        action: v.string(), // e.g., "internal.inventory.continueAddItem"
        args: v.any(), // arguments to pass to the continuation
      }),
    ),
  },
  handler: async (ctx, { partNumber, attempt = 1, onComplete }) => {
    // 1. Check rate limit
    const token = await ctx.runMutation(internal.ratelimiter.consumeToken, {
      bucket: "bricklink:catalog",
      provider: "bricklink",
    });

    if (!token.ok) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Failed to fetch part ${partNumber}: rate limit exceeded after ${MAX_RETRIES} attempts`,
        );
      }
      // Schedule retry after the rate limit window
      await ctx.scheduler.runAfter(token.retryAfter, internal.catalog.fetchPartFromBricklink, {
        partNumber,
        attempt: attempt + 1,
        onComplete,
      });
      return;
    }

    // 2. Make the API call
    try {
      const partData = await bricklinkApi.getPart(partNumber);

      // 3. Save the result
      await ctx.runMutation(internal.catalog.upsertPart, { data: partData });

      // 4. Trigger continuation if provided
      if (onComplete) {
        await ctx.scheduler.runAfter(0, onComplete.action, onComplete.args);
      }
    } catch (error) {
      // Exponential backoff for API failures
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 60000);

      if (attempt >= MAX_RETRIES) {
        throw new Error(`Failed to fetch part ${partNumber}: ${error.message}`);
      }

      await ctx.scheduler.runAfter(backoffMs, internal.catalog.fetchPartFromBricklink, {
        partNumber,
        attempt: attempt + 1,
        onComplete,
      });
    }
  },
});
```

### Rate Limiter (Simplified)

The rate limiter only needs to do one thing: track tokens in a time window.

```typescript
// Schema: just track bucket state
rateLimits: defineTable({
  bucket: v.string(),
  remaining: v.number(),
  resetAt: v.number(),
});

// Single mutation: try to consume a token
export const consumeToken = internalMutation({
  args: { bucket: v.string(), provider: v.string() },
  handler: async (ctx, { bucket, provider }) => {
    const config = getRateLimitConfig(provider);
    const now = Date.now();

    const rate = await ctx.db
      .query("rateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
      .first();

    // New bucket or expired window → reset
    if (!rate || now >= rate.resetAt) {
      const newRate = {
        bucket,
        remaining: config.capacity - 1,
        resetAt: now + config.windowMs,
      };
      if (rate) {
        await ctx.db.patch(rate._id, newRate);
      } else {
        await ctx.db.insert("rateLimits", newRate);
      }
      return { ok: true, retryAfter: 0 };
    }

    // Have tokens → consume one
    if (rate.remaining > 0) {
      await ctx.db.patch(rate._id, { remaining: rate.remaining - 1 });
      return { ok: true, retryAfter: 0 };
    }

    // No tokens → return retry time
    return { ok: false, retryAfter: rate.resetAt - now };
  },
});
```

**What we removed:**

- Circuit breaker (adds complexity, rarely needed)
- Alert thresholds (use logging/monitoring instead)
- Request counting (not needed for basic rate limiting)

---

## Pattern 2: Multi-Source Data Aggregation (Catalog Parts)

### The Problem

A catalog part needs data from multiple sources:

- **BrickLink** (required): Part details, colors, price guides
- **BrickOwl** (optional): BrickOwl ID for marketplace sync
- **Rebrickable** (optional): LDraw ID, LEGO ID for cross-referencing

### The Pattern: Orchestrator Action with Parallel Fetches

```
┌────────────────────────────────────────────────────────────────────┐
│                    ensureCatalogPart                               │
│                    (orchestrator action)                           │
│                                                                    │
│   1. Check if part exists and is fresh                            │
│      └─► EXISTS & FRESH → Return immediately                      │
│                                                                    │
│   2. Fetch required data (BrickLink)                              │
│      └─► FAIL → Retry or throw                                    │
│                                                                    │
│   3. Fetch optional data (BrickOwl, Rebrickable) - best effort    │
│      └─► FAIL → Log warning, continue with partial data           │
│                                                                    │
│   4. Merge all data and upsert part                               │
│                                                                    │
│   5. Trigger any waiting continuations                            │
└────────────────────────────────────────────────────────────────────┘
```

### Example Implementation

```typescript
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
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { partNumber, forceRefresh = false, onComplete, attempt = 1 }) => {
    // 1. Check if we already have fresh data
    if (!forceRefresh) {
      const existing = await ctx.runQuery(internal.catalog.getPartByNumber, { partNumber });
      if (existing && isFresh(existing.updatedAt)) {
        // Part exists and is fresh - trigger continuation immediately
        if (onComplete) {
          await ctx.scheduler.runAfter(0, onComplete.action, onComplete.args);
        }
        return { status: "exists", part: existing };
      }
    }

    // 2. Rate limit check for BrickLink (required source)
    const token = await ctx.runMutation(internal.ratelimiter.consumeToken, {
      bucket: "bricklink:catalog",
      provider: "bricklink",
    });

    if (!token.ok) {
      if (attempt >= 3) {
        throw new Error(`Failed to ensure part ${partNumber}: rate limit exceeded`);
      }
      await ctx.scheduler.runAfter(token.retryAfter, internal.catalog.ensureCatalogPart, {
        partNumber,
        forceRefresh,
        onComplete,
        attempt: attempt + 1,
      });
      return { status: "scheduled" };
    }

    // 3. Fetch required data from BrickLink
    const bricklinkData = await fetchBricklinkPart(ctx, partNumber);

    // 4. Fetch optional data (best effort, don't fail if these fail)
    const [brickowlId, rebrickableData] = await Promise.all([
      fetchBrickowlId(ctx, partNumber).catch(() => null),
      fetchRebrickableData(ctx, partNumber).catch(() => null),
    ]);

    // 5. Merge and save
    const partData = {
      ...bricklinkData,
      brickowlId: brickowlId ?? undefined,
      ldrawId: rebrickableData?.ldrawId ?? undefined,
      legoId: rebrickableData?.legoId ?? undefined,
    };

    await ctx.runMutation(internal.catalog.upsertPart, { data: partData });

    // 6. Trigger continuation
    if (onComplete) {
      await ctx.scheduler.runAfter(0, onComplete.action, onComplete.args);
    }

    return { status: "created", part: partData };
  },
});

// Helper to check freshness (e.g., data older than 24 hours needs refresh)
function isFresh(updatedAt: number): boolean {
  const FRESHNESS_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
  return Date.now() - updatedAt < FRESHNESS_THRESHOLD;
}
```

---

## Pattern 3: Dependent Operations (Inventory → Catalog)

### The Problem

When adding inventory, we need catalog data to exist first:

- Part must exist in our catalog
- Color must exist in our catalog
- Price data should exist for accurate valuations

If the data doesn't exist, we need to fetch it, then continue with the inventory operation.

### The Pattern: Continuation Callbacks

```
┌────────────────────────────────────────────────────────────────────┐
│  User calls: addInventoryItem({ partNumber, colorId, quantity })   │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                        addInventoryItem                            │
│                                                                    │
│   1. Check if part exists in catalog                              │
│      │                                                            │
│      ├─► MISSING → Call ensureCatalogPart with onComplete:        │
│      │             { action: "continueAddInventory", args: {...} }│
│      │             Return { status: "pending_catalog" }           │
│      │                                                            │
│      └─► EXISTS → Continue to step 2                              │
│                                                                    │
│   2. Check if color exists in catalog                             │
│      │                                                            │
│      ├─► MISSING → Call ensureColor with onComplete...            │
│      │                                                            │
│      └─► EXISTS → Continue to step 3                              │
│                                                                    │
│   3. Create inventory item                                        │
│                                                                    │
│   4. Return { status: "created", item }                           │
└────────────────────────────────────────────────────────────────────┘
```

### Example Implementation

```typescript
// Public action - entry point for adding inventory
export const addInventoryItem = action({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
    quantity: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
  },
  handler: async (ctx, args) => {
    // Delegate to internal action that handles the flow
    return await ctx.runAction(internal.inventory.processAddInventoryItem, {
      ...args,
      step: "check_part",
    });
  },
});

// Internal action - handles the multi-step flow
export const processAddInventoryItem = internalAction({
  args: {
    partNumber: v.string(),
    colorId: v.number(),
    quantity: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
    step: v.string(), // "check_part" | "check_color" | "create_item"
  },
  handler: async (ctx, args) => {
    const { partNumber, colorId, quantity, condition, step } = args;

    // Step 1: Ensure part exists
    if (step === "check_part") {
      const part = await ctx.runQuery(internal.catalog.getPartByNumber, { partNumber });

      if (!part) {
        // Part missing - fetch it and continue after
        await ctx.runAction(internal.catalog.ensureCatalogPart, {
          partNumber,
          onComplete: {
            action: "internal.inventory.processAddInventoryItem",
            args: { ...args, step: "check_color" },
          },
        });
        return { status: "pending_catalog", message: "Fetching part data..." };
      }

      // Part exists - move to next step
      return await ctx.runAction(internal.inventory.processAddInventoryItem, {
        ...args,
        step: "check_color",
      });
    }

    // Step 2: Ensure color exists
    if (step === "check_color") {
      const color = await ctx.runQuery(internal.catalog.getColorById, { colorId });

      if (!color) {
        await ctx.runAction(internal.catalog.ensureColor, {
          colorId,
          onComplete: {
            action: "internal.inventory.processAddInventoryItem",
            args: { ...args, step: "create_item" },
          },
        });
        return { status: "pending_catalog", message: "Fetching color data..." };
      }

      return await ctx.runAction(internal.inventory.processAddInventoryItem, {
        ...args,
        step: "create_item",
      });
    }

    // Step 3: Create the inventory item
    if (step === "create_item") {
      const item = await ctx.runMutation(internal.inventory.createItem, {
        partNumber,
        colorId,
        quantity,
        condition,
      });

      return { status: "created", item };
    }
  },
});
```

### Alternative: Simpler "Ensure Then Do" Pattern

For simpler cases, you can inline the checks:

```typescript
export const addInventoryItem = internalAction({
  args: { partNumber: v.string(), colorId: v.number(), quantity: v.number() },
  handler: async (ctx, args) => {
    // Ensure part exists (will schedule and return if needs fetching)
    const partResult = await ctx.runAction(internal.catalog.ensureCatalogPart, {
      partNumber: args.partNumber,
    });

    if (partResult.status === "scheduled") {
      // Part is being fetched - reschedule ourselves
      await ctx.scheduler.runAfter(
        5000, // Check again in 5 seconds
        internal.inventory.addInventoryItem,
        args,
      );
      return { status: "waiting_for_catalog" };
    }

    // Part exists - create inventory item
    const item = await ctx.runMutation(internal.inventory.createItem, args);
    return { status: "created", item };
  },
});
```

---

## Pattern 4: Bulk Operations with Progress

### The Problem

Sometimes we need to process many items (e.g., import 500 inventory items). We need to:

- Not timeout (Convex actions have time limits)
- Show progress to the user
- Handle partial failures gracefully

### The Pattern: Chunked Processing with Progress Table

```
┌────────────────────────────────────────────────────────────────────┐
│                        Import Flow                                 │
│                                                                    │
│   1. Create import job record with total count                    │
│                                                                    │
│   2. Process first chunk (e.g., 10 items)                         │
│      - Update progress: processed = 10                            │
│      - Schedule next chunk                                        │
│                                                                    │
│   3. Repeat until all items processed                             │
│                                                                    │
│   4. Mark job complete                                            │
└────────────────────────────────────────────────────────────────────┘
```

```typescript
export const startBulkImport = internalAction({
  args: { items: v.array(v.any()) },
  handler: async (ctx, { items }) => {
    // Create job record
    const jobId = await ctx.runMutation(internal.jobs.createJob, {
      type: "bulk_import",
      totalItems: items.length,
      processedItems: 0,
      status: "running",
    });

    // Store items for processing (or pass via scheduler if small)
    await ctx.runMutation(internal.jobs.storeJobData, {
      jobId,
      items,
    });

    // Start processing
    await ctx.scheduler.runAfter(0, internal.inventory.processImportChunk, {
      jobId,
      offset: 0,
    });

    return { jobId };
  },
});

const CHUNK_SIZE = 10;

export const processImportChunk = internalAction({
  args: { jobId: v.id("jobs"), offset: v.number() },
  handler: async (ctx, { jobId, offset }) => {
    const job = await ctx.runQuery(internal.jobs.getJob, { jobId });
    if (!job || job.status !== "running") return;

    const items = await ctx.runQuery(internal.jobs.getJobItems, {
      jobId,
      offset,
      limit: CHUNK_SIZE,
    });

    // Process this chunk
    for (const item of items) {
      try {
        await ctx.runAction(internal.inventory.addInventoryItem, item);
      } catch (error) {
        // Log failure but continue
        await ctx.runMutation(internal.jobs.recordFailure, {
          jobId,
          item,
          error: error.message,
        });
      }
    }

    // Update progress
    const newOffset = offset + items.length;
    await ctx.runMutation(internal.jobs.updateProgress, {
      jobId,
      processedItems: newOffset,
    });

    // More items? Schedule next chunk
    if (items.length === CHUNK_SIZE) {
      await ctx.scheduler.runAfter(0, internal.inventory.processImportChunk, {
        jobId,
        offset: newOffset,
      });
    } else {
      // Done!
      await ctx.runMutation(internal.jobs.completeJob, { jobId });
    }
  },
});
```

---

## Summary: When to Use Each Pattern

| Scenario                                 | Pattern                                   |
| ---------------------------------------- | ----------------------------------------- |
| Single API call with rate limiting       | Self-scheduling retry                     |
| Fetching data from multiple sources      | Orchestrator action with parallel fetches |
| Operation depends on other data existing | Continuation callbacks                    |
| Processing many items                    | Chunked processing with progress          |

---

## What We're NOT Using

1. **Outbox tables + polling crons** - More complex, less responsive
2. **Circuit breakers** - Adds complexity; rate limiting handles the common case
3. **Complex state machines** - Simple if/else with step parameters is clearer
4. **Fire-and-forget scheduling** - Always track what we scheduled via continuations

---

## Migration Path

1. **Phase 1**: Simplify rate limiter (remove circuit breaker, alerts)
2. **Phase 2**: Implement `ensureCatalogPart` with new pattern
3. **Phase 3**: Update inventory operations to use continuation pattern
4. **Phase 4**: Remove old outbox tables and cron jobs
5. **Phase 5**: Add bulk import with progress tracking
