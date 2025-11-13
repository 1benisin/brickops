# Components

BrickOps components live under `src/components/` and compose shadcn/ui primitives with domain-specific logic. This guide explains how the component library is organized, the conventions we follow, and the shared tooling available to build new UI quickly and consistently.

## Directory Overview

```text
src/components/
├── catalog/             # Catalog browsing, detail drawers, price guides
├── common/              # Cross-domain helpers (e.g., part images)
├── dashboard/           # Overview widgets and skeletons
├── identify/            # Camera capture & part identification flows
├── inventory/           # Inventory table, dialogs, bulk actions, shared widgets
├── layout/              # App chrome, navigation, headers, layout shells
├── orders/              # Order tables, bulk actions, packaging slips
├── picking/             # Picker UI and card components
├── providers/           # Global React providers (theme, auth wrappers)
├── settings/            # Marketplace credential forms & settings pages
└── ui/                  # shadcn/ui primitives installed via the CLI (do not edit directly)
```

> **Reminder:** Always install new primitives through `pnpm dlx shadcn@latest add <component>` so the generated files land in `src/components/ui/` with the correct tokens and accessibility wiring.

## Building Blocks & Conventions

- Compose from shadcn/ui primitives (`@/components/ui/*`) and keep domain logic in thin wrappers.
- Export React components with PascalCase names that match their file names (`InventoryTable.tsx` → `InventoryTable`).
- Prefer `React.forwardRef` when wrapping interactive primitives so consumers can attach refs.
- Use the shared `cn` helper from `@/lib/utils` to merge Tailwind classes.
- Every interactive element that appears in automated tests must include a stable `data-testid` attribute.
- Expose props as TypeScript interfaces near the component and default optional props defensively.

## Domain Patterns

### Catalog

- Search, detail drawers, and price guide panels live in `catalog/` and share helpers (e.g., `PartDetailDrawer`, `CatalogSearchBar`).
- Components derive their types from backend validators via `src/types/catalog.ts`; avoid duplicating shapes.
- Refresh actions and spinners integrate with Convex actions (see `RefreshPartDetailsButton`).

### Inventory

- Organized by workflow: tables (`data-table/`), dialogs (`dialogs/`), shared widgets (`shared/`), and workflow-specific panes (`add-item-workflow/`).
- Table composition uses the shared data-table toolkit (see below) and keeps column definitions in dedicated files.
- Dialogs wrap shadcn primitives and handle optimistic updates and error surfaces consistently.

### Orders & Picking

- `orders/` contains TanStack-powered tables, bulk actions, and printable packaging slip layouts.
- `picking/` provides the mobile-first picking interface, using shared inventory components for location and quantity display.

### Layout & Providers

- `layout/` exposes shell components (navigation, headers, sidebars) used by Next.js layouts under `src/app/(authenticated)/`.
- `providers/` wraps application-level providers such as the theme provider and Convex client provider.

## Data Table Toolkit

All domain tables compose helpers from `src/components/ui/data-table/*`:

- `data-table.tsx` — Thin wrapper around TanStack Table configured for server-driven pagination, sorting, and filtering.
- `hooks/use-server-table-state.ts` — Translates TanStack state into the normalized `QuerySpec` passed to Convex queries and debounces filter updates.
- `filters/*` — Pre-built filter components (number range, date range, select, text) that map cleanly to backend validators.
- `utils/filter-state.ts` — Serializes and deserializes filter state to match Convex query validators.

When introducing a new table:

1. Define columns via `createColumn`/`createXColumns` helper with explicit `id` or `accessorKey` values.
2. Attach the correct manual filter (`manualNumberRangeFilter`, `manualDateRangeFilter`) for non-text columns.
3. Use `useServerTableState` in the wrapper component to synchronize TanStack state with Convex queries.
4. Translate server-side filter state back into TanStack format on load so the UI hydrates correctly.
5. Update backend validators and queries to honor any new filter keys before wiring the UI.

## Dialogs, Forms, and Status Patterns

- Compose dialogs from `@/components/ui/dialog`, `AlertDialog`, or `Sheet` depending on the UX requirement; keep domain-specific content in a dedicated component under the relevant directory.
- Forms use `@/components/ui/form` plus `react-hook-form` with validator-derived types. Surface validation errors using shadcn `FormMessage` and `Alert` components.
- Loading states rely on skeletons (`@/components/ui/skeleton`) or domain-specific placeholders (e.g., `TotalsCardSkeleton`).
- Error states surface via `Alert` (destructive variant) and include actionable retry messaging aligned with backend error codes.

## Testing & Accessibility

- Co-locate Jest/RTL tests under `__tests__/frontend/` mirroring component structure (e.g., `__tests__/frontend/components/inventory/InventoryCard.test.tsx`).
- Mock Convex hooks (`useQuery`, `useMutation`, `useAction`) at the test level and ensure role-based logic is covered.
- Enforce keyboard support by relying on shadcn primitives and exposing focusable targets (buttons, links) with descriptive labels.

## Adding New Components

1. Check the ShadCN MCP registry to confirm a base primitive exists before creating custom UI.
2. Install primitives via the shadcn CLI and keep generated files under `src/components/ui/` untouched.
3. Compose a domain wrapper (e.g., `inventory/dialogs/NewDialog.tsx`) that:
   - Derives types from Convex validators or `FunctionReturnType` helpers.
   - Handles loading, success, and error states explicitly.
   - Emits test IDs for Playwright coverage.
4. Add stories/docs as needed (design-system route) and update relevant tests.

Following these patterns keeps the component layer consistent, accessible, and easy to evolve alongside our Convex backend contracts.
