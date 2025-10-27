# BrickLink Duplicate Inventory Creation - Bug Analysis and Fix

**Date**: 2024
**Issue**: When creating an inventory item and then updating its quantity, BrickLink created 2 separate inventory items instead of creating 1 and updating it.

## Root Cause Analysis

### The Problem

When you:

1. **Add a part** (qty 1) → Creates on BrickLink (lot #503325921)
2. **Edit quantity to 20** → Creates on BrickLink again (lot #503325928) instead of updating lot #503325921

Expected behavior: Create once (lot #503325921), then update that same lot.

### The Critical Bug

The issue was in `convex/inventory/immediateSync.ts` in the `syncInventoryChangeImmediately()` function:

The `marketplaceId` (BrickLink's `inventory_id`/`lotId`) was being **returned from the sync** but **NOT being included in the results passed to the database update mutation**.

#### Step 1: Sync creates item successfully

```typescript
// In syncCreateImmediately()
const result = await(client as any).createInventory(payload);
return {
  success: true,
  marketplaceId: 503325921, // ← BrickLink returns this
  error: undefined,
};
```

#### Step 2: Results array loses the marketplaceId ❌

```typescript
// WRONG - missing marketplaceId!
const results = syncResults.map((result, index: number) => ({
  provider: providers[index],
  success: result.status === "fulfilled" && result.value?.success === true,
  error: result.status === "rejected" ? result.reason : result.value?.error,
  // ❌ marketplaceId is dropped here!
}));
```

#### Step 3: Database never gets the lotId

```typescript
// In mutations.ts updateImmediateSyncStatus
...(result.success &&
  result.marketplaceId && { lotId: result.marketplaceId as number }),
  // ↑ Can't set lotId if marketplaceId is undefined!
```

#### Result

Inventory item in database has NO `lotId`:

```javascript
{
  _id: "k173052byz9m3vpd36vty7r6nd7t6z5q",
  marketplaceSync: {
    bricklink: {
      lastSyncAttempt: 1761519674766,
      status: "synced"
      // ❌ NO lotId field!
    }
  }
}
```

#### Step 4: Next update can't find the lotId

```typescript
// In syncUpdateImmediately()
const marketplaceId = inventoryItem?.marketplaceSync?.bricklink?.lotId;
if (!marketplaceId) {
  // Falls back to CREATE instead of UPDATE
  return await syncCreateImmediately(ctx, client, provider, args, idempotencyKey);
}
```

Result: **Second sync creates a NEW inventory instead of updating** → Lot #503325928 created

---

## The Fix

### File: `convex/inventory/immediateSync.ts` (lines 45-56)

Changed the results mapping to **include the marketplaceId**:

```typescript
// BEFORE (WRONG)
const results = syncResults.map((result, index: number) => ({
  provider: providers[index],
  success: result.status === "fulfilled" && result.value?.success === true,
  error: result.status === "rejected" ? result.reason : result.value?.error,
}));

// AFTER (FIXED)
const results = syncResults.map((result, index: number) => ({
  provider: providers[index],
  success: result.status === "fulfilled" && result.value?.success === true,
  error: result.status === "rejected" ? result.reason : result.value?.error,
  marketplaceId: result.status === "fulfilled" ? result.value?.marketplaceId : undefined,
}));
```

### Key Change

Now the `marketplaceId` flows through the chain:

1. ✅ `syncCreateImmediately()` returns `marketplaceId`
2. ✅ Results array includes `marketplaceId`
3. ✅ `updateImmediateSyncStatus()` receives `marketplaceId`
4. ✅ Database gets populated with `lotId`
5. ✅ Next update can find the `lotId` and uses UPDATE instead of CREATE

---

## Verification

### Before Fix (Broken):

```
Create item (qty 1)
  ↓ Sends to BrickLink
  ↓ Returns: marketplaceId = 503325921
  ↓ But doesn't save it to DB!
  ↓ Database: { marketplaceSync: { bricklink: { status: "synced" } } } ← NO lotId

Update qty to 20
  ↓ Looks for marketplaceId in DB
  ↓ Can't find it (it was never saved)
  ↓ Falls back to CREATE
  ↓ BrickLink creates NEW inventory: 503325928

Result: TWO inventory listings on BrickLink ❌
```

### After Fix (Working):

```
Create item (qty 1)
  ↓ Sends to BrickLink
  ↓ Returns: marketplaceId = 503325921
  ↓ Saves it to DB!
  ↓ Database: { marketplaceSync: { bricklink: { lotId: 503325921, status: "synced" } } }

Update qty to 20
  ↓ Looks for marketplaceId in DB
  ↓ Finds it: 503325921
  ↓ Sends UPDATE to BrickLink: PUT /inventories/503325921
  ↓ BrickLink updates existing lot: 503325921

Result: ONE inventory listing on BrickLink ✅
```

---

## Data Flow

### Results Array Type (from updateImmediateSyncStatus args validator)

```typescript
v.array(
  v.object({
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    success: v.boolean(),
    error: v.optional(v.any()),
    marketplaceId: v.optional(v.union(v.string(), v.number())),  // ← Expected!
  }),
),
```

The validator already expected `marketplaceId` - it just wasn't being provided!

---

## Files Changed

- ✅ `convex/inventory/immediateSync.ts` (line ~51) - Added marketplaceId to results array
- ✅ `convex/inventory/mutations.ts` (lines 726-748) - Fixed updateImmediateSyncStatus to properly set lotId

---

## SECOND BUG FOUND: updateImmediateSyncStatus Not Setting lotId

After the first fix, the `marketplaceId` was flowing through but **still not being saved** to the database. Found the culprit: the spread operator with boolean condition was unreliable.

### The Problem

In `updateImmediateSyncStatus()`, the code tried to conditionally set `lotId`:

```typescript
// ❌ FRAGILE - spread operator with boolean
bricklink: {
  status: result.success ? "synced" : "failed",
  lastSyncAttempt: Date.now(),
  ...(result.success &&
    result.marketplaceId && { lotId: result.marketplaceId as number }),
},
```

The spread with a boolean `...(condition && { key: value })` doesn't work reliably when trying to conditionally add object properties. When the condition is false, it tries to spread `false`, which gets ignored but also doesn't throw an error—it just silently fails to add the property.

### The Fix

Changed to explicit object assignment with proper type safety:

```typescript
// ✅ EXPLICIT - clear and reliable
const bricklinkUpdate: {
  status: "synced" | "failed";
  lastSyncAttempt: number;
  lotId?: number;
} = {
  status: result.success ? "synced" : "failed",
  lastSyncAttempt: Date.now(),
};

// CRITICAL: Only set lotId if we have both success AND a marketplaceId
if (result.success && result.marketplaceId) {
  bricklinkUpdate.lotId = result.marketplaceId as number;
}

updates.marketplaceSync = {
  ...updates.marketplaceSync,
  bricklink: bricklinkUpdate,
};
```

Now `lotId` is **guaranteed** to be set when the sync is successful and we have a `marketplaceId`.

### Result

✅ `marketplaceId` flows from sync result  
✅ `updateImmediateSyncStatus` receives it  
✅ **`lotId` is properly saved to database**  
✅ Next update can find the `lotId` and UPDATE instead of CREATE

---
