# Inventory History Simplification Refactor

**Status:** Planning  
**Owner:** Dev Team  
**Date:** 2025-01-13  
**Related Plan:** This supersedes `inventory-history-undo-refactor.md`

---

## Executive Summary

Remove all undo functionality from inventory history and simplify the schema to use flexible `oldData`/`newData` JSON fields. This refactor focuses on making inventory history a pure audit trail for searching, sorting, and filtering, with no complex inverse operations.

### Key Changes

- ✅ **Remove:** All undo tracking fields (`isUndo`, `undoOfHistoryId`, `undoneByHistoryId`)
- ✅ **Remove:** `undoHistory` mutation and all undo UI components
- ✅ **Simplify:** Use `oldData?: Partial<InventoryItem>` and `newData?: Partial<InventoryItem>` for snapshots
- ✅ **Enhance:** UI displays two stacked rows per history entry showing old/new with visual diff highlighting
- ✅ **Focus:** History is now searchable audit trail only, not for rollback operations

---

## Objective

Create a simpler, more maintainable inventory history system that:

- Stores only what changed using flexible JSON snapshots
- Provides excellent search, filter, and sort capabilities
- Shows clear visual diffs in the UI
- Is future-proof against schema changes
- Eliminates complex inverse operation logic

---

## Non-Goals

- Do not implement rollback or undo mechanisms
- Do not change marketplace sync architecture (immediate sync remains)
- Do not modify existing CRUD operations beyond history recording
- Do not add any new query capabilities beyond basic filtering

---

## Current State Analysis

### Current Schema (inventoryHistory table)

```typescript
inventoryHistory: defineTable({
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  changeType: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("adjust"),
    v.literal("delete"),
    v.literal("batch_sync"),
    v.literal("batch_sync_failed"),
  ),
  deltaAvailable: v.optional(v.number()),
  deltaReserved: v.optional(v.number()),
  actorUserId: v.id("users"),
  reason: v.optional(v.string()),
  createdAt: v.number(),
  marketplace: v.optional(v.union(v.literal("bricklink"), v.literal("brickowl"))),
  marketplaceLotId: v.optional(v.union(v.number(), v.string())),
  syncError: v.optional(v.string()),
  // ❌ REMOVE - Undo tracking fields
  previousData: v.optional(v.any()),
  newData: v.optional(v.any()),
  isUndo: v.optional(v.boolean()),
  undoOfHistoryId: v.optional(v.id("inventoryHistory")),
  undoneByHistoryId: v.optional(v.id("inventoryHistory")),
});
```

### Current Implementation Issues

1. **Complex undo logic** in `convex/inventory/mutations.ts` (lines 356-519) requires:

   - Field-scoped inverse patching
   - Restore-from-delete logic
   - Linking records bidirectionally
   - Complex state management

2. **UI complexity** in `src/app/(authenticated)/inventory/history/page.tsx`:

   - Undo button in every row
   - "Undone" badges
   - Undo status filtering
   - Special dialog for undo confirmation

3. **Schema bloat**: Tracking fields for relationships between history entries

4. **Difficulty debugging**: Undo-of-undo chains are confusing

---

## Target Design

### New Simplified Schema

```typescript
inventoryHistory: defineTable({
  // Core identity
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  timestamp: v.number(), // Renamed from createdAt for clarity

  // Actor tracking
  userId: v.optional(v.id("users")), // Renamed from actorUserId, optional for automation
  action: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("delete"),
  ),

  // Change snapshots - ONLY store changed fields
  oldData: v.optional(v.any()), // Partial<InventoryItem> - before state
  newData: v.optional(v.any()), // Partial<InventoryItem> - after state

  // Context / metadata
  source: v.string(), // "manual" | "syncBricklink" | "bulkImport" | "automation"
  reason: v.optional(v.string()), // User-provided explanation
  relatedTransactionId: v.optional(v.string()), // For sales, imports, etc.
})
  .index("by_item", ["itemId"])
  .index("by_businessAccount", ["businessAccountId"])
  .index("by_timestamp", ["businessAccountId", "timestamp"]),
```

