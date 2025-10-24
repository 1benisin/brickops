# Inventory Table Component - Implementation Plan

## Overview

This document outlines the plan for creating a comprehensive inventory table component using `@tanstack/react-table` and shadcn/ui components. The table will display inventory items with sorting, filtering, pagination, and row actions.

## Goals

- Create a reusable, performant table component for inventory management
- Support key operations: view, edit, delete, sync status display
- Provide excellent UX with sorting, filtering, and pagination
- Integrate seamlessly with existing Convex backend
- Follow shadcn/ui patterns and project architecture

---

## Data Model

Based on the existing `inventoryItems` schema, we'll display these key fields:

### Primary Fields

- `name` - Item name (string)
- `partNumber` - BrickLink part number (string)
- `colorId` - Color identifier (string)
- `location` - Storage location (string)
- `quantityAvailable` - Available quantity (number)
- `quantityReserved` - Reserved quantity (number)
- `quantitySold` - Sold quantity (number)
- `status` - Item status: "available" | "reserved" | "sold"
- `condition` - Item condition: "new" | "used"
- `price` - Unit price (number, optional)

### Sync Status Fields

- `bricklinkSyncStatus` - BrickLink sync status
- `brickowlSyncStatus` - BrickOwl sync status
- `bricklinkSyncError` - BrickLink sync error message
- `brickowlSyncError` - BrickOwl sync error message
- `lastSyncedAt` - Last sync timestamp

### Metadata

- `createdAt` - Creation timestamp
- `updatedAt` - Update timestamp
- `fileId` - Associated inventory file ID (optional)

---

## Component Structure

### File Organization

```
src/components/inventory/
├── data-table/
│   ├── columns.tsx              # Column definitions
│   ├── data-table.tsx           # Main DataTable component
│   ├── data-table-toolbar.tsx   # Toolbar with filters
│   ├── data-table-pagination.tsx # Pagination controls
│   ├── data-table-view-options.tsx # Column visibility toggle
│   ├── data-table-row-actions.tsx # Row action dropdown
│   └── data-table-column-header.tsx # Sortable column header
└── InventoryTable.tsx           # Wrapper component (fetches data)
```

### Page Integration

```
src/app/(authenticated)/inventory/
└── page.tsx                     # Updated to include InventoryTable
```

---

## Features to Implement

### 1. Column Definitions (`columns.tsx`)

#### Columns to Include:

1. **Selection Column** - Checkbox for multi-select (leftmost)
2. **Part Number** - Sortable, filterable, primary identifier
3. **Name** - Sortable, filterable, item description
4. **Color ID** - Sortable, filterable
5. **Location** - Sortable, filterable
6. **Condition** - Badge with color coding (New = green, Used = gray)
7. **Available Qty** - Sortable, numeric display
8. **Reserved Qty** - Sortable, numeric display (show only if > 0)
9. **Status** - Badge with status colors
10. **Sync Status** - Custom component showing BrickLink/BrickOwl status icons
11. **Price** - Formatted currency (optional, show only if set)
12. **Last Updated** - Relative time display (e.g., "2 hours ago")
13. **Actions** - Dropdown menu (rightmost)

#### Column Features:

- Sortable headers with up/down arrows
- Right-aligned numeric columns (quantities, price)
- Badge components for status/condition
- Hover tooltips for sync errors
- Custom cell formatting (currency, dates, badges)

### 2. Main DataTable Component (`data-table.tsx`)

#### Core Features:

- Generic `<TData, TValue>` TypeScript typing
- State management for:
  - `sorting` - Column sorting state
  - `columnFilters` - Filter state
  - `columnVisibility` - Column show/hide state
  - `rowSelection` - Selected rows state
  - `pagination` - Page size and current page
- TanStack Table hooks:
  - `useReactTable` with all necessary plugins
  - `getCoreRowModel()`
  - `getSortedRowModel()`
  - `getFilteredRowModel()`
  - `getPaginationRowModel()`
- Responsive design with horizontal scroll on mobile
- Empty state with illustration and CTA
- Loading state with skeleton rows

### 3. Toolbar Component (`data-table-toolbar.tsx`)

