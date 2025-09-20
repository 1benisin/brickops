# BrickOps Frontend Architecture Document

## Change Log

| Date       | Version | Description                            | Author              |
| ---------- | ------- | -------------------------------------- | ------------------- |
| 2025-01-20 | 1.0     | Initial frontend architecture creation | Winston (Architect) |

## Template and Framework Selection

Based on the BrickOps PRD, the frontend technology stack has been specified:

- **Framework**: Next.js 14+ with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Built-in React (useState, useContext, useReducer) with Zustand available
- **Backend**: Convex for real-time database and serverless functions
- **Deployment**: Vercel

**Framework Analysis:**
Next.js 14+ is excellent for BrickOps because:

- **Server-Side Rendering**: Perfect for SEO and fast initial loads
- **API Routes**: Can handle authentication and API integrations
- **Image Optimization**: Critical for displaying high-quality Lego part images
- **Mobile-First Support**: Essential for camera integration workflow
- **TypeScript Integration**: Provides type safety for complex inventory data structures

**Template Decision**: Using **Next.js App Router** starter template which provides:

- Modern file-based routing with the app directory
- Built-in TypeScript support
- Optimized bundling and performance
- Middleware support for authentication

## Frontend Tech Stack

| Category          | Technology                     | Version  | Purpose                           | Rationale                                                                               |
| ----------------- | ------------------------------ | -------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Framework         | Next.js                        | 14+      | React meta-framework with SSR/SSG | Optimal for mobile-first responsive design with excellent image handling for Lego parts |
| UI Library        | React                          | 18+      | Component-based UI library        | Industry standard with excellent mobile camera integration support                      |
| State Management  | React Built-in + Zustand       | Latest   | Local and global state management | React hooks for simple state, Zustand for complex inventory management state            |
| Routing           | Next.js App Router             | 14+      | File-based routing system         | Provides nested layouts perfect for inventory/order/picking workflows                   |
| Build Tool        | Next.js/Webpack                | Built-in | Bundling and optimization         | Integrated solution with excellent image optimization for part catalogs                 |
| Styling           | Tailwind CSS                   | 3.4+     | Utility-first CSS framework       | Rapid development with consistent design system, excellent mobile responsiveness        |
| Testing           | Jest + React Testing Library   | Latest   | Unit and integration testing      | Industry standard for React applications                                                |
| Component Library | Headless UI + Custom           | 1.7+     | Accessible UI primitives          | WCAG AA compliance requirement with full customization for Lego theme                   |
| Form Handling     | React Hook Form                | 7.0+     | Form validation and handling      | Performance-focused form library for inventory input forms                              |
| Animation         | Framer Motion                  | 11+      | Smooth UI transitions             | Enhanced UX for camera capture feedback and inventory updates                           |
| Dev Tools         | ESLint + Prettier + TypeScript | Latest   | Code quality and type safety      | Ensures consistent code quality for complex inventory logic                             |

## Project Structure

