# Inventory Table Column Ordering – Diagnosis and Refactor Plan

Owner: Frontend
Last updated: 2025-10-25

## Problem Statement

The order of columns shown in the column manager (drag-and-drop UI) does not match the order rendered in the table header/body. Dragging to reorder in the manager does not reliably reflect in the table.

## Quick Diagnosis

Root causes identified:

1. Default column order is derived from `ColumnDef.id`, which is undefined for most accessor-based columns. This produces an invalid `columnOrder` seed persisted to localStorage and passed to React Table.

```41:42:src/components/inventory/data-table/data-table.tsx
  const defaultColumnOrder = React.useMemo(() => columns.map((col) => col.id as string), [columns]);
```

2. React Table internally assigns stable column IDs (usually `accessorKey`), while our persisted state may contain `undefined`/stale IDs. This desynchronizes manager vs. header ordering.

3. The column manager uses `getAllColumns()` (which can include group/parent columns) rather than the leaf columns that actually render in the header/body. We should use `getAllLeafColumns()` consistently for ordering.

```26:33:src/components/inventory/data-table/data-table-column-manager.tsx
  const allColumns = table.getAllColumns();
  const hideableColumns = allColumns.filter((column) => column.getCanHide());
```

4. The manager only exposes hideable columns for dragging (correct), but when constructing the new order it should always update the full leaf order (including pinned/non-hideable columns) to keep positions deterministic.

5. Conditional columns (BrickLink/BrickOwl sync) change the set of columns at runtime. Saved orders must be sanitized when columns are added/removed to avoid drift.

## Relevant TanStack Table v8 Concepts (for implementation)

- Column IDs: If `id` isn’t provided, it defaults to `accessorKey` (string) or a generated ID for `accessorFn`. Use those IDs in `columnOrder`.
- Column Ordering: Controlled via `state.columnOrder` and `onColumnOrderChange`. The list should be leaf column IDs, not parent/group columns.
- API to query: `table.getAllLeafColumns()` returns the actual renderable columns and their IDs.

## Goals

- Single source of truth for ordering: the set and sequence of leaf column IDs from React Table.
- Stable IDs for all columns (explicit where necessary).
- Robust persistence: sanitize saved state against canonical leaf IDs; migrate legacy values.
- Allow reordering of hideable columns, keep pinned columns fixed (e.g., `select` first, `actions` last).
- Handle dynamic columns (sync toggles) gracefully.

## Proposed Design

1. Guarantee Stable Column IDs

- In `columns.tsx`, set an explicit `id` for every accessorKey-based column equal to that accessorKey. Selection and actions already have IDs; ensure all others do as well.

Example pattern for accessor columns:

```ts
{ id: "partNumber", accessorKey: "partNumber", header: "Part Number", ... }
```

2. Canonical Order From the Table (Not From ColumnDefs)

- Stop deriving `defaultColumnOrder` from `ColumnDef`. Instead:
  - Initialize `columnOrder` as empty.
  - After `useReactTable` is created, compute `canonicalOrder` via `table.getAllLeafColumns().map(c => c.id)`.
  - Sanitize any saved order against this canonical set (see sanitize algorithm below).
  - Apply with `table.setColumnOrder(sanitized)` and persist.

3. Use Leaf Columns in Manager and Full-Order Updates

- Replace `getAllColumns()` with `getAllLeafColumns()` for manager lists.
- Build `sortableColumnIds` by filtering canonical/full order to hideable IDs.
- On drag end:
  - Start from full leaf order (`table.getState().columnOrder` if present, else canonical).
  - Splice the moved hideable ID within the full order.
  - Apply the full new order via `table.setColumnOrder(newOrder)`.

4. Pinned Columns & Insertion Policy

- Define pinned sets:
  - `pinnedStart = ["select"]`
  - `pinnedEnd = ["actions"]`
- Sanitize ensures `select` stays index 0 and `actions` stays last. New dynamic columns are appended just before `pinnedEnd`.

5. Saved State Migration/Sanitization

Implement a pure helper used on mount and whenever the column set changes:

