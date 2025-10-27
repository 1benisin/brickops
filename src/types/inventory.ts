/**
 * Inventory Type Definitions
 *
 * IMPORTANT FOR FUTURE DEVELOPERS:
 * ================================
 * Do NOT manually define types that match backend return values!
 *
 * Instead, use the Infer utility from convex/values to extract types directly
 * from the validated backend function returns. This ensures:
 * 1. Single source of truth (backend validators define the contract)
 * 2. Type safety guaranteed at runtime (not just compile time)
 * 3. No drift between frontend types and backend returns
 * 4. Automatic updates when backend changes
 *
 * Example:
 *   import type { Infer } from "convex/values";
 *   import type { listInventoryItemsReturns } from "@/convex/inventory/validators";
 *
 *   // ✅ GOOD: Type derived from backend validator
 *   type InventoryItem = Infer<typeof listInventoryItemsReturns>[0];
 *
 *   // ❌ BAD: Manually defined type that can drift
 *   type InventoryItem = { name: string, partNumber: string, ... };
 *
 * See convex/inventory/validators.ts for the source validators.
 */

import type { Infer } from "convex/values";
import type {
  listInventoryItemsReturns,
  syncStatus,
  addInventoryItemArgs,
  updateInventoryItemArgs,
  itemCondition,
  marketplaceProvider,
} from "@/convex/inventory/validators";

// ============================================================================
// TYPES DERIVED FROM BACKEND VALIDATORS (Single Source of Truth)
// ============================================================================

// Core inventory item type (from listInventoryItemsReturns validator)
export type InventoryItem = Infer<typeof listInventoryItemsReturns>[0];

// Sync status type (from syncStatus validator)
export type SyncStatus = Infer<typeof syncStatus> | undefined;

// Form data types derived from backend validators
export type AddInventoryFormData = Infer<typeof addInventoryItemArgs>;
export type UpdateInventoryFormData = Infer<typeof updateInventoryItemArgs>;

// Item condition type derived from backend
export type ItemCondition = Infer<typeof itemCondition>; // "new" | "used"

// Marketplace provider type derived from backend
export type MarketplaceProvider = Infer<typeof marketplaceProvider>; // "bricklink" | "brickowl"

// ============================================================================
// COMPONENT-SPECIFIC TYPES
// ============================================================================

// Marketplace sync types derived from inventory item
export type MarketplaceSync = NonNullable<InventoryItem["marketplaceSync"]>;
export type BricklinkSync = NonNullable<MarketplaceSync["bricklink"]>;
export type BrickowlSync = NonNullable<MarketplaceSync["brickowl"]>;

// SyncStatusIndicator component props
export interface SyncStatusIndicatorProps {
  item: InventoryItem;
  marketplace: MarketplaceProvider;
  syncEnabled?: boolean;
}

// Helper type for marketplace sync data
export type MarketplaceSyncData = {
  bricklink?: BricklinkSync;
  brickowl?: BrickowlSync;
};
