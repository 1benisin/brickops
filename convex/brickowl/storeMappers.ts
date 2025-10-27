/**
 * Data mappers for BrickOwl Store <-> Convex schema transformations
 * Handles inventory data (Story 3.3) and orders (Epic 4 future)
 */

import type { Doc } from "../_generated/dataModel";
import type {
  BrickOwlInventoryResponse,
  CreateInventoryPayload,
  UpdateInventoryPayload,
} from "./storeClient";

/**
 * Map BrickOwl inventory response to Convex inventory item
 * Used when importing inventory from BrickOwl to Convex
 */
export function mapBrickOwlToConvexInventory(
  brickowlInventory: BrickOwlInventoryResponse,
  businessAccountId: Doc<"inventoryItems">["businessAccountId"],
): Omit<Doc<"inventoryItems">, "_id" | "_creationTime" | "createdBy" | "createdAt" | "updatedAt"> {
  // Map condition: BrickOwl's detailed codes to our simplified "new"/"used"
  // "new", "news", "newc", "newi" -> "new"
  // "usedc", "usedi", "usedn", "usedg", "useda", "other" -> "used"
  const condition: "new" | "used" = brickowlInventory.condition.startsWith("new") ? "new" : "used";

  // Map location from personal_note field (private internal location)
  const location = brickowlInventory.personal_note || "Main"; // Default to "Main" if no personal_note

  // Price is already a number in BrickOwl (unlike BrickLink's string)
  const price = brickowlInventory.price;

  // Map public_note to notes (public-facing description)
  const notes = brickowlInventory.public_note || undefined;

  // Name: BrickOwl doesn't provide name in inventory response
  // We'll need to look up from parts catalog or use boid as placeholder
  const name = `Part ${brickowlInventory.boid}`;

  return {
    businessAccountId,
    name, // Will be enriched from catalog lookup
    partNumber: brickowlInventory.boid,
    colorId: brickowlInventory.color_id?.toString() ?? "0", // Convert number to string
    location,
    quantityAvailable: brickowlInventory.quantity,
    quantityReserved: 0, // BrickOwl doesn't track reserved separately
    condition,
    price,
    notes,
  };
}

/**
 * Map Convex inventory item to BrickOwl create request payload
 * Used when creating new inventory on BrickOwl from Convex data
 */
export function mapConvexToBrickOwlCreate(
  convexInventory: Doc<"inventoryItems">,
): CreateInventoryPayload {
  // Map condition: "new" -> "new", "used" -> "usedc" (most common used condition)
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedc" as const);

  // Price is already a number (BrickOwl expects number, not string like BrickLink)
  const price = convexInventory.price ?? 0;

  // Map location to personal_note (private internal location)
  const personal_note = convexInventory.location || undefined;

  // Map notes to public_note (public-facing description visible to customers)
  const public_note = convexInventory.notes || undefined;

  // Validate required fields
  if (!convexInventory.partNumber) {
    throw new Error("partNumber is required for BrickOwl inventory creation");
  }

  return {
    boid: convexInventory.partNumber,
    color_id: convexInventory.colorId ? parseInt(convexInventory.colorId, 10) : undefined,
    quantity: convexInventory.quantityAvailable,
    price,
    condition,
    external_id: convexInventory._id, // Use Convex ID as external reference (unique per lot)
    personal_note, // Maps to our location field
    public_note, // Maps to our notes field
  };
}

/**
 * Map Convex inventory item to BrickOwl update request payload
 * Used when updating existing inventory on BrickOwl
 *
 * CRITICAL: BrickOwl supports two quantity update modes:
 * - absolute_quantity: Set exact quantity (e.g., 10)
 * - relative_quantity: Adjust by delta (e.g., +5 or -5)
 *
 * @param convexInventory - Current state of Convex inventory
 * @param previousQuantity - Previous quantity to calculate delta (undefined for non-quantity updates)
 * @param useAbsolute - If true, use absolute_quantity; if false, calculate relative_quantity
 */
export function mapConvexToBrickOwlUpdate(
  convexInventory: Doc<"inventoryItems">,
  previousQuantity?: number,
  useAbsolute: boolean = false,
): UpdateInventoryPayload {
  // Price is a number (not string like BrickLink)
  const price = convexInventory.price;

  // Calculate quantity update based on mode
  let absolute_quantity: number | undefined;
  let relative_quantity: number | undefined;

  if (previousQuantity !== undefined) {
    const delta = convexInventory.quantityAvailable - previousQuantity;
    if (delta !== 0) {
      if (useAbsolute) {
        absolute_quantity = convexInventory.quantityAvailable;
      } else {
        relative_quantity = delta; // Can be positive or negative
      }
    }
  }

  // Map location to personal_note (private internal location)
  const personal_note = convexInventory.location || undefined;

  // Map notes to public_note (public-facing description visible to customers)
  const public_note = convexInventory.notes || undefined;

  // Map for_sale based on availability (default to available)
  const for_sale = 1 as const;

  // Map condition back to BrickOwl format
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedc" as const);

  return {
    absolute_quantity,
    relative_quantity,
    for_sale,
    price,
    personal_note, // Maps to our location field
    public_note, // Maps to our notes field
    condition,
  };
}

