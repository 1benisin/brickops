# Component Standards

## Component Template

```typescript
"use client";

import React from "react";
import { cn } from "@/lib/utils";

// Define component props interface
interface ComponentNameProps {
  children?: React.ReactNode;
  className?: string;
  // Add specific props here
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
}

// Main component with TypeScript and forwardRef for better composition
const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      disabled = false,
      onClick,
      ...props
    },
    ref
  ) => {
    // Component logic here
    const handleClick = () => {
      if (disabled) return;
      onClick?.();
    };

    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center rounded-md font-medium transition-colors",
          // Variant styles
          {
            "bg-blue-600 text-white hover:bg-blue-700": variant === "primary",
            "bg-gray-200 text-gray-900 hover:bg-gray-300":
              variant === "secondary",
            "border border-gray-300 bg-white hover:bg-gray-50":
              variant === "outline",
          },
          // Size styles
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-10 px-4 text-base": size === "md",
            "h-12 px-6 text-lg": size === "lg",
          },
          // Disabled state
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        onClick={handleClick}
        {...props}
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

## Naming Conventions

**Files and Directories:**

- **Components**: PascalCase files (e.g., `InventoryItem.tsx`, `CameraCapture.tsx`)
- **Pages**: lowercase with hyphens (e.g., `page.tsx`, `loading.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useInventory.ts`, `useCamera.ts`)
- **Utilities**: camelCase (e.g., `formatPartNumber.ts`, `validateInventory.ts`)
- **Stores**: camelCase with `-store` suffix (e.g., `inventory-store.ts`, `auth-store.ts`)
- **Types**: camelCase (e.g., `inventory-types.ts`, `api-types.ts`)

**Component Naming:**

- **Base UI Components**: Descriptive names (e.g., `Button`, `Input`, `Modal`)
- **Domain Components**: Domain + Action pattern (e.g., `InventoryCard`, `OrderTable`, `PickingSession`)
- **Page Components**: Page + suffix (e.g., `InventoryPageContent`, `DashboardLayout`)
- **Form Components**: Form + purpose (e.g., `InventoryForm`, `LoginForm`, `UserInviteForm`)

**BrickOps-Specific Conventions:**

- **Part-related**: Always include "Part" in component names (e.g., `PartCard`, `PartIdentifier`, `PartSearch`)
- **Order-related**: Use "Order" prefix (e.g., `OrderRow`, `OrderDetails`, `OrderPicker`)
- **Inventory-related**: Use "Inventory" prefix (e.g., `InventoryGrid`, `InventoryForm`, `InventoryStatus`)
- **Picking-related**: Use "Pick" prefix (e.g., `PickCard`, `PickSession`, `PickProgress`)
