# Coding Standards

## TL;DR

- Split Convex code by function type: queries stay pure, mutations own writes/scheduling, actions orchestrate external calls, and always `await` scheduled work.
- Derive all shared types from Convex validators (`Infer`, `FunctionReturnType`); never duplicate data shapes in the frontend.
- Build UI from shadcn/ui primitives installed via the CLI and compose domain wrappers under `src/components/`.
- Emit structured errors (`ConvexError` with `code`, `message`, `httpStatus`, `correlationId`) and mirror them in the frontend via shadcn `Alert` components.
- Add or update tests whenever behaviour changes (React components, Convex domains, Playwright flows where applicable).

## Critical Rules

- **Convex Function Patterns**: Follow the [Convex Function Patterns](../backend/architecture.md#convex-function-patterns-and-best-practices) section strictly:
  - Queries are read-only and pure (no writes, no scheduling)
  - Mutations handle all database writes and scheduling
  - Actions orchestrate external APIs and call mutations to persist
  - Internal functions for server-only building blocks
  - Always await promises (no fire-and-forget)
- External API calls go through service layer with rate limiting
- Never mutate state directly; follow React/Zustand patterns
- **Type Safety**: Always use validator-based types; never duplicate type definitions
- All Convex functions validate authentication and tenant access
- Use structured error objects and consistent logging
- **UI Components**: Always use shadcn/ui components; never install Radix UI directly

## Type Safety and Validator Patterns

### Single Source of Truth: Convex Validators

**CRITICAL**: Backend validators are the single source of truth for all API contracts. Frontend types MUST be derived from validators, never manually duplicated.

#### Backend Validator Pattern

Every Convex function must define validators for both arguments and return values:

```typescript
// convex/catalog/validators.ts
import { v } from "convex/values";

// Shared component validators (reusable)
export const catalogPartValidator = v.object({
  partNumber: v.string(),
  name: v.string(),
  type: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")),
  // ... other fields
});

// Return validators for functions
export const searchPartsReturnValidator = v.object({
  page: v.array(catalogPartValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});
```

```typescript
// convex/catalog/queries.ts
import { query } from "../_generated/server";
import { v } from "convex/values";
import { searchPartsReturnValidator } from "./validators";

export const searchParts = query({
  args: { query: v.string() },
  returns: searchPartsReturnValidator, // ✅ CRITICAL: Always define return validator
  handler: async (ctx, args) => {
    // Implementation
    return { page: [...], isDone: true, continueCursor: "..." };
  },
});
```

#### Frontend Type Derivation

Frontend types MUST be derived from backend validators using `FunctionReturnType` or `Infer`:

```typescript
// src/types/catalog.ts
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

// ✅ GOOD: Type derived from backend validator
export type CatalogSearchResult = FunctionReturnType<typeof api.catalog.queries.searchParts>;
export type CatalogPart = CatalogSearchResult["page"][0];

// ❌ BAD: Manually defined type (can drift from backend)
export type CatalogPart = {
  partNumber: string;
  name: string;
  // ...
};
```

For validator-only types (not function returns):

```typescript
// src/types/inventory.ts
import type { Infer } from "convex/values";
import type {
  listInventoryItemsReturns,
  syncStatus,
  itemCondition,
} from "@/convex/inventory/validators";

// ✅ GOOD: Types derived from validators
export type InventoryItem = Infer<typeof listInventoryItemsReturns>[0];
export type SyncStatus = Infer<typeof syncStatus>;
export type ItemCondition = Infer<typeof itemCondition>;

// ❌ BAD: Manually defined types
export type InventoryItem = {
  /* ... */
};
```

#### Validator Organization

- **Location**: Each domain should have a `validators.ts` file (e.g., `convex/catalog/validators.ts`, `convex/inventory/validators.ts`)
- **Structure**:
  - Shared component validators at the top (reusable across functions)
  - Function args validators grouped by function
  - Function return validators grouped by function
  - TypeScript type exports at the bottom (for convenience)
- **Naming**: Use descriptive names like `searchPartsReturnValidator`, `addInventoryItemArgs`
- **Reusability**: Extract common validators as shared components (e.g., `itemCondition`, `syncStatus`)

#### Key Principles

1. **Never duplicate types**: If a type matches backend data, derive it from validators
2. **Always define return validators**: Every public function should have a `returns` validator
3. **Export types for convenience**: Backend validators can export `Infer<>` types for internal use
4. **Frontend imports from backend**: Frontend types live in `src/types/` but import validators from `convex/`
5. **Runtime safety**: Validators provide runtime validation, not just TypeScript types

See examples in:

- `convex/catalog/validators.ts` - Catalog validators
- `convex/inventory/validators.ts` - Inventory validators
- `src/types/catalog.ts` - Frontend catalog types
- `src/types/inventory.ts` - Frontend inventory types

## UI Component Patterns

### Shadcn UI Usage (REQUIRED)

**CRITICAL**: All UI components MUST be installed using the shadcn/ui CLI. Do NOT install Radix UI components or other UI libraries directly.

#### Installation Pattern

```bash
# ✅ CORRECT: Install via shadcn CLI
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add table

# ❌ WRONG: Direct npm installation
pnpm install @radix-ui/react-dialog
```

#### Usage Pattern

```typescript
// ✅ CORRECT: Import from shadcn/ui components
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// ❌ WRONG: Import from Radix UI directly
import * as Dialog from "@radix-ui/react-dialog";
```

#### When to Install New Components

Before creating a custom component, check if shadcn/ui has a component that meets your needs:

1. Check the [shadcn/ui components list](https://ui.shadcn.com/docs/components)
2. Install via CLI: `pnpm dlx shadcn@latest add [component-name]`
3. Components are automatically installed to `src/components/ui/`
4. All components come pre-configured with design tokens and accessibility

#### Component Composition

When building domain-specific components, compose from shadcn/ui primitives:

```typescript
// ✅ GOOD: Compose from shadcn/ui components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function InventoryItemCard({ item }: { item: InventoryItem }) {
  return (
    <Card>
      <CardHeader>{item.name}</CardHeader>
      <CardContent>
        <Button>Edit</Button>
      </CardContent>
    </Card>
  );
}
```

See [Frontend Architecture](../frontend/architecture.md#component-architecture) for the full component installation guide.

## Component Patterns

### Component Structure Template

All components should follow this structure:

```typescript
"use client"; // Required for client-side interactivity

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button"; // Use shadcn/ui

interface ComponentNameProps {
  children?: React.ReactNode;
  className?: string;
  // ... other props
}

const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  (props, ref) => {
    const { children, className, ...rest } = props;

    return (
      <div
        ref={ref}
        className={cn("base-styles", className)}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

ComponentName.displayName = "ComponentName";
export { ComponentName };
export type { ComponentNameProps };
```

### Loading and Error States

All components that fetch data should handle loading and error states:

```typescript
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function InventoryTable() {
  const items = useQuery(api.inventory.queries.listInventoryItems);
  const isLoading = items === undefined;

  // ✅ Loading state
  if (isLoading) {
    return <TableSkeleton />; // Use shadcn/ui Skeleton
  }

  // ✅ Error state
  if (items === null || "error" in items) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load inventory. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  // ✅ Success state
  return (
    <Table>
      {items.map(item => <TableRow key={item._id}>...</TableRow>)}
    </Table>
  );
}
```

### Component Organization

Components are organized by domain and reusability:

```
src/components/
├── ui/                    # shadcn/ui base components (never edit directly)
├── catalog/               # Catalog domain components
├── inventory/             # Inventory domain components
├── identify/              # Part identification components
├── layout/               # Navigation, headers, sidebars
├── providers/            # React context providers
└── settings/             # Settings forms
```

## React Hooks Patterns

### Custom Hooks Structure

Custom hooks should follow this pattern:

```typescript
// src/hooks/useGetPart.ts
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

// Export return type for consumers
export type UseGetPartResult = {
  data: FunctionReturnType<typeof api.catalog.queries.getPart>["data"] | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

export function useGetPart(partNumber: string | null): UseGetPartResult {
  const args = useMemo(() => (partNumber ? { partNumber } : null), [partNumber]);
  const res = useQuery(api.catalog.queries.getPart, args ?? "skip");
  const refresh = useAction(api.catalog.actions.enqueueRefreshPart);

  const isLoading = res === undefined;
  const data = res?.data ?? null;
  const isRefreshing = res?.status === "refreshing";

  return {
    data,
    isLoading,
    isRefreshing,
    refresh: async () => {
      if (args) await refresh(args);
    },
  };
}
```

### Hook Naming Conventions

- Custom hooks: `use[Domain][Action]` (e.g., `useGetPart`, `useInventorySearch`)
- Utility hooks: `use[Utility]` (e.g., `useDebounce`, `useLocalStorage`)
- State hooks: Use built-in React hooks (`useState`, `useReducer`) or Zustand stores

### Hook Organization

Hooks live in `src/hooks/` with one file per hook. Related hooks can share utilities:

```
src/hooks/
├── useGetPart.ts          # Single hook per file
├── useGetPartColors.ts    # Related hooks are separate files
├── use-local-storage.ts   # Utility hooks use kebab-case
└── useSearchStore.ts      # Zustand store hooks
```

## State Management Patterns

See [Frontend Architecture - State Management](../frontend/architecture.md#state-management-architecture) for full details.

### Quick Reference

- **Server State**: Use Convex `useQuery` for real-time subscriptions
- **UI State**: Use React `useState` for component-local state (modals, forms, navigation)
- **Complex Client State**: Use Zustand for multi-component coordination (selection, filters, preferences)

### State Management Decision Tree

```
Need real-time updates from server?
  └─> Use useQuery(api.domain.queries.*)

State is component-local?
  └─> Use useState

State shared across multiple components?
  └─> Use Zustand store

State is form data?
  └─> Use React Hook Form with useState or form state
```

## Naming Conventions

- **React Components**: PascalCase (e.g., `InventoryItemCard`)
- **Hooks**: camelCase with `use` prefix (e.g., `useInventory`, `useGetPart`)
- **Database Tables**: camelCase singular (Convex tables)
- **Functions**: camelCase (e.g., `addInventoryItem`)
- **Types**: PascalCase (e.g., `InventoryItem`, `SyncStatus`)
- **Validators**: camelCase with descriptive suffix (e.g., `searchPartsReturnValidator`, `addInventoryItemArgs`)
- **Routes**: Next.js App Router conventions (kebab-case folders)
- **Files**: Match the export (e.g., `InventoryTable.tsx` exports `InventoryTable`)

## Testing Standards

- Follow the comprehensive [Testing Strategy](./testing-strategy.md) for all test implementations
- Use `act()` for React state updates and `waitFor()` for async assertions
- Prefer `userEvent` over `fireEvent` for better user simulation
- Test components with proper loading and error states
- Mock Convex hooks using the testing utilities

## Error Handling Patterns

See [Error Handling Strategy](./error-handling.md) for full details.

### Quick Reference

- **Backend**: Use `ConvexError` for user-facing errors
- **Frontend**: Display errors using shadcn/ui `Alert` components
- **API Errors**: Normalize external API errors using `normalizeApiError()`
- **Form Errors**: Use React Hook Form error handling patterns
