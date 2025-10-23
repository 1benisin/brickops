/**
 * Data mappers for BrickLink Store <-> Convex schema transformations
 * Handles inventory data (Story 3.2) and orders (Epic 4 future)
 */

import type { Doc } from "../_generated/dataModel";
import type {
  BricklinkInventoryResponse,
  BricklinkInventoryCreateRequest,
  BricklinkInventoryUpdateRequest,
} from "./storeClient";

/**
 * Map BrickLink inventory response to Convex inventory item
 * Used when importing inventory from BrickLink to Convex
 */
export function mapBricklinkToConvexInventory(
  bricklinkInventory: BricklinkInventoryResponse,
  businessAccountId: Doc<"inventoryItems">["businessAccountId"],
): Omit<Doc<"inventoryItems">, "_id" | "_creationTime" | "createdBy" | "createdAt" | "updatedAt"> {
  // Map condition: "N" -> "new", "U" -> "used"
  const condition: "new" | "used" = bricklinkInventory.new_or_used === "N" ? "new" : "used";

  // Map location from remarks field
  const location = bricklinkInventory.remarks || "Main"; // Default to "Main" if no remarks

  // Parse price from fixed-point string to number
  const price = bricklinkInventory.unit_price
    ? parseFloat(bricklinkInventory.unit_price)
    : undefined;

  // Map description to notes (public-facing description)
  const notes = bricklinkInventory.description || undefined;

  return {
    businessAccountId,
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
    bricklinkLotId: bricklinkInventory.inventory_id,
  };
}

/**
 * Map Convex inventory item to BrickLink create request payload
 * Used when creating new inventory on BrickLink from Convex data
 */
export function mapConvexToBricklinkCreate(
  convexInventory: Doc<"inventoryItems">,
): BricklinkInventoryCreateRequest {
  // Map condition: "new" -> "N", "used" -> "U"
  const new_or_used: "N" | "U" = convexInventory.condition === "new" ? "N" : "U";

  // Format price as fixed-point string
  const unit_price = convexInventory.price?.toFixed(4) ?? "0.0000";

  // Map notes to description (public-facing description)
  const description = convexInventory.notes || "";

  // Map location to remarks (private internal location)
  const remarks = convexInventory.location || "";

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
    remarks, // Maps to our location field
    bulk: 1, // Default bulk amount
    is_retain: false, // Default: don't retain after sold out
    is_stock_room: false, // Not using stock room feature
    stock_room_id: undefined,
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
  convexInventory: Doc<"inventoryItems">,
  previousQuantity?: number,
): BricklinkInventoryUpdateRequest {
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

  // Map notes to description (public-facing description)
  const description = convexInventory.notes;

  // Map location to remarks (private internal location)
  const remarks = convexInventory.location;

  return {
    quantity,
    unit_price,
    description,
    remarks, // Maps to our location field
    bulk: 1,
    is_retain: false,
    is_stock_room: false, // Not using stock room feature
    stock_room_id: undefined,
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