#### Features:

- **Search Input** - Global search across part number, name, location
- **Status Filter** - Multi-select dropdown for status (available/reserved/sold)
- **Condition Filter** - Multi-select for new/used
- **Sync Status Filter** - Filter by sync state (synced/pending/failed)
- **Date Range Filter** - Filter by creation/update date
- **Clear Filters Button** - Reset all filters
- **View Options Button** - Column visibility dropdown
- **Bulk Actions** (when rows selected):
  - Sync to BrickLink
  - Sync to BrickOwl
  - Archive items
  - Export selected

### 4. Row Actions (`data-table-row-actions.tsx`)

Dropdown menu with:

- **View Details** - Open item detail modal/page
- **Edit** - Open edit dialog
- **Duplicate** - Create copy of item
- **Separator**
- **Sync to BrickLink** - Immediate sync action
- **Sync to BrickOwl** - Immediate sync action
- **View History** - Show change history
- **Separator**
- **Archive** - Soft delete (confirm dialog)
- **Delete** - Permanent delete (confirm dialog, red text)

### 5. Pagination Component (`data-table-pagination.tsx`)

Features:

- Page size selector (10, 20, 50, 100 items per page)
- Current page indicator (e.g., "Showing 1-10 of 142")
- Selected rows count (e.g., "3 of 142 rows selected")
- Previous/Next buttons
- First/Last page buttons
- Jump to page input (optional)

### 6. Column Visibility (`data-table-view-options.tsx`)

- Dropdown with checkboxes for each toggleable column
- "Show All" / "Hide All" shortcuts
- Save preferences to localStorage
- Exclude selection and actions columns from toggle

### 7. Column Header (`data-table-column-header.tsx`)

Reusable sortable header with:

- Column title
- Sort indicator (↑ ↓ arrows)
- Click to toggle sort direction
- Hide column option in dropdown
- Accessible keyboard navigation

---

## Custom Components

### Sync Status Indicator Component

Located: `src/components/inventory/SyncStatusIndicator.tsx` (already exists!)

We'll integrate the existing `SyncStatusIndicator` component to show:

- BrickLink sync status icon
- BrickOwl sync status icon
- Hover tooltip with error details
- Color coding: green (synced), yellow (pending), red (failed), gray (not synced)

### Status Badge Component

Create: `src/components/inventory/StatusBadge.tsx`

```tsx
type Status = "available" | "reserved" | "sold";
- Available: Green badge
- Reserved: Yellow badge
- Sold: Gray badge
```

### Condition Badge Component

Create: `src/components/inventory/ConditionBadge.tsx`

```tsx
type Condition = "new" | "used";
- New: Green outline badge
- Used: Gray outline badge
```

---

## Wrapper Component (`InventoryTable.tsx`)

This component handles:

- Fetching data via Convex `useQuery(api.inventory.queries.listInventoryItems)`
- Loading state display
- Error state display
- Passing data to `<DataTable>`
- Refresh functionality
- Real-time updates (Convex reactivity)

```tsx
export function InventoryTable() {
  const items = useQuery(api.inventory.queries.listInventoryItems);
  const totals = useQuery(api.inventory.queries.getInventoryTotals);

  if (items === undefined) return <TableSkeleton />;
  if (items === null) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Available" value={totals?.totals.available} />
        <StatCard label="Reserved" value={totals?.totals.reserved} />
        <StatCard label="Sold" value={totals?.totals.sold} />
      </div>
      <DataTable columns={columns} data={items} />
    </div>
  );
}
```

---

## Implementation Steps

### Phase 1: Basic Table Structure

1. ✅ Install `@tanstack/react-table` dependency
2. Create `columns.tsx` with basic column definitions
3. Create `data-table.tsx` with core table structure
4. Create `InventoryTable.tsx` wrapper component
5. Update `inventory/page.tsx` to include table
6. Verify basic rendering with data

### Phase 2: Core Features

7. Add sorting functionality to columns
8. Implement `data-table-column-header.tsx`
9. Add pagination with `data-table-pagination.tsx`
10. Test sorting and pagination

