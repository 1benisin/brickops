# Frontend Architecture

## Component Architecture

BrickOps uses a component-based architecture built on React with TypeScript, organized by domain and reusability patterns.

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
      const itemId = await this.convex.mutation(
        api.inventory.addInventoryItem,
        request
      );
      return { success: true, data: itemId };
    } catch (error) {
      return this.handleApiError("Failed to create inventory item", error);
    }
  }

  async searchInventory(request: SearchInventoryRequest) {
    try {
      const items = await this.convex.query(
        api.inventory.searchInventory,
        request
      );
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to search inventory", error);
    }
  }

  private handleApiError(operation: string, error: unknown) {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}
```