```plaintext
brickops/
├── app/                          # Next.js App Router directory
│   ├── (auth)/                   # Route group for auth pages
│   │   ├── login/
│   │   └── signup/
│   ├── dashboard/                # Main dashboard routes
│   │   ├── page.tsx             # Inventory dashboard
│   │   └── layout.tsx           # Dashboard layout with nav
│   ├── inventory/               # Inventory management routes
│   │   ├── page.tsx             # Inventory list view
│   │   ├── add/                 # Add new inventory
│   │   ├── [id]/                # Individual inventory item
│   │   └── upload/              # Bulk inventory upload
│   ├── identify/                # Part identification routes
│   │   ├── page.tsx             # Camera interface
│   │   └── results/             # Identification results
│   ├── orders/                  # Order management routes
│   │   ├── page.tsx             # Order table view
│   │   ├── [id]/                # Individual order details
│   │   └── picking/             # Pick session routes
│   │       ├── [sessionId]/
│   │       └── todo/
│   ├── catalog/                 # Parts catalog routes
│   │   ├── page.tsx             # Catalog search
│   │   └── [partId]/            # Part detail pages
│   ├── settings/                # User settings routes
│   │   ├── page.tsx             # Account settings
│   │   ├── users/               # User management (owners only)
│   │   └── integrations/        # API configurations
│   ├── api/                     # Next.js API routes
│   │   ├── auth/                # Auth endpoints
│   │   ├── bricklink/           # Bricklink API proxy
│   │   ├── brickowl/            # Brickowl API proxy
│   │   └── brickognize/         # Brickognize API proxy
│   ├── globals.css              # Global styles and Tailwind imports
│   ├── layout.tsx               # Root layout with providers
│   ├── loading.tsx              # Global loading UI
│   ├── error.tsx                # Global error UI
│   └── page.tsx                 # Landing/redirect page
├── components/                   # Reusable UI components
│   ├── ui/                      # Base UI components (buttons, inputs, etc.)
│   ├── forms/                   # Form-specific components
│   ├── camera/                  # Camera capture components
│   ├── inventory/               # Inventory-specific components
│   ├── orders/                  # Order management components
│   ├── picking/                 # Pick session components
│   └── layout/                  # Layout components (nav, sidebar, etc.)
├── lib/                         # Utility libraries and configurations
│   ├── convex.ts               # Convex client configuration
│   ├── auth.ts                 # Authentication utilities
│   ├── utils.ts                # General utility functions
│   ├── types.ts                # Shared TypeScript types
│   ├── constants.ts            # Application constants
│   └── validations/            # Form validation schemas
├── hooks/                       # Custom React hooks
│   ├── use-auth.ts             # Authentication hooks
│   ├── use-camera.ts           # Camera access hooks
│   ├── use-inventory.ts        # Inventory management hooks
│   └── use-realtime.ts         # Convex subscription hooks
├── store/                       # Zustand store definitions
│   ├── auth-store.ts           # Authentication state
│   ├── inventory-store.ts      # Inventory management state
│   ├── picking-store.ts        # Pick session state
│   └── ui-store.ts             # UI state (modals, notifications)
├── styles/                      # Additional styling files
│   └── components.css          # Component-specific styles
├── public/                      # Static assets
│   ├── icons/                  # App icons and favicons
│   └── images/                 # Static images
├── convex/                      # Convex backend functions
│   ├── auth.ts                 # Authentication functions
│   ├── inventory.ts            # Inventory operations
│   ├── orders.ts               # Order management
│   ├── catalog.ts              # Catalog operations
│   └── schema.ts               # Database schema
└── tests/                       # Test files
    ├── __mocks__/              # Mock implementations
    ├── components/             # Component tests
    ├── hooks/                  # Hook tests
    ├── pages/                  # Page integration tests
    └── utils/                  # Utility function tests
```

## Component Standards

### Component Template

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

### Naming Conventions

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

## State Management

BrickOps uses a **hybrid state architecture** that aligns with the backend state boundaries defined in the main architecture document. This ensures optimal performance, consistency, and maintainability across the full stack.

### State Architecture Alignment

**Following Backend State Boundaries:**

- **Server State**: Managed by Convex with real-time subscriptions
- **Client UI State**: React built-in state management (useState, useReducer)
- **Complex Client State**: Zustand for cross-component shared state

This alignment ensures clear separation of concerns and optimal data flow patterns.

### Store Structure

```plaintext
store/
├── auth-store.ts              # Authentication and user session state
├── inventory-store.ts         # Inventory management and real-time updates
├── picking-store.ts           # Pick session state and progress tracking
├── orders-store.ts            # Order management and marketplace sync status
├── catalog-store.ts           # Parts catalog cache and search state
├── ui-store.ts                # UI state (modals, notifications, loading states)
├── camera-store.ts            # Camera capture and part identification state
└── index.ts                   # Store exports and type definitions
```