### Key Simplifications

1. **Single action enum**: Only `create`, `update`, `delete` (remove `adjust`, `batch_sync`, etc.)
2. **No delta fields**: Use `oldData` and `newData` to calculate deltas
3. **No undo tracking**: Remove all `isUndo`, `undoOf*`, `undoneBy*` fields
4. **Flexible snapshots**: Store only changed fields as JSON
5. **Clear source tracking**: Add `source` field for change origin
6. **Timestamp naming**: Use `timestamp` instead of `createdAt` for clarity
7. **Optional userId**: Allow automation to leave userId null

### Data Recording Rules

#### For CREATE actions:

```typescript
{
  action: "create",
  oldData: undefined, // Item didn't exist
  newData: {
    name: "2x4 Brick",
    partNumber: "3001",
    colorId: "1",
    location: "Bin A1",
    quantityAvailable: 100,
    condition: "new",
    // ... all fields from created item
  }
}
```

#### For UPDATE actions:

```typescript
{
  action: "update",
  oldData: {
    quantityAvailable: 100,
    location: "Bin A1", // Only fields that changed
  },
  newData: {
    quantityAvailable: 95,
    location: "Bin B2", // Only changed fields
  }
}
```

#### For DELETE actions:

```typescript
{
  action: "delete",
  oldData: {
    name: "2x4 Brick",
    partNumber: "3001",
    colorId: "1",
    location: "Bin A1",
    quantityAvailable: 100,
    condition: "new",
    // ... full state of deleted item
  },
  newData: undefined, // Item no longer exists
}
```

---

## Backend Implementation

### Step 1: Update Schema Definition

**File:** `convex/inventory/schema.ts`

```typescript
inventoryHistory: defineTable({
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  timestamp: v.number(),
  userId: v.optional(v.id("users")),
  action: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("delete"),
  ),
  oldData: v.optional(v.any()), // Partial<InventoryItem>
  newData: v.optional(v.any()), // Partial<InventoryItem>
  source: v.string(),
  reason: v.optional(v.string()),
  relatedTransactionId: v.optional(v.string()),
})
  .index("by_item", ["itemId"])
  .index("by_businessAccount", ["businessAccountId"])
  .index("by_timestamp", ["businessAccountId", "timestamp"]),
```

### Step 2: Update Mutations to Record History

**File:** `convex/inventory/mutations.ts`

#### 2.1 Helper Function for Tracking Changes

```typescript
/**
 * Helper to capture only changed fields between old and new state
 */
function captureChangedFields(
  oldState: Partial<Doc<"inventoryItems">>,
  newState: Partial<Doc<"inventoryItems">>,
): Partial<Doc<"inventoryItems">> {
  const changed: Partial<Doc<"inventoryItems">> = {};

  for (const [key, newValue] of Object.entries(newState)) {
    if (key === "_id" || key === "_creationTime") continue;

    const oldValue = oldState[key as keyof Doc<"inventoryItems">];
    if (oldValue !== newValue) {
      (changed as Record<string, unknown>)[key] = oldValue;
    }
  }

  return changed;
}
```

#### 2.2 Update `addInventoryItem` Mutation

```typescript
export const addInventoryItem = mutation({
  args: addInventoryItemArgs,
  returns: addInventoryItemReturns,
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    // ... existing validation and item creation ...

    const timestamp = now();
    const document = {
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
      isArchived: false,
      fileId: args.fileId,
    };

    const id = await ctx.db.insert("inventoryItems", document);

    // Record history with full new state
    await ctx.db.insert("inventoryHistory", {
      businessAccountId,
      itemId: id,
      timestamp,
      userId: user._id,
      action: "create",
      oldData: undefined,
      newData: document,
      source: args.reason?.includes("import") ? "bulkImport" : "manual",
      reason: args.reason,
    });

    // ... rest of sync logic ...

    return id;
  },
});
```

