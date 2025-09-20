import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  inventoryItems: defineTable({
    sku: "string",
    name: "string",
    quantityOnHand: "number",
    reorderPoint: "number",
  }).index("by_sku", ["sku"]),
});
