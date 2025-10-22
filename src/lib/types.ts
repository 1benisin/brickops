/** Shared domain types available to both frontend and Convex backend. */
export type StoreIdentifier = {
  tenantId: string;
  locationId: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  quantityOnHand: number;
  reorderPoint: number;
};
