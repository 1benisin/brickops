/**
 * Data mappers for BrickOwl Store <-> Convex schema transformations
 * Handles inventory data (Story 3.3) and orders (Epic 4 future)
 */

import type { Doc } from "../../_generated/dataModel";
import type {
  BOInventoryResponse,
  BOInventoryCreatePayload,
  BOInventoryUpdatePayload,
} from "./schema";

function parseNumberLike(value: number | string | undefined | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function resolveBrickOwlQuantity(record: BOInventoryResponse): number {
  const quantity = parseNumberLike(record.quantity ?? record.qty);
  return quantity ?? 0;
}

export function resolveBrickOwlPrice(record: BOInventoryResponse): number | undefined {
  return (
    parseNumberLike(record.price) ??
    parseNumberLike(record.final_price) ??
    parseNumberLike(record.base_price) ??
    parseNumberLike(record.my_cost)
  );
}

export function resolveBrickOwlColorId(record: BOInventoryResponse): string {
  const color = record.color_id;
  if (color === undefined || color === null) {
    return "0";
  }
  return typeof color === "string" ? color : String(color);
}

export function resolveBrickOwlConditionCode(record: BOInventoryResponse): string {
  if (typeof record.condition === "string" && record.condition.length > 0) {
    return record.condition;
  }
  if (typeof record.full_con === "string" && record.full_con.length > 0) {
    return record.full_con;
  }
  return "used";
}

/**
 * Map BrickOwl inventory response to Convex inventory item
 * Used when importing inventory from BrickOwl to Convex
 */
export function mapBrickOwlToConvexInventory(
  brickowlInventory: BOInventoryResponse,
  businessAccountId: Doc<"inventoryItems">["businessAccountId"],
): Omit<Doc<"inventoryItems">, "_id" | "_creationTime" | "createdBy" | "createdAt" | "updatedAt"> {
  const conditionCode = resolveBrickOwlConditionCode(brickowlInventory);
  const condition = mapBrickOwlConditionToConvex(conditionCode);

  const location = (brickowlInventory.personal_note ?? "").trim();
  const price = resolveBrickOwlPrice(brickowlInventory);
  const notes = brickowlInventory.public_note ?? undefined;
  const quantityAvailable = resolveBrickOwlQuantity(brickowlInventory);

  const rawBoid = brickowlInventory.boid?.trim() ?? "";
  const boidSegments = rawBoid.split("-").filter((segment) => segment.length > 0);
  const boidPartNumber = boidSegments[0] ?? rawBoid;
  const boidColorSuffix =
    boidSegments.length > 1 ? boidSegments[boidSegments.length - 1] : undefined;

  let colorId = resolveBrickOwlColorId(brickowlInventory)?.trim();
  if ((!colorId || colorId === "0") && boidColorSuffix) {
    const normalizedSuffix = boidColorSuffix.trim();
    if (/^\d+$/.test(normalizedSuffix)) {
      colorId = normalizedSuffix;
    }
  }
  const resolvedColorId = colorId && colorId.length > 0 ? colorId : "0";

  const name = rawBoid ? `Part ${rawBoid}` : "Unknown BrickOwl Part";

  return {
    businessAccountId,
    name, // Will be enriched from catalog lookup
    partNumber: boidPartNumber,
    colorId: resolvedColorId,
    location,
    quantityAvailable,
    quantityReserved: 0, // BrickOwl doesn't track reserved separately
    condition,
    price: price ?? 0,
    notes,
  };
}

/**
 * Map Convex inventory item to BrickOwl create request payload
 * Used when creating new inventory on BrickOwl from Convex data
 */
export function mapConvexToBrickOwlCreate(
  convexInventory: Doc<"inventoryItems">,
  brickowlId: string,
  brickowlColorId?: number,
): BOInventoryCreatePayload {
  // Map condition: "new" -> "new", "used" -> "usedn" (Used Like New - matches our inventory model)
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedn" as const);

  // Price is already a number (BrickOwl expects number, not string like BrickLink)
  const price = convexInventory.price ?? 0;

  // Map location to personal_note (private internal location)
  const personal_note = convexInventory.location || undefined;

  // Map notes to public_note (public-facing description visible to customers)
  const public_note = convexInventory.notes || undefined;

  return {
    boid: brickowlId,
    ...(brickowlColorId !== undefined ? { color_id: brickowlColorId } : {}),
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
): BOInventoryUpdatePayload {
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
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedn" as const);

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
 * Uses: "new" for new, "usedn" (Used Like New) for used - matches our inventory model
 */
export function mapConvexConditionToBrickOwl(convexCondition: "new" | "used"): "new" | "usedn" {
  return convexCondition === "new" ? "new" : "usedn";
}

/**
 * Validate BrickOwl inventory create payload
 * Throws error if required fields are missing or invalid
 */
export function validateBrickOwlCreate(payload: BOInventoryCreatePayload): void {
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
export function validateBrickOwlUpdate(payload: BOInventoryUpdatePayload): void {
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
