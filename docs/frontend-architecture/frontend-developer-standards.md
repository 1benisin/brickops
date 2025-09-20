# Frontend Developer Standards

## Critical Coding Rules

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

## Quick Reference

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

  const captureAndIdentify = async (
    businessAccountId: Id<"businessAccounts">
  ) => {
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