```ts
function sanitizeOrder(
  saved: string[],
  canonical: string[],
  pinnedStart: string[],
  pinnedEnd: string[],
): string[] {
  const canonicalSet = new Set(canonical);
  // 1) Remove unknown IDs
  const filtered = saved.filter((id) => canonicalSet.has(id));

  // 2) Ensure pinned constraints
  const withoutPinned = filtered.filter(
    (id) => !pinnedStart.includes(id) && !pinnedEnd.includes(id),
  );

  // 3) Append any missing canonical IDs (in canonical order)
  const missing = canonical.filter(
    (id) => !filtered.includes(id) && !pinnedStart.includes(id) && !pinnedEnd.includes(id),
  );
  const middle = [...withoutPinned, ...missing];

  // 4) Reconstruct with pins
  const start = pinnedStart.filter((id) => canonicalSet.has(id));
  const end = pinnedEnd.filter((id) => canonicalSet.has(id));
  return [...start, ...middle, ...end];
}
```

Behavior with dynamic columns:

- If a column disappears: it’s dropped by step (1).
- If a column appears: it’s appended before pinned end by step (3).

6. Reduce Noisy Logging

- Replace console logs with a `DEBUG_COLUMNS` guard or remove them once verified.

## Implementation Steps

1. Add explicit `id` to all accessorKey columns in `columns.tsx`.

   - Verify IDs: `select`, each accessor column (matching its accessorKey), sync columns, and `actions`.

2. Refactor `data-table.tsx`:

   - Remove `defaultColumnOrder` based on ColumnDefs.
   - Keep persisted state as-is but treat `columnOrder` as optional.
   - After creating the table, compute `canonical = table.getAllLeafColumns().map(c => c.id)`.
   - If no saved order, set to `canonical` (with pins applied).
   - If saved exists, run `sanitizeOrder(saved, canonical, pinnedStart, pinnedEnd)` and apply if changed.
   - On `onColumnOrderChange`, persist the full order.

3. Refactor `data-table-column-manager.tsx`:

   - Use `table.getAllLeafColumns()`.
   - Derive `fullOrder = table.getState().columnOrder.length ? table.getState().columnOrder : canonical`.
   - Compute `sortableColumnIds` by filtering `fullOrder` to `getCanHide()` columns.
   - On drag end, move within `fullOrder` and call `table.setColumnOrder(newOrder)`.

4. Verify conditional columns:

   - Toggle `syncConfig` on/off and ensure sanitize appends/removes correctly, with `select` first and `actions` last.

5. Tests (unit-level logic + light integration):

   - Unit test `sanitizeOrder` for add/remove/pin behaviors.
   - Integration: mount table with a subset of columns, simulate a drag reorder by calling `onColumnOrderChange`, verify header order and persisted value.

6. Clean up logs and add minimal inline docs where non-obvious (e.g., why leaf columns are used, pin policy).

## Acceptance Criteria

- Dragging a column in the manager reorders the table header/body immediately.
- Non-hideable columns remain pinned (select first, actions last) and are not draggable.
- The order persists across reloads and after toggling sync columns.
- No undefined/invalid IDs stored in localStorage; migration drops unknown IDs and appends new IDs.
- No noisy console logging in production.

## Risks & Mitigations

- Conditional columns could reorder unexpectedly on feature toggles: mitigated by sanitize and pinning.
- Backwards compatibility with existing localStorage entries: mitigated by sanitize migration.
- Potential mismatch if group columns are introduced later: always use `getAllLeafColumns()`.

## Notes & References

- TanStack Table v8: Column IDs and Ordering (see column ordering and column identification sections).
- Use `table.getAllLeafColumns()` for any ordering/persistence logic.

## File Pointers (for implementers)

```41:49:src/components/inventory/data-table/data-table.tsx
  const [tableState, setTableState, removeTableState] = useLocalStorage<TableState>(
    "inventory-table-state",
    {
      columnVisibility: {},
      columnSizing: {},
      columnOrder: [], // Replace defaulting logic; initialize via table leaf IDs
    },
  );
```

```26:35:src/components/inventory/data-table/data-table-column-manager.tsx
  const allColumns = table.getAllColumns(); // Change to getAllLeafColumns()
  const hideableColumns = allColumns.filter((column) => column.getCanHide());
```

```67:106:src/components/inventory/data-table/columns.tsx
export const createColumns = (syncConfig: MarketplaceSyncConfig): ColumnDef<InventoryItem>[] => {
  const baseColumns: ColumnDef<InventoryItem>[] = [
    { id: "select", ... },
    { id: "partNumber", accessorKey: "partNumber", header: "Part Number", ... },
    { id: "name", accessorKey: "name", header: "Name", ... },
    // ... repeat for all accessorKey columns
  ];
  // sync columns already have explicit ids; actions column has id: "actions"
}
```
