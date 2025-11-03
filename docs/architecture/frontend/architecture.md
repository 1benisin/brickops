# Frontend Architecture

## Design Tokens

### BrickOps Brand Colors

```css
/* Light theme colors */
:root {
  /* Primary brand colors - professional blue palette */
  --primary-50: #eff6ff;
  --primary-100: #dbeafe;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4ed8;
  --primary-900: #1e3a8a;

  /* Neutral grays - clean, non-distracting */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;

  /* Semantic colors */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
}

/* Dark theme colors */
.dark {
  --primary-50: #1e3a8a;
  --primary-100: #1d4ed8;
  --primary-500: #60a5fa;
  --primary-600: #3b82f6;
  --primary-700: #2563eb;
  --primary-900: #eff6ff;

  --gray-50: #111827;
  --gray-100: #1f2937;
  --gray-200: #374151;
  --gray-300: #4b5563;
  --gray-400: #6b7280;
  --gray-500: #9ca3af;
  --gray-600: #d1d5db;
  --gray-700: #e5e7eb;
  --gray-800: #f3f4f6;
  --gray-900: #f9fafb;
}
```

### Typography Scale

```css
/* Typography system - clean, readable fonts */
:root {
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* Font sizes */
  --text-xs: 0.75rem; /* 12px */
  --text-sm: 0.875rem; /* 14px */
  --text-base: 1rem; /* 16px */
  --text-lg: 1.125rem; /* 18px */
  --text-xl: 1.25rem; /* 20px */
  --text-2xl: 1.5rem; /* 24px */
  --text-3xl: 1.875rem; /* 30px */
  --text-4xl: 2.25rem; /* 36px */

  /* Line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
}
```

### Responsive Breakpoints

```css
/* Mobile-first breakpoints */
:root {
  --breakpoint-sm: 640px; /* Small tablets */
  --breakpoint-md: 768px; /* Tablets */
  --breakpoint-lg: 1024px; /* Laptops */
  --breakpoint-xl: 1280px; /* Desktops */
  --breakpoint-2xl: 1536px; /* Large screens */
}
```

### Theme Usage

- Root layout must wrap children with `ThemeProvider` from `@/components/providers/theme-provider` to respect `prefers-color-scheme` and persist the user's selection.
- Use the `ThemeToggle` primitive (`@/components/ui/theme-toggle`) anywhere a quick switcher is required; it handles hydration, accessibility labels, and icon transitions.
- All brand colors, typography, spacing, and elevation tokens are exposed as CSS variables in `src/app/globals.css` and mapped through Tailwind for consistent theming.
- The `src/app/design-system` route documents primitives and layout compositions in-app; extend that page when introducing new reusable elements.

## Component Architecture

BrickOps uses a component-based architecture built on React with TypeScript, organized by domain and reusability patterns.

### shadcn/ui Component Installation

**CRITICAL**: All UI components MUST be installed using the shadcn/ui CLI. Do NOT install Radix UI components directly.

#### Installation Process

1. **Install new components using the CLI:**

   ```bash
   pnpm dlx shadcn@latest add [component-name]
   ```

2. **Import and use components:**

   ```typescript
   import { Button } from "@/components/ui/button"

   export default function MyComponent() {
     return (
       <div>
         <Button>Click me</Button>
       </div>
     )
   }
   ```

#### Available shadcn/ui Components

The following components are available for installation via the CLI:

- **Accordion** - Collapsible content sections
- **Alert** - Important messages and notifications
- **Alert Dialog** - Modal dialogs for confirmations
- **Aspect Ratio** - Maintain aspect ratios for media
- **Avatar** - User profile images and initials
- **Badge** - Small status indicators
- **Breadcrumb** - Navigation breadcrumbs
- **Button** - Interactive buttons and actions
- **Calendar** - Date selection calendar
- **Card** - Content containers
- **Carousel** - Image/content carousels
- **Chart** - Data visualization charts
- **Checkbox** - Form checkboxes
- **Collapsible** - Expandable content areas
- **Combobox** - Searchable select inputs
- **Command** - Command palette interfaces
- **Context Menu** - Right-click context menus
- **Data Table** - Advanced data tables with sorting/filtering
- **Date Picker** - Date selection interface
- **Dialog** - Modal dialogs
- **Drawer** - Slide-out panels
- **Dropdown Menu** - Dropdown navigation menus
- **Form** - React Hook Form integration
- **Hover Card** - Hover-triggered content cards
- **Input** - Text input fields
- **Input OTP** - One-time password inputs
- **Label** - Form labels
- **Menubar** - Application menu bars
- **Navigation Menu** - Main navigation menus
- **Pagination** - Page navigation controls
- **Popover** - Floating content containers
- **Progress** - Progress indicators
- **Radio Group** - Radio button groups
- **Resizable** - Resizable panels
- **Scroll-area** - Custom scrollable areas
- **Select** - Dropdown select inputs
- **Separator** - Visual content separators
- **Sheet** - Slide-out sheets
- **Sidebar** - Application sidebars
- **Skeleton** - Loading placeholders
- **Slider** - Range input sliders
- **Sonner** - Toast notifications
- **Switch** - Toggle switches
- **Table** - Basic data tables
- **Tabs** - Tabbed interfaces
- **Textarea** - Multi-line text inputs
- **Toast** - Notification toasts
- **Toggle** - Toggle buttons
- **Toggle Group** - Groups of toggle buttons
- **Tooltip** - Hover tooltips
- **Typography** - Text styling components