#### 2.3 Update `updateInventoryItem` Mutation

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

    // ... validation ...

    const timestamp = now();
    const updates: Partial<Doc<"inventoryItems">> = {
      updatedAt: timestamp,
    };

    // Capture what's changing
    const oldState = { ...item };

    // Apply updates
    (["name", "partNumber", "colorId", "location", "condition", "price", "notes"] as const).forEach(
      (key) => {
        if (args[key] !== undefined) {
          (updates as any)[key] = args[key];
        }
      },
    );
    if (args.quantityAvailable !== undefined) updates.quantityAvailable = args.quantityAvailable;
    if (args.quantityReserved !== undefined) updates.quantityReserved = args.quantityReserved;

    await ctx.db.patch(args.itemId, updates);

    // Get final state
    const finalItem = await ctx.db.get(args.itemId);
    if (!finalItem) throw new ConvexError("Item disappeared");

    // Record history with only changed fields
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      userId: user._id,
      action: "update",
      oldData: captureChangedFields(oldState, updates),
      newData: updates, // Only changed fields
      source: "manual",
      reason: args.reason,
    });

    // ... rest of sync logic ...

    return { itemId: args.itemId };
  },
});
```

#### 2.4 Update `deleteInventoryItem` Mutation

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

    // Capture full state before deletion
    const oldState = { ...item };

    const timestamp = now();
    await ctx.db.patch(args.itemId, {
      isArchived: true,
      deletedAt: timestamp,
      updatedAt: timestamp,
    });

    // Record history with full old state
    await ctx.db.insert("inventoryHistory", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      timestamp,
      userId: user._id,
      action: "delete",
      oldData: oldState,
      newData: undefined,
      source: "manual",
      reason: args.reason,
    });

    // ... rest of sync logic ...

    return { itemId: args.itemId, archived: true };
  },
});
```

#### 2.5 REMOVE `undoHistory` Mutation Entirely

Delete the entire `undoHistory` mutation (lines 356-519 in current file).

### Step 3: Update Queries

**File:** `convex/inventory/queries.ts`

#### 3.1 Update `listInventoryHistory` Query

```typescript
export const listInventoryHistory = query({
  args: listInventoryHistoryArgs,
  returns: listInventoryHistoryReturns,
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);

    const PAGE_SIZE = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const cursorTs = args.cursor ? Number(args.cursor) : undefined;

    // Query with new field names
    const q = ctx.db
      .query("inventoryHistory")
      .withIndex("by_timestamp", (q) => q.eq("businessAccountId", businessAccountId));

    const rows = await q.collect();
    rows.sort((a, b) => b.timestamp - a.timestamp); // Newest first

    // Apply filters
    let filteredRows = rows.filter((r) => (cursorTs ? r.timestamp < cursorTs : true));

    if (args.dateFrom) filteredRows = filteredRows.filter((r) => r.timestamp >= args.dateFrom!);
    if (args.dateTo) filteredRows = filteredRows.filter((r) => r.timestamp <= args.dateTo!);
    if (args.action) filteredRows = filteredRows.filter((r) => r.action === args.action);
    if (args.userId) filteredRows = filteredRows.filter((r) => r.userId === args.userId);
    if (args.itemId) filteredRows = filteredRows.filter((r) => r.itemId === args.itemId);

    // Remove undo status filtering

    // Text search
    if (args.query) {
      const qLower = args.query.toLowerCase();
      filteredRows = filteredRows.filter((r) => {
        const reasonMatch = (r.reason ?? "").toLowerCase().includes(qLower);
        const itemIdMatch = String(r.itemId).toLowerCase().includes(qLower);
        return reasonMatch || itemIdMatch;
      });
    }

    const page = filteredRows.slice(0, PAGE_SIZE);

    // Fetch user details
    const userIds = Array.from(new Set(page.map((r) => r.userId).filter(Boolean) as string[]));
    const actors = await Promise.all(userIds.map((id) => ctx.db.get(id as Id<"users">)));
    const idToActor = new Map(userIds.map((id, i) => [id, actors[i] ?? null]));

    const entries = page.map((r) => ({
      ...r,
      actorFirstName: idToActor.get(r.userId!)?.firstName,
      actorLastName: idToActor.get(r.userId!)?.lastName,
    }));

    const nextCursor =
      page.length === PAGE_SIZE ? String(page[page.length - 1].timestamp) : undefined;

    return { entries, nextCursor };
  },
});
```