/**
 * Calculate quantity delta for relative update
 * Helper function to validate quantity change
 */
export function calculateQuantityDelta(currentQuantity: number, previousQuantity: number): number {
  const delta = currentQuantity - previousQuantity;
  if (delta === 0) {
    throw new Error("No quantity change - delta is 0");
  }
  return delta;
}

/**
 * Map BrickOwl condition codes to simplified Convex condition
 */
export function mapBrickOwlConditionToConvex(brickowlCondition: string): "new" | "used" {
  // "new", "news", "newc", "newi" -> "new"
  // "usedc", "usedi", "usedn", "usedg", "useda", "other" -> "used"
  return brickowlCondition.startsWith("new") ? "new" : "used";
}

/**
 * Map Convex condition to BrickOwl condition code
 * Uses most common codes: "new" for new, "usedc" (complete) for used
 */
export function mapConvexConditionToBrickOwl(convexCondition: "new" | "used"): "new" | "usedc" {
  return convexCondition === "new" ? "new" : "usedc";
}

/**
 * Validate BrickOwl inventory create payload
 * Throws error if required fields are missing or invalid
 */
export function validateBrickOwlCreate(payload: CreateInventoryPayload): void {
  if (!payload.boid) {
    throw new Error("boid (part number) is required");
  }
  if (payload.quantity === undefined || payload.quantity === null || payload.quantity < 1) {
    throw new Error("quantity must be a positive number");
  }
  if (payload.price === undefined || payload.price === null || payload.price < 0) {
    throw new Error("price must be a non-negative number");
  }
  if (!payload.condition) {
    throw new Error("condition is required");
  }
  // Validate condition enum
  const validConditions = [
    "new",
    "news",
    "newc",
    "newi",
    "usedc",
    "usedi",
    "usedn",
    "usedg",
    "useda",
    "other",
  ];
  if (!validConditions.includes(payload.condition)) {
    throw new Error(`condition must be one of: ${validConditions.join(", ")}`);
  }
}

/**
 * Validate BrickOwl inventory update payload
 * Throws error if fields are invalid
 */
export function validateBrickOwlUpdate(payload: UpdateInventoryPayload): void {
  // Validate that both quantity modes are not used simultaneously
  if (payload.absolute_quantity !== undefined && payload.relative_quantity !== undefined) {
    throw new Error("Cannot use both absolute_quantity and relative_quantity");
  }
  // Validate price if provided
  if (payload.price !== undefined && (isNaN(payload.price) || payload.price < 0)) {
    throw new Error("price must be a non-negative number");
  }
  // Validate for_sale flag
  if (payload.for_sale !== undefined && payload.for_sale !== 0 && payload.for_sale !== 1) {
    throw new Error("for_sale must be 0 or 1");
  }
  // Validate condition if provided
  if (payload.condition) {
    const validConditions = [
      "new",
      "news",
      "newc",
      "newi",
      "usedc",
      "usedi",
      "usedn",
      "usedg",
      "useda",
      "other",
    ];
    if (!validConditions.includes(payload.condition)) {
      throw new Error(`condition must be one of: ${validConditions.join(", ")}`);
    }
  }
}

/**
 * Build external_id from Convex inventory for BrickOwl sync
 * This enables BrickOwl to reference our Convex ID for future lookups
 */
export function buildExternalId(convexInventory: Doc<"inventoryItems">): string {
  return convexInventory._id;
}

/**
 * Parse BrickOwl tier pricing string
 * Format: "qty:price,qty:price" (e.g., "100:0.05,200:0.04")
 * Returns array of [quantity, price] tuples
 */
export function parseTierPricing(tierPriceString?: string): Array<[number, number]> {
  if (!tierPriceString) return [];

  return tierPriceString.split(",").map((tier) => {
    const [qty, price] = tier.split(":");
    return [parseInt(qty, 10), parseFloat(price)];
  });
}

/**
 * Format tier pricing for BrickOwl
 * Converts array of [quantity, price] tuples to BrickOwl format
 * Maximum 3 tier prices allowed
 */
export function formatTierPricing(tiers: Array<[number, number]>): string {
  if (tiers.length === 0) return "";
  if (tiers.length > 3) {
    throw new Error("Maximum 3 tier prices allowed");
  }

  return tiers.map(([qty, price]) => `${qty}:${price.toFixed(3)}`).join(",");
}