### State Management Template

```typescript
// inventory-store.ts - Example comprehensive store for inventory management
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware/persist";

// TypeScript interfaces aligned with backend Convex schema
interface InventoryItem {
  id: Id<"inventoryItems">; // Matches backend: Id<"inventoryItems">
  businessAccountId: Id<"businessAccounts">; // Matches backend: Id<"businessAccounts">
  partNumber: string; // Matches backend schema
  colorId: string; // Matches backend: colorId (not color)
  location: string; // Matches backend schema
  quantityAvailable: number; // Matches backend: quantityAvailable
  quantityReserved: number; // Matches backend: quantityReserved
  quantitySold: number; // Matches backend: quantitySold
  condition: "new" | "used"; // Matches backend: condition enum
  createdAt: number; // Matches backend: timestamp
  updatedAt: number; // Matches backend: timestamp
}

interface BusinessAccount {
  id: Id<"businessAccounts">;
  name: string;
  ownerId: Id<"users">;
  bricklinkCredentials?: {
    consumerKey: string;
    consumerSecret: string;
    tokenValue: string;
    tokenSecret: string;
    encrypted: boolean;
  };
  brickowlCredentials?: {
    apiKey: string;
    encrypted: boolean;
  };
  subscriptionStatus: "active" | "suspended" | "trial";
  createdAt: number;
}

interface User {
  id: Id<"users">;
  email: string;
  businessAccountId: Id<"businessAccounts">;
  role: "owner" | "manager" | "picker" | "view-only";
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

interface MarketplaceOrder {
  id: Id<"marketplaceOrders">;
  businessAccountId: Id<"businessAccounts">;
  marketplaceOrderId: string;
  marketplace: "bricklink" | "brickowl";
  customerName: string;
  customerAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  orderStatus: "pending" | "picked" | "shipped" | "completed" | "cancelled";
  totalValue: number;
  orderItems: Array<{
    partNumber: string;
    colorId: string;
    quantity: number;
    unitPrice: number;
    condition: "new" | "used";
  }>;
  syncedAt: number;
  createdAt: number;
}

interface PickSession {
  id: Id<"pickSessions">;
  businessAccountId: Id<"businessAccounts">;
  pickerUserId: Id<"users">;
  orderIds: Array<Id<"marketplaceOrders">>;
  status: "active" | "paused" | "completed";
  pickPath: Array<{
    partNumber: string;
    colorId: string;
    location: string;
    quantityNeeded: number;
    orderIds: Array<Id<"marketplaceOrders">>;
  }>;
  currentPosition: number;
  issuesEncountered: Array<{
    partNumber: string;
    colorId: string;
    issueType: string;
    notes?: string;
    timestamp: number;
  }>;
  startedAt: number;
  completedAt?: number;
}

interface TodoItem {
  id: Id<"todoItems">;
  businessAccountId: Id<"businessAccounts">;
  partNumber: string;
  colorId: string;
  quantityNeeded: number;
  orderId: Id<"marketplaceOrders">;
  pickSessionId?: Id<"pickSessions">;
  reason: "not_found" | "damaged" | "insufficient_quantity" | "wrong_color";
  status: "pending" | "resolved" | "refunded";
  notes?: string;
  resolvedAt?: number;
  createdAt: number;
}

interface InventoryAuditLog {
  id: Id<"inventoryAuditLog">;
  businessAccountId: Id<"businessAccounts">;
  inventoryItemId: Id<"inventoryItems">;
  userId: Id<"users">;
  changeType: "created" | "quantity_updated" | "location_changed" | "status_changed" | "deleted";
  previousValues?: any;
  newValues: any;
  reason?: string;
  createdAt: number;
}

interface InventoryState {
  // Data state
  items: InventoryItem[];
  filteredItems: InventoryItem[];
  selectedItems: string[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setItems: (items: InventoryItem[]) => void;
  addItem: (item: Omit<InventoryItem, "id" | "lastUpdated">) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;

  // Selection actions
  selectItem: (id: string) => void;
  selectMultipleItems: (ids: string[]) => void;
  clearSelection: () => void;

  // Async actions
  fetchInventory: () => Promise<void>;
  syncWithBricklink: () => Promise<void>;
}

// Create the store with middleware
export const useInventoryStore = create<InventoryState>()(
  subscribeWithSelector(
    immer(
      persist(
        (set, get) => ({
          // Initial state
          items: [],
          filteredItems: [],
          selectedItems: [],
          isLoading: false,
          error: null,

          // Implementation details...
          setItems: (items) =>
            set((state) => {
              state.items = items;
              state.filteredItems = items;
            }),

          // Additional actions...
        }),
        {
          name: "inventory-store",
          partialize: (state) => ({
            // Only persist filters and UI preferences
            selectedItems: [],
          }),
        },
      ),
    ),
  ),
);
```

