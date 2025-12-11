import { mutation } from "./_generated/server";

export const testSchema = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Create a business account (should succeed without createdAt)
    const baId = await ctx.db.insert("businessAccounts", {
      name: "Test Account",
      inviteCode: "test-code-" + Date.now(),
    });

    // 2. Create an inventory item (should succeed without createdAt)
    const itemId = await ctx.db.insert("inventoryItems", {
      businessAccountId: baId,
      name: "Test Item",
      partNumber: "3001",
      colorId: "1",
      location: "A1",
      quantityAvailable: 10,
      quantityReserved: 0,
      condition: "new",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createdBy: baId as any, // Mock user ID
      marketplaceSync: {
        bricklink: {
          status: "pending",
        },
      },
    });

    return { baId, itemId };
  },
});