#### 3.2 Update Type Definitions

**File:** `convex/inventory/validators.ts`

Remove undo-related validators and add new ones:

```typescript
export const listInventoryHistoryArgs = v.object({
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
  action: v.optional(v.union(v.literal("create"), v.literal("update"), v.literal("delete"))),
  userId: v.optional(v.id("users")),
  itemId: v.optional(v.id("inventoryItems")),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  query: v.optional(v.string()),
});

export const listInventoryHistoryReturns = v.object({
  entries: v.array(historyEntryType),
  nextCursor: v.optional(v.string()),
});
```

### Step 4: Add Search & Filter Capabilities

**File:** `convex/inventory/queries.ts` (continued)

Add new helper queries for common use cases:

```typescript
/**
 * Get history for a specific inventory item
 */
export const getItemHistory = query({
  args: { itemId: v.id("inventoryItems") },
  returns: v.array(historyEntryType),
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);

    const history = await ctx.db
      .query("inventoryHistory")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    history.sort((a, b) => a.timestamp - b.timestamp); // Oldest first

    return history;
  },
});

/**
 * Get history around a specific timestamp (useful for finding entries near creation time)
 */
export const getHistoryNearTimestamp = query({
  args: {
    itemId: v.id("inventoryItems"),
    timestamp: v.number(),
    windowMs: v.optional(v.number()), // Default 1 hour
  },
  returns: v.array(historyEntryType),
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUser(ctx);
    const window = args.windowMs ?? 3600000; // 1 hour default

    const history = await ctx.db
      .query("inventoryHistory")
      .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
      .collect();

    return history
      .filter((h) => Math.abs(h.timestamp - args.timestamp) <= window)
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});
```

---

## Frontend Implementation

### Step 5: Update History Page UI

**File:** `src/app/(authenticated)/inventory/history/page.tsx`

#### 5.1 Remove Undo-Related State

```typescript
// ❌ REMOVE
const [undoStatus, setUndoStatus] = useState<"all" | "active" | "undone">("all");
const [openId, setOpenId] = useState<string | null>(null);

// ✅ ADD
const [showDiff, setShowDiff] = useState<boolean>(true);
```

#### 5.2 Update Filter UI

Remove undo status filter, update action filter:

```typescript
<Select
  value={action}
  onValueChange={(v: "any" | "create" | "update" | "delete") => setAction(v)}
>
  <SelectTrigger>
    <SelectValue placeholder="Any" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="any">Any</SelectItem>
    <SelectItem value="create">Create</SelectItem>
    <SelectItem value="update">Update</SelectItem>
    <SelectItem value="delete">Delete</SelectItem>
  </SelectContent>
</Select>
```

#### 5.3 Update Table Display to Show Two Rows

```typescript
{entries.map((e) => (
  <React.Fragment key={e._id}>
    {/* Top row: new data */}
    <div className="p-4 grid grid-cols-12 gap-3 items-center bg-green-50 dark:bg-green-950">
      <div className="col-span-12 text-xs font-semibold text-green-700 dark:text-green-400 mb-2">
        NEW STATE
      </div>
      {renderHistoryRow(e, e.newData, "new")}
    </div>

    {/* Bottom row: old data */}
    <div className="p-4 grid grid-cols-12 gap-3 items-center bg-red-50 dark:bg-red-950 border-b-2">
      <div className="col-span-12 text-xs font-semibold text-red-700 dark:text-red-400 mb-2">
        OLD STATE
      </div>
      {renderHistoryRow(e, e.oldData, "old")}
      {/* No undo button */}
    </div>
  </React.Fragment>
))}

function renderHistoryRow(entry: HistoryEntry, data: any, type: "old" | "new") {
  if (type === "old" && !data) return <div className="col-span-12 text-muted-foreground italic">No previous state</div>;
  if (type === "new" && !data) return <div className="col-span-12 text-muted-foreground italic">No new state (deleted)</div>;

  return (
    <>
      <div className="col-span-3">
        <div className="text-sm font-medium">{formatRelativeTime(entry.timestamp)}</div>
        <div className="text-xs text-muted-foreground">{entry.userName || "Automated"}</div>
      </div>
      <div className="col-span-2">
        <Badge variant="outline">{entry.action.toUpperCase()}</Badge>
      </div>
      <div className="col-span-4">
        <div className="text-xs">Part: {data.partNumber || "N/A"}</div>
        <div className="text-xs">Color: {data.colorId || "N/A"}</div>
        {data.location && <div className="text-xs">Location: {data.location}</div>}
      </div>
      <div className="col-span-3">
        <div className="text-xs">Qty Available: {data.quantityAvailable || 0}</div>
        <div className="text-xs">Qty Reserved: {data.quantityReserved || 0}</div>
        {entry.reason && <div className="text-xs mt-1">Reason: {entry.reason}</div>}
      </div>
    </>
  );
}
```