## API Integration

### Service Template

```typescript
// lib/services/inventory-service.ts - Aligned with backend InventoryService
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface InventoryApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

interface AddInventoryItemRequest {
  businessAccountId: Id<"businessAccounts">;
  partNumber: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  condition: "new" | "used";
}

interface UpdateQuantitiesRequest {
  itemId: Id<"inventoryItems">;
  availableChange?: number;
  reservedChange?: number;
  soldChange?: number;
}

interface SearchInventoryRequest {
  businessAccountId: Id<"businessAccounts">;
  filters?: {
    partNumber?: string;
    location?: string;
    status?: "available" | "sold" | "reserved";
    colorId?: string;
  };
}

export class InventoryService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: addInventoryItem(businessAccountId, partDetails, quantity, location)
  async addInventoryItem(
    request: AddInventoryItemRequest,
  ): Promise<InventoryApiResponse<Id<"inventoryItems">>> {
    try {
      const itemId = await this.convex.mutation(api.inventory.addInventoryItem, request);
      return { success: true, data: itemId };
    } catch (error) {
      return this.handleApiError("Failed to create inventory item", error);
    }
  }

  // Matches backend: updateQuantities(itemId, availableChange, reservedChange, soldChange)
  async updateQuantities(request: UpdateQuantitiesRequest): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.inventory.updateQuantities, request);
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to update quantities", error);
    }
  }

  // Matches backend: searchInventory(businessAccountId, filters)
  async searchInventory(
    request: SearchInventoryRequest,
  ): Promise<InventoryApiResponse<InventoryItem[]>> {
    try {
      const items = await this.convex.query(api.inventory.searchInventory, request);
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to search inventory", error);
    }
  }

  // Matches backend: getInventoryByLocation(businessAccountId, location)
  async getInventoryByLocation(
    businessAccountId: Id<"businessAccounts">,
    location: string,
  ): Promise<InventoryApiResponse<InventoryItem[]>> {
    try {
      const items = await this.convex.query(api.inventory.getInventoryByLocation, {
        businessAccountId,
        location,
      });
      return { success: true, data: items };
    } catch (error) {
      return this.handleApiError("Failed to get inventory by location", error);
    }
  }

  // Matches backend: auditInventoryChanges(businessAccountId, dateRange)
  async getAuditHistory(
    businessAccountId: Id<"businessAccounts">,
    dateRange?: { start: number; end: number },
  ): Promise<InventoryApiResponse<InventoryAuditLog[]>> {
    try {
      const auditLog = await this.convex.query(api.inventory.auditInventoryChanges, {
        businessAccountId,
        dateRange,
      });
      return { success: true, data: auditLog };
    } catch (error) {
      return this.handleApiError("Failed to get audit history", error);
    }
  }

  private handleApiError(operation: string, error: unknown): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

export const inventoryService = new InventoryService();

// lib/services/part-identification-service.ts - Aligned with backend PartIdentificationService
export class PartIdentificationService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: identifyPartFromImage(imageData, businessAccountId)
  async identifyPartFromImage(
    imageFileId: Id<"_storage">,
    businessAccountId: Id<"businessAccounts">,
  ): Promise<InventoryApiResponse<PartIdentificationResult>> {
    try {
      const result = await this.convex.mutation(api.identification.identifyPartFromImage, {
        imageFileId,
        businessAccountId,
      });
      return { success: true, data: result };
    } catch (error) {
      return this.handleApiError("Failed to identify part", error);
    }
  }

  // Matches backend: getIdentificationResults(requestId)
  async getIdentificationResults(
    requestId: string,
  ): Promise<InventoryApiResponse<PartIdentificationResult>> {
    try {
      const result = await this.convex.query(api.identification.getIdentificationResults, {
        requestId,
      });
      return { success: true, data: result };
    } catch (error) {
      return this.handleApiError("Failed to get identification results", error);
    }
  }

  // Matches backend: verifyIdentification(partNumber, colorId, confirmed)
  async verifyIdentification(
    identificationId: Id<"partIdentifications">,
    partNumber: string,
    colorId: string,
    confirmed: boolean,
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.identification.verifyIdentification, {
        identificationId,
        partNumber,
        colorId,
        confirmed,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to verify identification", error);
    }
  }

  private handleApiError(operation: string, error: unknown): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

// lib/services/order-service.ts - Aligned with backend OrderProcessingService
export class OrderService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: processNewOrders(businessAccountId)
  async processNewOrders(
    businessAccountId: Id<"businessAccounts">,
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.action(api.orders.processNewOrders, {
        businessAccountId,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to process new orders", error);
    }
  }

  // Matches backend: updateOrderStatus(orderId, newStatus)
  async updateOrderStatus(
    orderId: Id<"marketplaceOrders">,
    newStatus: "pending" | "picked" | "shipped" | "completed",
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.orders.updateOrderStatus, {
        orderId,
        newStatus,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to update order status", error);
    }
  }

  // Matches backend: generatePickSheets(orderIds)
  async generatePickSheets(
    orderIds: Array<Id<"marketplaceOrders">>,
  ): Promise<InventoryApiResponse<string>> {
    try {
      const pdfUrl = await this.convex.action(api.orders.generatePickSheets, {
        orderIds,
      });
      return { success: true, data: pdfUrl };
    } catch (error) {
      return this.handleApiError("Failed to generate pick sheets", error);
    }
  }

  // Matches backend: exportOrdersToCSV(orderIds, format)
  async exportOrdersToCSV(
    orderIds: Array<Id<"marketplaceOrders">>,
    format: "standard" | "detailed",
  ): Promise<InventoryApiResponse<string>> {
    try {
      const csvUrl = await this.convex.action(api.orders.exportOrdersToCSV, {
        orderIds,
        format,
      });
      return { success: true, data: csvUrl };
    } catch (error) {
      return this.handleApiError("Failed to export orders to CSV", error);
    }
  }

  private handleApiError(operation: string, error: unknown): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

// lib/services/picking-service.ts - Aligned with backend PickSessionService
export class PickingService {
  private convex: ConvexHttpClient;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  // Matches backend: createPickSession(userId, orderIds)
  async createPickSession(
    userId: Id<"users">,
    orderIds: Array<Id<"marketplaceOrders">>,
  ): Promise<InventoryApiResponse<Id<"pickSessions">>> {
    try {
      const sessionId = await this.convex.mutation(api.picking.createPickSession, {
        userId,
        orderIds,
      });
      return { success: true, data: sessionId };
    } catch (error) {
      return this.handleApiError("Failed to create pick session", error);
    }
  }

  // Matches backend: markPartPicked(sessionId, partNumber, quantityPicked)
  async markPartPicked(
    sessionId: Id<"pickSessions">,
    partNumber: string,
    colorId: string,
    quantityPicked: number,
  ): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.picking.markPartPicked, {
        sessionId,
        partNumber,
        colorId,
        quantityPicked,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to mark part picked", error);
    }
  }

  // Matches backend: reportPickingIssue(sessionId, partNumber, issueType, notes)
  async reportPickingIssue(
    sessionId: Id<"pickSessions">,
    partNumber: string,
    colorId: string,
    issueType: "not_found" | "damaged" | "insufficient_quantity" | "wrong_color",
    notes?: string,
  ): Promise<InventoryApiResponse<Id<"todoItems">>> {
    try {
      const todoId = await this.convex.mutation(api.picking.reportPickingIssue, {
        sessionId,
        partNumber,
        colorId,
        issueType,
        notes,
      });
      return { success: true, data: todoId };
    } catch (error) {
      return this.handleApiError("Failed to report picking issue", error);
    }
  }

  // Matches backend: completePickSession(sessionId)
  async completePickSession(sessionId: Id<"pickSessions">): Promise<InventoryApiResponse<void>> {
    try {
      await this.convex.mutation(api.picking.completePickSession, {
        sessionId,
      });
      return { success: true };
    } catch (error) {
      return this.handleApiError("Failed to complete pick session", error);
    }
  }

  private handleApiError(operation: string, error: unknown): InventoryApiResponse<never> {
    console.error(`${operation}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      code: 500,
    };
  }
}

