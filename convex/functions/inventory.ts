/* eslint-disable @typescript-eslint/no-explicit-any */
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

async function requireAuthentication(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }
  return identity;
}

async function getUserByToken(ctx: any, tokenIdentifier: string) {
  const users = await ctx.db.query("users").collect();
  return users.find((user: any) => user.tokenIdentifier === tokenIdentifier) ?? null;
}

function assertBusinessMembership(user: any, businessAccountId: string) {
  if (!user) {
    throw new ConvexError("User context missing");
  }

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
    const identity = await requireAuthentication(ctx);
    const user = await getUserByToken(ctx, identity.tokenIdentifier);
    assertBusinessMembership(user, args.businessAccountId);

    if (args.quantityAvailable < 0) {
      throw new ConvexError("Quantity available cannot be negative");
    }

    const existingItem = ((await ctx.db.query("inventoryItems").collect()) as any[]).find(
      (item: any) => item.businessAccountId === args.businessAccountId && item.sku === args.sku,
    );

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
    const identity = await requireAuthentication(ctx);
    const user = await getUserByToken(ctx, identity.tokenIdentifier);
    assertBusinessMembership(user, args.businessAccountId);

    const items = (await ctx.db.query("inventoryItems").collect()) as any[];

    return items
      .filter((item) => item.businessAccountId === args.businessAccountId)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  },
});

export const updateInventoryQuantity = mutation({
  args: {
    itemId: v.id("inventoryItems"),
    quantityAvailable: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuthentication(ctx);
    const user = await getUserByToken(ctx, identity.tokenIdentifier);

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