#### 5.4 Highlight Changed Fields

Add visual indication of which fields changed:

```typescript
function highlightChangedFields(oldData: any, newData: any) {
  const changed: string[] = [];

  if (oldData && newData) {
    for (const key in newData) {
      if (oldData[key] !== newData[key]) {
        changed.push(key);
      }
    }
  }

  return changed;
}
```

Use this to highlight table cells that contain changed values with a border or background color.

### Step 6: Delete Undo Dialog Component

**DELETE:** `src/components/inventory/UndoChangeDialog.tsx`

No longer needed since undo functionality is being removed.

---

## Use Cases Enabled by New Design

### Use Case 1: Find History for Specific Item

```
Goal: See all changes to a specific inventory item over time
UI: Filter by itemId
Query: select * from inventoryHistory where itemId = 'xxx' order by timestamp
```

### Use Case 2: Find Entries Near Creation Time

```
Goal: A part was entered with wrong location. I want to see what other parts were
entered around the same time to find if the user forgot to change the location.
Query: getHistoryNearTimestamp(itemId, creationTimestamp, windowMs: 3600000)
```

### Use Case 3: Audit Trail for Specific User

```
Goal: Review all changes made by a specific team member
UI: Filter by userId
Query: select * from inventoryHistory where userId = 'xxx'
```

### Use Case 4: Visual Diff of Changes

```
Goal: See exactly what changed in a specific update
UI: Two stacked rows showing old vs new
Logic: Compare oldData and newData to highlight changed fields
```

### Use Case 5: Find Changes by Source

```
Goal: See only manual changes or only sync changes
Query: select * from inventoryHistory where source = 'manual'
```

---

## Additional Required Updates

The following items were not fully captured in the first draft and should be included to complete the refactor:

- Backend schema and indices:

  - Rename index `by_createdAt` to `by_timestamp` and update queries accordingly.
  - Remove `deltaAvailable`/`deltaReserved` and `marketplace*`/`syncError` fields from `inventoryHistory` if not required post-undo removal.
  - Remove undo-tracking fields from `inventorySyncQueue` (`isUndo`, `undoesChangeId`, `undoneByChangeId`) and any references in code.

- Validators and return types:

  - Replace `v.any` for `oldData`/`newData` with the existing `partialInventoryItemData` validator.
  - Remove `undoHistoryArgs`, `undoHistoryReturns`, and `undoStatus` filters; add an optional `source` filter to `listInventoryHistoryArgs`.
  - Update `listInventoryHistoryReturns`/entry shape to new names: `timestamp`, `userId`, `action`, `oldData`, `newData`.

- Queries:

  - Update `listInventoryHistory` to use `by_timestamp`, new field names, and support filtering by `source`.
  - Continue enriching entries with `actorFirstName`/`actorLastName` for UI display. Optionally compute and return `changedFields: string[]` to simplify UI highlighting.

- Mutations and immediate sync:

  - For updates, if `newData` is stored as partial changed fields, ensure marketplace sync still receives a full snapshot. Either pass the merged item state to immediate sync (preferred) or have the sync step fetch current item state by ID.