#### Component Installation Guidelines

- Always use `pnpm dlx shadcn@latest add [component]` for new components
- Components are automatically installed to `src/components/ui/`
- Import components from `@/components/ui/[component-name]`
- Do NOT manually install Radix UI primitives or other UI libraries
- All components come pre-configured with our design tokens and accessibility features

```typescript
// Component organization pattern
src/components/
├── ui/                    // Base UI components (Button, Input, Modal) - shadcn/ui
├── catalog/               // Catalog browsing components
├── common/                // Shared common components
├── dashboard/             // Dashboard display components
├── identify/              // Part identification components
├── inventory/             // Inventory management components
├── layout/                // Navigation, headers, sidebars
├── providers/             // React context providers
└── settings/              // Settings forms (credentials, users)
```

### Component Template

```typescript
"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ComponentNameProps {
  children?: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
}

const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  (props, ref) => {
    const {
      children,
      className,
      variant = "primary",
      size = "md",
      disabled = false,
      onClick,
      ...rest
    } = props;

    const handleClick = () => {
      if (disabled) return;
      onClick?.();
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          className
        )}
        onClick={handleClick}
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

## State Management Architecture

BrickOps implements a hybrid state management strategy aligned with backend state boundaries:

```typescript
interface StateArchitecture {
  // SERVER STATE (Convex Real-time Subscriptions)
  serverState: {
    inventory: "useQuery(api.inventory.queries.*)";
    catalog: "useQuery(api.catalog.queries.*)";
    users: "useQuery(api.users.queries.*)";
    marketplace: "useQuery(api.marketplace.queries.*)";
  };

  // CLIENT UI STATE (React Built-in)
  uiState: {
    modals: "useState<ModalState>";
    forms: "useState<FormData>";
    navigation: "useState<ActiveTab>";
    camera: "useState<CameraState>";
    notifications: "useState<NotificationQueue>";
    loading: "useState<LoadingStates>";
  };

  // COMPLEX CLIENT STATE (Zustand Stores)
  complexClientState: {
    inventorySelection: "useInventoryStore";
    searchFilters: "useSearchStore";
    userPreferences: "usePreferencesStore";
    cameraCapture: "useCameraStore";
  };
}
```

**State Management Patterns:**

- Real-time server state updates via Convex subscriptions
- Optimistic UI updates with automatic rollback on failure
- Complex state coordination using Zustand for multi-component workflows

## Routing Architecture

```typescript
// Route organization using Next.js App Router
app/
├── (auth)/               // Auth pages
│   ├── login/
│   ├── signup/
│   ├── reset-password/
│   └── invite/
├── (authenticated)/      // Protected routes
│   ├── catalog/          // Parts catalog
│   ├── dashboard/        // Dashboard overview
│   ├── identify/         // Part identification
│   ├── inventory/        // Inventory management
│   │   ├── files/        // Inventory file management
│   │   └── history/      // Inventory change history
│   ├── orders/           // Order processing (placeholder)
│   └── settings/         // User and business settings
└── design-system/        // Design system showcase
```

### Protected Route Pattern

**External Documentation References:**

- [Next.js Authorization](../external-documentation/convex-auth/authorization-nextjs.md) - Server-side authentication and middleware setup
- [Convex Auth Authorization](../external-documentation/convex-auth/authorization.md) - Frontend authentication state management
- [Convex Auth Configuration](../external-documentation/convex-auth/configure-auth.md) - Authentication method setup

```typescript
// middleware.ts - Authentication and route protection
import { NextRequest, NextResponse } from "next/server";

