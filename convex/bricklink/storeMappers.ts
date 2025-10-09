/**
 * Data mappers for BrickLink Store <-> Convex schema transformations
 * Handles inventory data (Story 3.2) and orders (Epic 4 future)
 */

import type { Id } from "../_generated/dataModel";
import type {
  BricklinkInventoryResponse,
  BricklinkInventoryCreateRequest,
  BricklinkInventoryUpdateRequest,
} from "./storeClient";

/**
 * Convex InventoryItem type (subset needed for mapping)
 */
export interface ConvexInventoryItem {
  _id?: Id<"inventoryItems">;
  businessAccountId: Id<"businessAccounts">;
  sku: string;
  name: string;
  partNumber: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  status: "available" | "reserved" | "sold";
  condition: "new" | "used";
  price?: number;
  notes?: string;
  bricklinkInventoryId?: number;
  createdBy: Id<"users">;
  createdAt: number;
  updatedAt?: number;
  isArchived?: boolean;
  deletedAt?: number;
}

/**
 * Map BrickLink inventory response to Convex inventory item
 * Used when importing inventory from BrickLink to Convex
 */
export function mapBricklinkToConvexInventory(
  bricklinkInventory: BricklinkInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
): Omit<ConvexInventoryItem, "_id" | "createdBy" | "createdAt" | "updatedAt"> {
  // Map condition: "N" -> "new", "U" -> "used"
  const condition: "new" | "used" = bricklinkInventory.new_or_used === "N" ? "new" : "used";

  // Map location from stock room
  let location = "Main"; // Default location
  if (bricklinkInventory.is_stock_room && bricklinkInventory.stock_room_id) {
    location = `Stockroom ${bricklinkInventory.stock_room_id}`;
  }

  // Generate SKU from part number + color + condition
  const sku = `${bricklinkInventory.item.no}-${bricklinkInventory.color_id}-${condition}`;

  // Parse price from fixed-point string to number
  const price = bricklinkInventory.unit_price
    ? parseFloat(bricklinkInventory.unit_price)
    : undefined;

  // Combine description and remarks into notes
  const notes =
    [bricklinkInventory.description, bricklinkInventory.remarks]
      .filter(Boolean)
      .join(" | ")
      .trim() || undefined;

  return {
    businessAccountId,
    sku,
    name: bricklinkInventory.item.name,
    partNumber: bricklinkInventory.item.no,
    colorId: bricklinkInventory.color_id.toString(), // Convert number to string
    location,
    quantityAvailable: bricklinkInventory.quantity,
    quantityReserved: 0, // BrickLink doesn't track reserved separately
    quantitySold: 0, // BrickLink doesn't track sold separately
    status: "available", // Default status for imported inventory
    condition,
    price,
    notes,
    bricklinkInventoryId: bricklinkInventory.inventory_id,
  };
}

/**
 * Map Convex inventory item to BrickLink create request payload
 * Used when creating new inventory on BrickLink from Convex data
 */
export function mapConvexToBricklinkCreate(
  convexInventory: ConvexInventoryItem,
): BricklinkInventoryCreateRequest {
  // Map condition: "new" -> "N", "used" -> "U"
  const new_or_used: "N" | "U" = convexInventory.condition === "new" ? "N" : "U";

  // Parse stock room from location
  let is_stock_room = false;
  let stock_room_id: "A" | "B" | "C" | undefined;
  if (convexInventory.location.startsWith("Stockroom ")) {
    is_stock_room = true;
    const roomLetter = convexInventory.location.replace("Stockroom ", "");
    if (roomLetter === "A" || roomLetter === "B" || roomLetter === "C") {
      stock_room_id = roomLetter;
    }
  }

  // Format price as fixed-point string
  const unit_price = convexInventory.price?.toFixed(4) ?? "0.0000";

  // Parse notes into description (keep it simple - use notes as description)
  const description = convexInventory.notes || "";

  // Validate required fields
  if (!convexInventory.partNumber) {
    throw new Error("partNumber is required for BrickLink inventory creation");
  }

  return {
    item: {
      no: convexInventory.partNumber,
      type: "PART", // Default to PART - could be enhanced to track item type
    },
    color_id: parseInt(convexInventory.colorId, 10),
    quantity: convexInventory.quantityAvailable,
    unit_price,
    new_or_used,
    description,
    remarks: "", // Could enhance to split notes into description/remarks
    bulk: 1, // Default bulk amount
    is_retain: false, // Default: don't retain after sold out
    is_stock_room,
    stock_room_id,
  };
}