### Phase 3: Filtering

11. Create `data-table-toolbar.tsx`
12. Implement search input
13. Add status filter dropdown
14. Add condition filter
15. Add sync status filter
16. Implement clear filters button
17. Test all filters

### Phase 4: Advanced Features

18. Add row selection (checkboxes)
19. Create `data-table-row-actions.tsx`
20. Implement action handlers (edit, delete, sync, etc.)
21. Create `data-table-view-options.tsx`
22. Implement column visibility toggle
23. Add localStorage persistence for preferences

### Phase 5: Polish

24. Create custom badge components
25. Integrate `SyncStatusIndicator`
26. Add empty state illustration
27. Add loading skeletons
28. Add error states
29. Implement responsive design
30. Add keyboard shortcuts

### Phase 6: Bulk Actions

31. Add bulk action toolbar (when rows selected)
32. Implement bulk sync actions
33. Implement bulk archive
34. Implement bulk export

### Phase 7: Testing

35. Write unit tests for columns
36. Write integration tests for DataTable
37. Write E2E tests for key workflows
38. Test accessibility (keyboard nav, screen readers)

---

## Integration Points

### Convex Queries

- `api.inventory.queries.listInventoryItems` - Fetch all items
- `api.inventory.queries.getInventoryTotals` - Fetch summary stats

### Convex Mutations

- `api.inventory.mutations.updateInventoryItem` - Edit item
- `api.inventory.mutations.deleteInventoryItem` - Delete item
- `api.inventory.mutations.archiveInventoryItem` - Archive item

### Convex Actions (for sync)

- `api.inventory.actions.syncToBrickLink` - Sync to BrickLink
- `api.inventory.actions.syncToBrickOwl` - Sync to BrickOwl

### Existing Components

- `AddInventoryItemButton` - Keep in header
- `SyncStatusIndicator` - Reuse in table
- Dialog components from shadcn/ui for modals

---

## State Management

### Local State (in DataTable)

- `sorting` - Column sort configuration
- `columnFilters` - Active filters
- `columnVisibility` - Hidden/shown columns
- `rowSelection` - Selected row IDs
- `pagination` - Current page and page size

### Persisted State (localStorage)

- Column visibility preferences
- Default page size
- Default sort column

### Global State (Convex)

- Inventory items (reactive, real-time)
- Sync status updates (reactive)

---

## Performance Considerations

### Optimization Strategies

1. **Memoization**

   - Memoize column definitions with `useMemo`
   - Memoize filtered/sorted data
   - Use React.memo for cell components

2. **Virtualization** (if needed for 1000+ items)

   - Consider `@tanstack/react-virtual` for large datasets
   - Implement virtual scrolling for rows

3. **Pagination**

   - Default to 20 items per page
   - Allow user to choose page size
   - Consider server-side pagination if dataset grows very large

4. **Debouncing**

   - Debounce search input (300ms)
   - Debounce filter changes

5. **Code Splitting**
   - Lazy load dialog components
   - Lazy load row action handlers

---

## Accessibility

### Requirements

- ✅ Keyboard navigation (arrow keys, tab, enter)
- ✅ Screen reader announcements for sort changes
- ✅ ARIA labels for all interactive elements
- ✅ Focus indicators for all focusable elements
- ✅ Accessible color contrast for badges
- ✅ Skip to content link
- ✅ Table role and proper semantic HTML

### Testing

- Test with keyboard only
- Test with VoiceOver/NVDA
- Test with high contrast mode
- Test with reduced motion preference

---

## Mobile Responsiveness

### Strategies

1. **Horizontal Scroll** (preferred for data tables)

   - Table scrolls horizontally on mobile
   - Sticky first column (part number)
   - Shadow indicators for scroll

2. **Column Hiding** (automatic on mobile)

   - Hide less important columns on small screens
   - Show/hide toggle in toolbar
   - Priority columns: part number, name, quantity, actions

3. **Compact Mode** (optional)
   - Reduced padding on mobile
   - Smaller fonts
   - Collapsed row actions (icon only)

---

## Error Handling

### Scenarios to Handle

