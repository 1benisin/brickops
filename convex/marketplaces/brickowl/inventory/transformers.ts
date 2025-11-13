import type { Id } from "@/convex/_generated/dataModel";
import type {
  BOInventoryCreatePayload,
  BOInventoryResponse,
  BOInventoryUpdatePayload,
} from "./schema";
import { boConditionSchema } from "../validators";

type InventoryItemDoc = {
  _id: string;
  businessAccountId: Id<"businessAccounts">;
  quantityAvailable: number;
  quantityReserved?: number;
  condition: "new" | "used";
  price?: number | null;
  location?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

type InventorySnapshot = {
  businessAccountId: Id<"businessAccounts">;
  name: string;
  partNumber: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  quantityReserved: number;
  condition: "new" | "used";
  price: number;
  notes?: string;
};

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
  const candidates: Array<number | string | null | undefined> = [record.quantity, record.qty];
  for (const value of candidates) {
    const parsed = parseNumberLike(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return 0;
}

export function resolveBrickOwlPrice(record: BOInventoryResponse): number | undefined {
  const candidates: Array<number | string | null | undefined> = [
    record.price,
    record.final_price,
    record.base_price,
    record.my_cost,
  ];
  for (const value of candidates) {
    const parsed = parseNumberLike(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
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

export function mapBrickOwlToConvexInventory(
  brickowlInventory: BOInventoryResponse,
  businessAccountId: Id<"businessAccounts">,
): InventorySnapshot {
  const conditionCode = resolveBrickOwlConditionCode(brickowlInventory);
  const condition = mapBrickOwlConditionToConvex(conditionCode);

  const location =
    typeof brickowlInventory.personal_note === "string"
      ? brickowlInventory.personal_note.trim()
      : "";
  const price = resolveBrickOwlPrice(brickowlInventory);
  const notes =
    typeof brickowlInventory.public_note === "string" ? brickowlInventory.public_note : undefined;
  const quantityAvailable = resolveBrickOwlQuantity(brickowlInventory);

  const rawBoid = typeof brickowlInventory.boid === "string" ? brickowlInventory.boid.trim() : "";
  const boidSegments = rawBoid.split("-").filter((segment: string) => segment.length > 0);
  const boidPartNumber = boidSegments[0] ?? rawBoid;
  const colorId = resolveBrickOwlColorId(brickowlInventory).trim();
  const resolvedColorId = colorId && colorId.length > 0 ? colorId : "0";

  const name = rawBoid ? `Part ${rawBoid}` : "Unknown BrickOwl Part";

  return {
    businessAccountId,
    name,
    partNumber: boidPartNumber,
    colorId: resolvedColorId,
    location,
    quantityAvailable,
    quantityReserved: 0,
    condition,
    price: price ?? 0,
    notes,
  };
}

export function mapConvexToBrickOwlCreate(
  convexInventory: InventoryItemDoc,
  brickowlId: string,
  brickowlColorId?: number,
): BOInventoryCreatePayload {
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedn" as const);
  const price = convexInventory.price ?? 0;
  const personal_note =
    typeof convexInventory.location === "string" && convexInventory.location.length > 0
      ? convexInventory.location
      : undefined;
  const public_note =
    typeof convexInventory.notes === "string" && convexInventory.notes.length > 0
      ? convexInventory.notes
      : undefined;

  return {
    boid: brickowlId,
    ...(brickowlColorId !== undefined ? { color_id: brickowlColorId } : {}),
    quantity: convexInventory.quantityAvailable,
    price,
    condition,
    external_id: convexInventory._id,
    personal_note,
    public_note,
  };
}

export function mapConvexToBrickOwlUpdate(
  convexInventory: InventoryItemDoc,
  previousQuantity?: number,
  useAbsolute: boolean = false,
): BOInventoryUpdatePayload {
  const price = convexInventory.price ?? undefined;

  let absolute_quantity: number | undefined;
  let relative_quantity: number | undefined;

  if (previousQuantity !== undefined) {
    const delta = convexInventory.quantityAvailable - previousQuantity;
    if (delta !== 0) {
      if (useAbsolute) {
        absolute_quantity = convexInventory.quantityAvailable;
      } else {
        relative_quantity = delta;
      }
    }
  }

  const personal_note =
    typeof convexInventory.location === "string" && convexInventory.location.length > 0
      ? convexInventory.location
      : undefined;
  const public_note =
    typeof convexInventory.notes === "string" && convexInventory.notes.length > 0
      ? convexInventory.notes
      : undefined;
  const condition = convexInventory.condition === "new" ? ("new" as const) : ("usedn" as const);

  return {
    absolute_quantity,
    relative_quantity,
    for_sale: 1,
    price,
    personal_note,
    public_note,
    condition,
  };
}

export function calculateQuantityDelta(currentQuantity: number, previousQuantity: number): number {
  const delta = currentQuantity - previousQuantity;
  if (delta === 0) {
    throw new Error("No quantity change - delta is 0");
  }
  return delta;
}

export function mapBrickOwlConditionToConvex(brickowlCondition: string): "new" | "used" {
  return brickowlCondition.startsWith("new") ? "new" : "used";
}

export function mapConvexConditionToBrickOwl(convexCondition: "new" | "used"): "new" | "usedn" {
  return convexCondition === "new" ? "new" : "usedn";
}

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
  if (!boConditionSchema.options.includes(payload.condition)) {
    throw new Error(`condition must be one of: ${boConditionSchema.options.join(", ")}`);
  }
}

export function validateBrickOwlUpdate(payload: BOInventoryUpdatePayload): void {
  if (payload.absolute_quantity !== undefined && payload.relative_quantity !== undefined) {
    throw new Error("Cannot use both absolute_quantity and relative_quantity");
  }
  if (
    payload.price !== undefined &&
    payload.price !== null &&
    (Number.isNaN(payload.price) || payload.price < 0)
  ) {
    throw new Error("price must be a non-negative number");
  }
  if (payload.for_sale !== undefined && payload.for_sale !== 0 && payload.for_sale !== 1) {
    throw new Error("for_sale must be 0 or 1");
  }
  if (payload.condition && !boConditionSchema.options.includes(payload.condition as never)) {
    throw new Error(`condition must be one of: ${boConditionSchema.options.join(", ")}`);
  }
}

export function buildExternalId(convexInventory: InventoryItemDoc): string {
  return convexInventory._id;
}

export function parseTierPricing(tierPriceString?: string): Array<[number, number]> {
  if (!tierPriceString) return [];

  return tierPriceString.split(",").map((tier) => {
    const [qty, price] = tier.split(":");
    return [parseInt(qty, 10), parseFloat(price)];
  });
}

export function formatTierPricing(tiers: Array<[number, number]>): string {
  if (tiers.length === 0) return "";
  if (tiers.length > 3) {
    throw new Error("Maximum 3 tier prices allowed");
  }

  return tiers.map(([qty, price]) => `${qty}:${price.toFixed(3)}`).join(",");
}