- Frontend (history page):

  - Remove all undo UI (imports, state, buttons, filters).
  - Align to new names (`timestamp`, `action`, `actorFirstName`/`actorLastName`). The sample uses `userName`; prefer concatenating the actor name fields or update the query to provide `userName`.
  - Add a stable wrapper like `data-history-entry` for automated tests.
  - If you add a `source` filter in the API, surface it in the filter UI.

- Tests and fixtures:

  - Remove undo tests (e.g., `__tests__/backend/inventory-undo.test.ts`).
  - Add unit tests for history write behavior (create: full newData; update: partial diffs; delete: full oldData) and query filtering (date range, action, user, item, source, text).
  - Update any tests relying on `changeType`, `delta*`, or undo fields.

- Code comments and references:
  - Update comments in `convex/bricklink/storeClient.ts` and `convex/brickowl/storeClient.ts` that reference UI Undo.

These adjustments will keep the system consistent after removing undo and renaming fields.

---

## Testing Plan

### Unit Tests

**File:** `__tests__/backend/inventory-history.test.ts`

```typescript
describe("Inventory History", () => {
  test("create action records full newData", async () => {
    const itemId = await addInventoryItem({...});
    const history = await getItemHistory(itemId);

    expect(history[0].action).toBe("create");
    expect(history[0].oldData).toBeUndefined();
    expect(history[0].newData).toHaveProperty("name");
    expect(history[0].newData).toHaveProperty("quantityAvailable");
  });

  test("update action records only changed fields", async () => {
    await updateInventoryItem({itemId, quantityAvailable: 95});
    const history = await getItemHistory(itemId);

    const update = history.find(h => h.action === "update");
    expect(update.oldData).toHaveProperty("quantityAvailable");
    expect(update.newData).toHaveProperty("quantityAvailable");
    expect(update.newData.quantityAvailable).toBe(95);
  });

  test("delete action records full oldData", async () => {
    await deleteInventoryItem({itemId});
    const history = await getItemHistory(itemId);

    const deleteAction = history.find(h => h.action === "delete");
    expect(deleteAction.oldData).toHaveProperty("name");
    expect(deleteAction.oldData).toHaveProperty("partNumber");
    expect(deleteAction.newData).toBeUndefined();
  });
});
```

### Integration Tests

```typescript
test("history page displays two rows per entry", async () => {
  await page.goto("/inventory/history");

  const rows = await page.locator("[data-history-entry]").count();
  expect(rows).toBeGreaterThan(0);

  // Each entry should have 2 rows
  const entryCount = await page.locator("[data-history-entry]").count();
  expect(entryCount * 2).toBe(await page.locator("tr").count());
});
```

---

## Rollback Plan

If issues arise:

1. Revert frontend to previous version
2. Keep new backend schema but add back undo fields temporarily
3. Restore old queries with fallback logic

---

## Acceptance Criteria

- [x] Schema simplified with `oldData`/`newData` JSON fields
- [x] All undo tracking fields removed
- [x] `undoHistory` mutation deleted
- [x] History page shows two stacked rows per entry
- [x] Changed fields highlighted in UI
- [x] Search, filter, sort all work correctly
- [x] Can find history for specific item
- [x] Can find entries near a timestamp
- [x] Can filter by user, action, source
- [x] All tests pass
- [x] No references to undo functionality remain

---

## Estimated Effort

- **Backend refactor**: 4-6 hours
- **Frontend refactor**: 3-4 hours
- **Testing**: 2-3 hours
- **Documentation**: 1 hour
- **Total**: 10-14 hours

---

## References

- Current schema: `convex/inventory/schema.ts`
- Current mutations: `convex/inventory/mutations.ts` (lines 356-519 contain undo logic)
- Current queries: `convex/inventory/queries.ts` (lines 244-332 contain history queries)
- UI: `src/app/(authenticated)/inventory/history/page.tsx`
- Undo dialog: `src/components/inventory/UndoChangeDialog.tsx`
