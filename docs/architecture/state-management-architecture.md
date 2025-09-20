# State Management Architecture

## State Boundaries and Ownership

BrickOps implements a clear state separation strategy across the full stack to ensure optimal performance, consistency, and maintainability:

**Server State (Convex Database + Functions)**

- **Inventory Data**: All inventory items, quantities, locations, audit logs
- **Order Data**: Marketplace orders, pick sessions, todo items
- **Catalog Data**: Lego parts catalog, cached Bricklink data
- **User Authentication**: Business accounts, users, roles, sessions
- **External API State**: Sync status, rate limiting counters, API credentials

**Client State Management Strategy:**

```typescript
// State ownership boundaries for frontend
interface StateArchitecture {
  // SERVER STATE (Convex Real-time Subscriptions)
  serverState: {
    inventory: "useQuery(api.inventory.getByUser)"; // Real-time inventory data
    orders: "useQuery(api.orders.getByBusinessAccount)"; // Live order updates
    catalog: "useQuery(api.catalog.searchParts)"; // Cached catalog data
    pickSessions: "useQuery(api.picking.getActiveSessions)"; // Live picking progress
    users: "useQuery(api.auth.getBusinessAccountUsers)"; // Team member data
  };

  // CLIENT UI STATE (React Built-in: useState, useReducer)
  uiState: {
    modals: "useState<ModalState>"; // Modal visibility
    forms: "useState<FormData>"; // Form input values
    navigation: "useState<ActiveTab>"; // Current page/tab
    camera: "useState<CameraState>"; // Camera capture state
    notifications: "useState<NotificationQueue>"; // Toast notifications
    loading: "useState<LoadingStates>"; // Component loading states
  };

  // COMPLEX CLIENT STATE (Zustand Stores)
  complexClientState: {
    inventorySelection: "useInventoryStore"; // Multi-item selection
    pickingWorkflow: "usePickingStore"; // Pick session progress
    searchFilters: "useSearchStore"; // Complex filter state
    userPreferences: "usePreferencesStore"; // Settings and preferences
    cameraCapture: "useCameraStore"; // Camera workflow state
  };
}
```

**State Synchronization Patterns:**

1. **Real-time Server State Updates**

   ```typescript
   // Convex subscriptions automatically sync server state
   const inventory = useQuery(api.inventory.getByUser, { userId });
   const orders = useQuery(api.orders.getByBusinessAccount, {
     businessAccountId,
   });
   // Updates propagate automatically across all clients
   ```

2. **Optimistic UI Updates**

   ```typescript
   // Client state updates immediately, syncs to server
   const updateInventory = useMutation(api.inventory.updateQuantity);

   // Optimistic update pattern
   const handleQuantityChange = async (id: string, quantity: number) => {
     // Update local state immediately
     setOptimisticQuantity(quantity);

     // Sync to server (Convex handles rollback if fails)
     await updateInventory({ id, quantity });
   };
   ```

3. **Complex State Coordination**

   ```typescript
   // Zustand store coordinates between multiple UI states
   const usePickingStore = create<PickingState>((set, get) => ({
     currentPart: null,
     pickedItems: [],
     issues: [],

     // Coordinates with server state and UI state
     markPartPicked: async (partId: string) => {
       // Update local picking state
       set((state) => ({
         ...state,
         pickedItems: [...state.pickedItems, partId],
       }));

       // Trigger server mutation
       await markPartPickedMutation({ partId });

       // Update UI state for feedback
       showSuccessNotification("Part marked as picked");
     },
   }));
   ```

**Critical State Management Rules:**

1. **Server State Authority**: Convex database is always the source of truth for business data
2. **Real-time Sync**: All business data changes use Convex subscriptions for instant updates
3. **UI State Isolation**: Component UI state stays local unless it needs to persist or sync
4. **Complex State Centralization**: Multi-component shared state uses Zustand stores
5. **Optimistic Updates**: UI responds immediately, server confirms or corrects
6. **Error State Handling**: Server state errors propagate to UI through Convex error boundaries
