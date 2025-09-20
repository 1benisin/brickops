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
├── ui/                    // Base UI components (Button, Input, Modal)
├── forms/                 // Form-specific components with validation
├── camera/                // Camera capture and part identification
├── inventory/             // Inventory management components
├── orders/                // Order processing and management
├── picking/               // Pick session workflow components
└── layout/                // Navigation, headers, sidebars
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
    inventory: "useQuery(api.inventory.getByUser)";
    orders: "useQuery(api.orders.getByBusinessAccount)";
    catalog: "useQuery(api.catalog.searchParts)";
    pickSessions: "useQuery(api.picking.getActiveSessions)";
    users: "useQuery(api.auth.getBusinessAccountUsers)";
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
    pickingWorkflow: "usePickingStore";
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
├── (auth)/               // Route group for authentication
│   ├── login/
│   └── signup/
├── dashboard/            // Main dashboard routes
├── inventory/            // Inventory management
├── identify/             // Part identification
├── orders/               // Order management
│   └── picking/          // Pick session routes
├── catalog/              // Parts catalog
└── settings/             // User and business settings
```

### Protected Route Pattern

```typescript
// middleware.ts - Authentication and route protection
import { NextRequest, NextResponse } from "next/server";

const ROUTE_PERMISSIONS = {
  public: ["/login", "/signup", "/"],
  protected: ["/dashboard", "/inventory", "/orders", "/catalog", "/identify"],
  ownerOnly: ["/settings/users", "/settings/billing"],
  managerPlus: ["/orders/picking", "/inventory/upload"],
  pickerPlus: ["/orders/picking/[sessionId]"],
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
