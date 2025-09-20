# State Management

BrickOps uses a **hybrid state architecture** that aligns with the backend state boundaries defined in the main architecture document. This ensures optimal performance, consistency, and maintainability across the full stack.

## State Architecture Alignment

**Following Backend State Boundaries:**

- **Server State**: Managed by Convex with real-time subscriptions
- **Client UI State**: React built-in state management (useState, useReducer)
- **Complex Client State**: Zustand for cross-component shared state

This alignment ensures clear separation of concerns and optimal data flow patterns.

## Store Structure

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

## State Management Template

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
  changeType:
    | "created"
    | "quantity_updated"
    | "location_changed"
    | "status_changed"
    | "deleted";
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
        }
      )
    )
  )
);
```