const ROUTE_PERMISSIONS = {
  public: ["/login", "/signup", "/reset-password", "/invite"],
  protected: [
    "/dashboard",
    "/inventory",
    "/inventory/files",
    "/inventory/history",
    "/orders",
    "/catalog",
    "/identify",
    "/settings",
  ],
} as const;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get("convex-auth-token")?.value;

  // Authentication and role-based protection logic
  return NextResponse.next();
}
```

## Frontend Services Layer

All network operations go through centralized service classes that respect rate limits and provide consistent error handling:

```typescript
// lib/services/inventory-service.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export class InventoryService {
  private convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  async addInventoryItem(request: AddInventoryItemRequest) {
    try {
      const itemId = await this.convex.mutation(api.inventory.addInventoryItem, request);
      return { success: true, data: itemId };
    } catch (error) {
      return this.handleApiError("Failed to create inventory item", error);
    }
  }

  async searchInventory(request: SearchInventoryRequest) {
    try {
      const items = await this.convex.query(api.inventory.searchInventory, request);
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to search inventory", error);
    }
  }

  private handleApiError(operation: string, error: unknown) {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}
```

## Data Table Architecture

> Applies to all pages that use `src/components/ui/data-table/*` (orders, inventory, future server-driven tables).

### Building Blocks

- **DataTable** (`data-table.tsx`) – Thin wrapper around TanStack Table configured for manual (server-side) sorting, filtering, and pagination. Uses local storage to persist column visibility/sizing.
- **useServerTableState** – Converts TanStack column filter/sort state into our normalized `QuerySpec` contract. Debounces text filters, resets pagination when filters/sorts change, and exposes the current `querySpec` for Convex queries.
- **Filter utilities** (`utils/filter-state.ts`) – Maps between TanStack filter values and our query contract. Exposes helper filters:
  - `manualNumberRangeFilter` – Required for any numeric column so TanStack keeps `{min, max}` objects.
  - `manualDateRangeFilter` – Required for date columns so `{start, end}` ranges are not auto-removed.

### Server-Side Flow

1. Column metadata (`meta.filterType` + optional `filterConfig`) is defined in the column factory (e.g. `createOrdersColumns`, `createInventoryColumns`).
2. Column state is controlled via `useServerTableState`, which emits a normalized `QuerySpec` object whenever filters or sorts change.
3. Page wrappers (e.g. `OrdersTableWrapper`, `InventoryTableWrapper`) pass that `QuerySpec` to Convex queries (`listOrdersFiltered`, `listInventoryItemsFiltered`), translate the response, and feed it back into the table.
4. Filter state coming back from the server is translated through `querySpecToColumnFilters` to keep UI in sync.

### Filter UI Patterns

- **Number ranges** use `NumberRangeFilterInline`, which now renders a popover trigger. Always pass a column id that matches the column definition and ensure the column uses `manualNumberRangeFilter`.
  - Popover summary shows `≥ min` / `≤ max` when set.
  - `Apply` commits the draft values; `Clear` sends `undefined` back through TanStack and Convex.
- **Date ranges** use `DateRangeFilterInline`. When adding new date columns, remember to:
  - Set `meta.filterType: "date"`.
  - Attach `manualDateRangeFilter` to prevent TanStack from discarding the `{start, end}` object before it reaches `useServerTableState`.
- **Text filters** still use debounce. Avoid forcing synchronous updates so that server requests remain batched.

### Implementation Checklist for New Tables/Columns

1. Define columns via `createColumn` with explicit `id` (or `accessorKey`) and `meta.filterType`.
2. Assign the appropriate manual filter function (`manualNumberRangeFilter`, `manualDateRangeFilter`, or leave default for text/select).
3. Use `useServerTableState` in the wrapper to translate TanStack state into Convex `QuerySpec` objects.
4. Convert incoming server filters back into TanStack format using `querySpecToColumnFilters` so pagination/filter UI stays hydrated on refresh.
5. When introducing custom filter UI (e.g. popovers), keep internal draft state separate from committed filter state to avoid update loops.
6. Update the backend query validators/handlers to honor any new filter keys before wiring them through the table.

### Additional Documentation Backlog

- **Testing Matrix** – Document how we validate filters/sorts (unit tests around `columnFiltersToQuerySpec` plus integration checks on wrapper components).
- **Performance Guardrails** – Clarify page-size limits, debounce defaults, and when to prefer contains vs prefix searches to protect Convex query costs.
- **Extensibility Guide** – Provide a worked example for adding a new table (catalog or reports) so future devs can follow a repeatable pattern without re-discovering server/table wiring details.