export const partIdentificationService = new PartIdentificationService();
export const orderService = new OrderService();
export const pickingService = new PickingService();
```

### API Client Configuration

```typescript
// lib/api-client.ts - Centralized API client with rate limiting
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  constructor(private rateLimit: { requestsPerMinute: number; burstLimit: number }) {}

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRateLimit(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  // Additional rate limiting implementation...
}

export class ApiClient {
  private convex: ConvexHttpClient;
  private requestQueues: Record<string, RequestQueue>;

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

    this.requestQueues = {
      bricklink: new RequestQueue({ requestsPerMinute: 5000, burstLimit: 10 }),
      brickowl: new RequestQueue({ requestsPerMinute: 1000, burstLimit: 5 }),
      brickognize: new RequestQueue({ requestsPerMinute: 100, burstLimit: 3 }),
    };
  }

  // API methods with rate limiting...
}
```

## Routing

### Route Configuration

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

const ROLE_HIERARCHY = {
  "view-only": 0,
  picker: 1,
  manager: 2,
  owner: 3,
} as const;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get("convex-auth-token")?.value;

  // Authentication and role-based protection logic...

  return NextResponse.next();
}
```

## Styling Guidelines

### Styling Approach

BrickOps uses Tailwind CSS with a mobile-first approach and component variants for consistent design patterns.

