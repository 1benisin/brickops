/** Shared domain types available to both frontend and Convex backend. */
export type StoreIdentifier = {
  tenantId: string;
  locationId: string;
};

// NOTE: InventoryItem type has been moved to src/types/inventory.ts
// and is now derived from backend validators for type safety.
// Use: import type { InventoryItem } from "@/types/inventory";
