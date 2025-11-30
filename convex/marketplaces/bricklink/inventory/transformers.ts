import type {
  BLInventoryCreatePayload,
  BLInventoryResponse,
  BLInventoryUpdatePayload,
} from "./schema";
import type { InventoryItemDoc } from "./schema";
import type { AddInventoryItemArgs } from "../../../inventory/validators";

/**
 * Map a BrickLink inventory response into the Convex inventory shape.
 * Accepts both full and partial responses (from list endpoints).
 */
export function mapBlToConvexInventory(
  bricklinkInventory: BLInventoryResponse | Partial<BLInventoryResponse>,
): AddInventoryItemArgs {
  // Validate required fields
  if (!bricklinkInventory.item?.no) {
    throw new Error("BrickLink inventory missing required item.no field");
  }
  if (bricklinkInventory.color_id === undefined) {
    throw new Error("BrickLink inventory missing required color_id field");
  }
  if (bricklinkInventory.quantity === undefined) {
    throw new Error("BrickLink inventory missing required quantity field");
  }
  if (!bricklinkInventory.new_or_used) {
    throw new Error("BrickLink inventory missing required new_or_used field");
  }

  return {
    name: bricklinkInventory.item.name ?? bricklinkInventory.item.no,
    partNumber: bricklinkInventory.item.no,
    colorId: bricklinkInventory.color_id.toString(),
    location: bricklinkInventory.remarks || "Main",
    quantityAvailable: bricklinkInventory.quantity,
    quantityReserved: 0,
    condition: bricklinkInventory.new_or_used === "N" ? "new" : "used",
    price: bricklinkInventory.unit_price ? parseFloat(bricklinkInventory.unit_price) : undefined,
    saleRate: bricklinkInventory.sale_rate ? bricklinkInventory.sale_rate : undefined,
    myCost: bricklinkInventory.my_cost ? parseFloat(bricklinkInventory.my_cost) : undefined,
    note: bricklinkInventory.description || "",
  };
}

/**
 * Map a Convex inventory item into a BrickLink create payload.
 */
export function mapConvexToBlCreate(convexInventory: InventoryItemDoc): BLInventoryCreatePayload {
  const new_or_used: "N" | "U" = convexInventory.condition === "new" ? "N" : "U";

  const unit_price = convexInventory.price?.toFixed(4) ?? "0.0000";

  const description = convexInventory.note || "";

  const remarks = convexInventory.location || "";

  if (!convexInventory.partNumber) {
    throw new Error("partNumber is required for BrickLink inventory creation");
  }

  return {
    item: {
      no: convexInventory.partNumber,
      type: "PART",
    },
    color_id: parseInt(convexInventory.colorId, 10),
    quantity: convexInventory.quantityAvailable,
    unit_price,
    new_or_used,
    description,
    remarks,
    bulk: 1,
    is_retain: false,
    is_stock_room: false,
    stock_room_id: undefined,
  };
}

/**
 * Map a Convex inventory item into a BrickLink update payload.
 */
export function mapConvexToBlUpdate(
  convexInventory: InventoryItemDoc,
  previousQuantity?: number,
): BLInventoryUpdatePayload {
  const unit_price = convexInventory.price ? convexInventory.price.toFixed(4) : "0.0000";

  let quantity: string | undefined;
  if (previousQuantity !== undefined) {
    const delta = convexInventory.quantityAvailable - previousQuantity;
    quantity = delta > 0 ? `+${delta}` : `${delta}`;
  }

  const new_or_used: "N" | "U" = convexInventory.condition === "new" ? "N" : "U";

  const description = convexInventory.note || "";

  const remarks = convexInventory.location || "";

  const payload: BLInventoryUpdatePayload = {
    unit_price,
    new_or_used,
    description,
    remarks,
  };

  if (quantity !== undefined) {
    payload.quantity = quantity;
  }

  return payload;
}
