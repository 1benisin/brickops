/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";

type InventoryInput = {
  businessAccountId: string;
  sku: string;
  name: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  condition: "new" | "used";
};

const now = () => Date.now();

async function requireUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("Authenticated user not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  return { userId, user };
}

function assertBusinessMembership(user: any, businessAccountId: string) {
  if (user.businessAccountId !== businessAccountId) {
    throw new ConvexError("User cannot modify another business account");
  }
}

export const addInventoryItem = mutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    sku: v.string(),
    name: v.string(),
    colorId: v.string(),
    location: v.string(),
    quantityAvailable: v.number(),
    condition: v.union(v.literal("new"), v.literal("used")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    const existingItem = await ctx.db
      .query("inventoryItems")
      .withIndex("by_sku", (q: any) => q.eq("businessAccountId", args.businessAccountId))
      .filter((item: any) => item.sku === args.sku)
      .first();

    if (existingItem) {
      throw new ConvexError("Inventory item already exists for this SKU");
    }

    const document = {
      businessAccountId: args.businessAccountId,
      sku: args.sku,
      name: args.name,
      colorId: args.colorId,
      location: args.location,
      quantityAvailable: args.quantityAvailable,
      condition: args.condition,
      createdBy: user._id,
      createdAt: now(),
    } satisfies InventoryInput & { createdBy: string; createdAt: number };

    return await ctx.db.insert("inventoryItems", document);
  },
});

export const listInventoryItems = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const items = (await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q: any) => q.eq("businessAccountId", args.businessAccountId))
      .collect()) as any[];

    return items.sort((a: any, b: any) => a.name.localeCompare(b.name));
  },
});

export const updateInventoryQuantity = mutation({
  args: {
    itemId: v.id("inventoryItems"),
    quantityAvailable: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError("Inventory item not found");
    }

    assertBusinessMembership(user, item.businessAccountId);

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    await ctx.db.patch(args.itemId, {
      quantityAvailable: args.quantityAvailable,
      updatedAt: now(),
    });

    return { itemId: args.itemId, quantityAvailable: args.quantityAvailable };
  },
});
