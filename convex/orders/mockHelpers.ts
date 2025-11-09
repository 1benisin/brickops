import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export function isDevelopmentEnvironment(): boolean {
  const deploymentName = process.env.CONVEX_DEPLOYMENT;
  return (
    !deploymentName ||
    deploymentName.startsWith("dev:") ||
    deploymentName.includes("development")
  );
}

export function assertDevelopmentEnvironment(message?: string): void {
  if (!isDevelopmentEnvironment()) {
    throw new Error(
      message ??
        "Mock data generation is restricted to development environments",
    );
  }
}

export interface MockInventoryItem {
  inventoryId: Id<"inventoryItems">;
  partNumber: string;
  name: string;
  colorId: string;
  colorName?: string;
  condition: "new" | "used";
  location: string;
  quantityAvailable: number;
}

export async function getRandomInventoryItemsForMock(
  ctx: MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  count: number,
): Promise<MockInventoryItem[]> {
  const allItems = await ctx.db
    .query("inventoryItems")
    .withIndex("by_businessAccount", (q) =>
      q.eq("businessAccountId", businessAccountId),
    )
    .collect();

  if (allItems.length === 0) {
    throw new Error(
      "No inventory items found. Generate mock inventory items before creating mock orders.",
    );
  }

  const shuffled = [...allItems].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  const results: MockInventoryItem[] = [];

  for (const item of selected) {
    await ctx.db.patch(item._id, {
      quantityReserved: 0,
      updatedAt: Date.now(),
    });

    const numericColorId =
      typeof item.colorId === "number" ? item.colorId : Number(item.colorId);
    let colorName: string | undefined;

    if (!Number.isNaN(numericColorId)) {
      const colorDoc = await ctx.db
        .query("colors")
        .filter((q) => q.eq(q.field("colorId"), numericColorId))
        .first();
      colorName = colorDoc?.colorName;
    }

    results.push({
      inventoryId: item._id as Id<"inventoryItems">,
      partNumber: item.partNumber,
      name: item.name,
      colorId: String(item.colorId),
      colorName,
      condition: item.condition,
      location: item.location,
      quantityAvailable: item.quantityAvailable,
    });
  }

  return results;
}