### Global Theme Variables

```css
/* styles/globals.css - Global theme system */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Brand Colors - Professional Lego-inspired palette */
  --color-primary-500: #3b82f6; /* Primary blue */
  --color-secondary-500: #22c55e; /* Success green */

  /* Status Colors */
  --color-available: #22c55e; /* Green for available inventory */
  --color-sold: #6b7280; /* Gray for sold items */
  --color-reserved: #f59e0b; /* Amber for reserved items */
  --color-picking: #8b5cf6; /* Purple for items being picked */

  /* Spacing Scale - Based on 4px grid */
  --space-4: 1rem; /* 16px */
  --space-8: 2rem; /* 32px */

  /* Border Radius */
  --radius-md: 0.375rem; /* 6px */

  /* Shadows */
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

@layer components {
  .btn-primary {
    @apply bg-primary-600 text-white hover:bg-primary-700 focus:ring-2 focus:ring-primary-500;
  }

  .card {
    @apply bg-white rounded-lg border border-neutral-200 shadow-sm;
  }

  .status-available {
    @apply bg-green-100 text-green-800 ring-green-600/20;
  }

  .inventory-grid {
    @apply grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5;
  }
}
```

## Testing Requirements

### Component Test Template

```typescript
// __tests__/components/inventory/InventoryCard.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { InventoryCard } from "@/components/inventory/InventoryCard";

const mockConvexClient = new ConvexReactClient("https://test.convex.dev");

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ConvexProvider client={mockConvexClient}>{children}</ConvexProvider>
);

describe("InventoryCard", () => {
  const mockInventoryItem = {
    id: "123",
    partNumber: "3001",
    description: "2x4 Brick",
    color: "Red",
    quantity: 10,
    location: "A1-B2",
    status: "available" as const,
    lastUpdated: new Date("2025-01-20"),
    userId: "user123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders inventory item information correctly", () => {
    render(
      <TestWrapper>
        <InventoryCard item={mockInventoryItem} />
      </TestWrapper>
    );

    expect(screen.getByText("3001")).toBeInTheDocument();
    expect(screen.getByText("2x4 Brick")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("A1-B2")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("handles quantity adjustment correctly", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <InventoryCard item={mockInventoryItem} />
      </TestWrapper>
    );

    const incrementButton = screen.getByRole("button", {
      name: /increase quantity/i,
    });
    await user.click(incrementButton);

    // Test expectations...
  });
});
```