/**
 * Map Convex inventory item to BrickLink update request payload
 * Used when updating existing inventory on BrickLink
 *
 * CRITICAL: This creates a delta update with proper +/- quantity syntax
 *
 * @param convexInventory - Current state of Convex inventory
 * @param previousQuantity - Previous quantity to calculate delta (undefined for non-quantity updates)
 */
export function mapConvexToBricklinkUpdate(
  convexInventory: ConvexInventoryItem,
  previousQuantity?: number,
): BricklinkInventoryUpdateRequest {
  // Parse stock room from location
  let is_stock_room = false;
  let stock_room_id: "A" | "B" | "C" | undefined;
  if (convexInventory.location.startsWith("Stockroom ")) {
    is_stock_room = true;
    const roomLetter = convexInventory.location.replace("Stockroom ", "");
    if (roomLetter === "A" || roomLetter === "B" || roomLetter === "C") {
      stock_room_id = roomLetter;
    }
  }

  // Format price as fixed-point string
  const unit_price = convexInventory.price?.toFixed(4);

  // Calculate quantity delta if previous quantity provided
  let quantity: string | undefined;
  if (previousQuantity !== undefined) {
    const delta = convexInventory.quantityAvailable - previousQuantity;
    if (delta !== 0) {
      quantity = delta > 0 ? `+${delta}` : `${delta}`; // Prefix with + or - (minus already included)
    }
  }

  // Parse notes into description
  const description = convexInventory.notes;

  return {
    quantity,
    unit_price,
    description,
    remarks: "", // Could enhance to split notes
    bulk: 1,
    is_retain: false,
    is_stock_room,
    stock_room_id,
  };
}

/**
 * Calculate quantity delta for BrickLink update
 * Helper function to generate proper +/- quantity string
 */
export function calculateQuantityDelta(currentQuantity: number, previousQuantity: number): string {
  const delta = currentQuantity - previousQuantity;
  if (delta === 0) {
    throw new Error("No quantity change - delta is 0");
  }
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * Validate BrickLink inventory fields before creation
 * Throws error if required fields are missing or invalid
 */
export function validateBricklinkCreate(payload: BricklinkInventoryCreateRequest): void {
  if (!payload.item.no) {
    throw new Error("item.no (part number) is required");
  }
  if (!payload.item.type) {
    throw new Error("item.type is required");
  }
  if (payload.color_id === undefined || payload.color_id === null) {
    throw new Error("color_id is required");
  }
  if (payload.quantity === undefined || payload.quantity === null || payload.quantity < 0) {
    throw new Error("quantity must be a non-negative number");
  }
  if (!payload.unit_price) {
    throw new Error("unit_price is required");
  }
  if (!payload.new_or_used || (payload.new_or_used !== "N" && payload.new_or_used !== "U")) {
    throw new Error('new_or_used must be "N" or "U"');
  }
  // Validate completeness only for SET type
  if (payload.item.type === "SET" && payload.completeness) {
    if (
      payload.completeness !== "C" &&
      payload.completeness !== "B" &&
      payload.completeness !== "S"
    ) {
      throw new Error('completeness must be "C", "B", or "S" for SET items');
    }
  }
}

/**
 * Validate BrickLink inventory update fields
 * Throws error if fields are invalid
 */
export function validateBricklinkUpdate(payload: BricklinkInventoryUpdateRequest): void {
  // Validate quantity delta syntax if provided
  if (payload.quantity !== undefined && !/^[+-]\d+$/.test(payload.quantity)) {
    throw new Error('quantity must use delta syntax with +/- prefix (e.g., "+5" or "-3")');
  }
  // Validate price format if provided
  if (payload.unit_price !== undefined && isNaN(parseFloat(payload.unit_price))) {
    throw new Error("unit_price must be a valid fixed-point number string");
  }
}
