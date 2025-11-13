import { describe, expect, it } from "vitest";

import type { BOInventoryResponse } from "@/convex/marketplaces/brickowl/inventory/schema";
import {
  mapBrickOwlToConvexInventory,
  mapConvexToBrickOwlCreate,
  resolveBrickOwlQuantity,
} from "@/convex/marketplaces/brickowl/inventory/transformers";

describe("BrickOwl inventory transformers", () => {
  it("maps BrickOwl payloads into Convex inventory shape", () => {
    const payload: BOInventoryResponse = {
      lot_id: "1234",
      boid: "3001-1",
      quantity: "15",
      price: "0.25",
      condition: "usedn",
      personal_note: "B04",
      public_note: "Nice lot",
      ids: [
        { id: "3001", type: "item_no" },
        { id: "Lime", type: "color_name" },
      ],
    };

    const mapped = mapBrickOwlToConvexInventory(payload, "business-1" as never);

    expect(mapped).toMatchObject({
      businessAccountId: "business-1",
      partNumber: "3001",
      colorId: "0",
      location: "B04",
      quantityAvailable: 15,
      condition: "used",
      price: 0.25,
      notes: "Nice lot",
    });
  });

  it("maps Convex inventory to BrickOwl create payload", () => {
    const convexInventory = {
      _id: "inv-1",
      businessAccountId: "business-1",
      condition: "new",
      quantityAvailable: 8,
      price: 1.5,
      location: "A-01",
      notes: "Mint",
    } as unknown as Parameters<typeof mapConvexToBrickOwlCreate>[0];

    const createPayload = mapConvexToBrickOwlCreate(convexInventory, "3001-1", 5);

    expect(createPayload).toEqual(
      expect.objectContaining({
        boid: "3001-1",
        color_id: 5,
        quantity: 8,
        price: 1.5,
        condition: "new",
        personal_note: "A-01",
        public_note: "Mint",
        external_id: "inv-1",
      }),
    );
  });

  it("resolves quantity fields reliably", () => {
    expect(resolveBrickOwlQuantity({ lot_id: "1", quantity: 7 })).toBe(7);
    expect(resolveBrickOwlQuantity({ lot_id: "1", quantity: undefined, qty: "4" })).toBe(4);
    expect(resolveBrickOwlQuantity({ lot_id: "1" })).toBe(0);
  });
});