### Testing Best Practices

1. **Unit Tests**: Test individual components in isolation with proper mocking
2. **Integration Tests**: Test component interactions and API integrations
3. **E2E Tests**: Test critical user flows including camera capture and order processing
4. **Coverage Goals**: Aim for 80% code coverage with focus on business logic
5. **Test Structure**: Follow Arrange-Act-Assert pattern with descriptive test names
6. **Mock External Dependencies**: Mock API calls, camera access, and marketplace integrations

## Environment Configuration

```bash
# .env.local - Local development environment variables

# =============================================================================
# NEXT.JS CONFIGURATION
# =============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=BrickOps

# =============================================================================
# CONVEX BACKEND CONFIGURATION
# =============================================================================
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=your-deploy-key-here

# =============================================================================
# EXTERNAL API CONFIGURATIONS
# =============================================================================
# Bricklink API Configuration
BRICKLINK_CONSUMER_KEY=your-bricklink-consumer-key
BRICKLINK_CONSUMER_SECRET=your-bricklink-consumer-secret
BRICKLINK_ACCESS_TOKEN=your-bricklink-access-token
BRICKLINK_ACCESS_TOKEN_SECRET=your-bricklink-token-secret

# Brickowl API Configuration
BRICKOWL_API_KEY=your-brickowl-api-key

# Brickognize API Configuration
BRICKOGNIZE_API_KEY=your-brickognize-api-key

# =============================================================================
# RATE LIMITING CONFIGURATION
# =============================================================================
BRICKLINK_RATE_LIMIT_RPM=5000
BRICKOWL_RATE_LIMIT_RPM=1000
BRICKOGNIZE_RATE_LIMIT_RPM=100

# =============================================================================
# FEATURE FLAGS
# =============================================================================
NEXT_PUBLIC_FEATURE_BULK_UPLOAD=true
NEXT_PUBLIC_FEATURE_ADVANCED_PICKING=true
NEXT_PUBLIC_FEATURE_BRICKOWL_SYNC=false

# =============================================================================
# DEVELOPMENT CONFIGURATION
# =============================================================================
NODE_ENV=development
NEXT_PUBLIC_DEBUG_MODE=true
LOG_LEVEL=info
```

## Frontend Developer Standards

### Critical Coding Rules