1. **No Data**

   - Empty state with illustration
   - CTA to add first item

2. **Loading Error**

   - Error message with retry button
   - Preserve user's filters/sort

3. **Action Errors**

   - Toast notification for failed actions
   - Retry option
   - Don't clear row selection

4. **Sync Errors**
   - Display in sync status column
   - Hover tooltip with full error
   - Retry action in row menu

---

## Testing Strategy

### Unit Tests

- Column definitions render correctly
- Cell formatters work (currency, dates, badges)
- Sort/filter logic works
- Row selection logic

### Integration Tests

- Table renders with mock data
- Sorting updates table
- Filtering updates table
- Pagination works
- Actions trigger correct mutations

### E2E Tests (Playwright)

- Add new item and see it in table
- Edit item and see changes
- Delete item and confirm removal
- Sync item and see status update
- Filter by status and see correct results
- Multi-select and bulk action

---

## Future Enhancements

### Phase 8+ (Post-MVP)

- Export to CSV/Excel
- Advanced filtering (filter builder)
- Saved filter presets
- Column reordering (drag-and-drop)
- Column resizing
- Inline editing (click to edit cell)
- Bulk edit dialog
- Print view
- Data visualization (charts)
- Quick actions toolbar
- Recent items / Favorites
- Undo/Redo for actions

---

## Dependencies

### New Dependencies to Install

```bash
pnpm add @tanstack/react-table
```

### Existing Dependencies (already installed)

- `@radix-ui/react-*` (via shadcn/ui)
- `lucide-react` (icons)
- `date-fns` (date formatting)
- `convex` (backend integration)

---

## Design Tokens

### Colors (from existing theme)

- Status Available: `bg-green-500/10 text-green-700`
- Status Reserved: `bg-yellow-500/10 text-yellow-700`
- Status Sold: `bg-gray-500/10 text-gray-700`
- Sync Success: `text-green-600`
- Sync Pending: `text-yellow-600`
- Sync Failed: `text-red-600`

### Spacing

- Table padding: `p-4`
- Cell padding: `px-4 py-2`
- Toolbar spacing: `space-x-2`

### Typography

- Table headers: `text-sm font-medium`
- Table cells: `text-sm`
- Numeric cells: `font-mono tabular-nums`

---

## Success Criteria

The implementation is complete when:

1. ✅ Users can view all inventory items in a table
2. ✅ Users can sort by any column
3. ✅ Users can filter by status, condition, and search
4. ✅ Users can select multiple items
5. ✅ Users can perform actions on items (edit, delete, sync)
6. ✅ Users can toggle column visibility
7. ✅ Users can paginate through items
8. ✅ Table is responsive on mobile
9. ✅ Table is accessible (keyboard, screen reader)
10. ✅ Sync status is clearly displayed
11. ✅ All unit and E2E tests pass
12. ✅ Performance is acceptable (< 100ms to render 100 items)

---

## Timeline Estimate

- **Phase 1** (Basic Table): 2-3 hours
- **Phase 2** (Core Features): 2-3 hours
- **Phase 3** (Filtering): 2-3 hours
- **Phase 4** (Advanced Features): 3-4 hours
- **Phase 5** (Polish): 2-3 hours
- **Phase 6** (Bulk Actions): 2-3 hours
- **Phase 7** (Testing): 3-4 hours

**Total Estimate: 16-23 hours** (2-3 full development days)

---

## Notes

- The existing `InventoryCard` component can remain for card view option
- Consider adding a toggle to switch between table and card view
- Sync status is critical - make it prominent and easy to understand
- Keep the table simple initially - add advanced features incrementally
- Follow the shadcn/ui data table patterns closely for consistency
- Prioritize the user experience - this table will be used frequently

---

## References

- shadcn/ui Data Table Guide: https://ui.shadcn.com/docs/components/data-table
- TanStack Table Docs: https://tanstack.com/table/v8
- Existing Inventory Schema: `convex/inventory/schema.ts`
- Existing Inventory Queries: `convex/inventory/queries.ts`
- Existing Sync Status Component: `src/components/inventory/SyncStatusIndicator.tsx`
