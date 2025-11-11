import type { Doc } from "../../../_generated/dataModel";
import type {
  BLInventoryCreatePayload,
  BLInventoryResponse,
  BLInventoryUpdatePayload,
} from "./schema";

type InventoryItemDoc = Doc;

type InsertableInventoryItem = Omit<
  InventoryItemDoc,
  "_id" | "_creationTime" | "createdBy" | "createdAt" | "updatedAt"
>;

/**
 * Map a BrickLink inventory response into the Convex inventory shape.
 */
export function mapBlToConvexInventory(
  bricklinkInventory: BLInventoryResponse,
  businessAccountId: InventoryItemDoc["businessAccountId"],
): InsertableInventoryItem {
  const condition: "new" | "used" = bricklinkInventory.new_or_used === "N" ? "new" : "used";

  const location = bricklinkInventory.remarks || "Main";

  const price = bricklinkInventory.unit_price
    ? parseFloat(bricklinkInventory.unit_price)
    : undefined;

  const notes = bricklinkInventory.description || undefined;

  return {
    businessAccountId,
    name: bricklinkInventory.item.name ?? bricklinkInventory.item.no,
    partNumber: bricklinkInventory.item.no,
    colorId: bricklinkInventory.color_id.toString(),
    location,
    quantityAvailable: bricklinkInventory.quantity,
    quantityReserved: 0,
    condition,
    price,
    notes,
  };
}

/**
 * Map a Convex inventory item into a BrickLink create payload.
 */
export function mapConvexToBlCreate(convexInventory: InventoryItemDoc): BLInventoryCreatePayload {
  const new_or_used: "N" | "U" = convexInventory.condition === "new" ? "N" : "U";

  const unit_price = convexInventory.price?.toFixed(4) ?? "0.0000";

  const description = convexInventory.notes || "";

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

  const description = convexInventory.notes || "";

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