1. **Always Use 'use client' Directive**: Any component using browser APIs must have 'use client' at the top
2. **Never Import Server Components in Client Components**: Keep clear separation
3. **Proper Convex Hook Usage**: Always use Convex hooks inside components, never in utility functions
4. **Type Safety Requirements**: All props, state, and API responses must have explicit TypeScript interfaces
5. **Mobile-First Responsive Design**: Always write mobile styles first, then add breakpoints
6. **Accessibility Compliance**: Every interactive element must have proper ARIA labels
7. **Real-time Subscription Management**: Use Convex useQuery for data fetching
8. **Rate Limiting Respect**: Always use the API client service layer
9. **State Management Separation**: React state for UI, Zustand for business logic, Convex for server state
10. **Camera Integration**: Always check camera permissions before accessing getUserMedia API

### Quick Reference

**Essential Commands:**

```bash
npm run dev              # Start development server
npm run build           # Production build
npm run test            # Run Jest tests
npx convex dev         # Start Convex development
```

**Key Import Patterns:**

```typescript
// Client components
"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";

// UI components
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

**BrickOps-Specific Patterns:**

```typescript
// Status type definitions aligned with backend schema
type InventoryStatus = "available" | "sold" | "reserved";
type OrderStatus = "pending" | "picked" | "shipped" | "completed" | "cancelled";
type PickSessionStatus = "active" | "paused" | "completed";
type TodoStatus = "pending" | "resolved" | "refunded";

// Camera capture hook pattern aligned with backend camera integration flow
const useCameraCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadImage = useMutation(api.files.generateUploadUrl);
  const identifyPart = useMutation(api.identification.identifyPartFromImage);

  const captureAndIdentify = async (businessAccountId: Id<"businessAccounts">) => {
    try {
      setIsCapturing(true);
      setError(null);

      // 1. Capture image from camera (matches backend flow step 1)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // ... camera capture logic

      // 2. Upload to Convex File Storage (matches backend flow step 2)
      const uploadUrl = await uploadImage();
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: imageFile,
      });
      const { storageId } = await response.json();

      // 3. Trigger identification (matches backend flow step 3)
      const result = await identifyPart({
        imageFileId: storageId,
        businessAccountId,
      });

      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
      throw err;
    } finally {
      setIsCapturing(false);
    }
  };

  return { captureAndIdentify, isCapturing, error };
};

// Real-time subscriptions aligned with backend state management
const useInventoryData = (businessAccountId: Id<"businessAccounts">) => {
  const inventory = useQuery(api.inventory.getByBusinessAccount, {
    businessAccountId,
  });
  const orders = useQuery(api.orders.getByBusinessAccount, {
    businessAccountId,
  });
  const pickSessions = useQuery(api.picking.getActiveSessions, {
    businessAccountId,
  });

  return { inventory, orders, pickSessions };
};

// Optimistic updates pattern matching backend mutations
const useInventoryMutations = () => {
  const addItem = useMutation(api.inventory.addInventoryItem);
  const updateQuantities = useMutation(api.inventory.updateQuantities);

  const addItemOptimistic = async (item: AddInventoryItemRequest) => {
    // Optimistic update to UI store
    inventoryStore.getState().addOptimisticItem(item);

    try {
      // Sync to backend (Convex handles conflict resolution)
      const result = await addItem(item);
      return result;
    } catch (error) {
      // Revert optimistic update on failure
      inventoryStore.getState().removeOptimisticItem(item.partNumber);
      throw error;
    }
  };

  return { addItemOptimistic, updateQuantities };
};

// State synchronization pattern for picking workflow
const usePickingWorkflow = (sessionId: Id<"pickSessions">) => {
  // Server state: Real-time pick session data
  const session = useQuery(api.picking.getSession, { sessionId });

  // Client state: UI workflow state
  const [currentStep, setCurrentStep] = useState(0);
  const [showIssueModal, setShowIssueModal] = useState(false);

  // Complex state: Picking progress coordination
  const { markPicked, reportIssue } = usePickingStore();

  return {
    session, // Server state
    currentStep, // UI state
    showIssueModal, // UI state
    markPicked, // Zustand coordinated state
    reportIssue, // Zustand coordinated state
  };
};
```
