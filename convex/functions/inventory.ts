import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type InventoryInput = {
  businessAccountId: string;
  sku: string;
  name: string;
  colorId: string;
  location: string;
  quantityAvailable: number;
  quantityReserved: number;
  quantitySold: number;
  status: "available" | "reserved" | "sold";
  condition: "new" | "used";
};

const now = () => Date.now();

type Ctx = QueryCtx | MutationCtx;

async function requireUser(ctx: Ctx): Promise<{ userId: Id<"users">; user: Doc<"users"> }> {
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

function assertBusinessMembership(user: Doc<"users">, businessAccountId: string) {
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
    quantityReserved: v.optional(v.number()),
    quantitySold: v.optional(v.number()),
    status: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("sold"))),
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
      .withIndex("by_sku", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("sku", args.sku),
      )
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
      quantityReserved: args.quantityReserved ?? 0,
      quantitySold: args.quantitySold ?? 0,
      status: args.status ?? "available",
      condition: args.condition,
      createdBy: user._id,
      createdAt: now(),
      isArchived: false,
    } satisfies InventoryInput & { createdBy: string; createdAt: number; isArchived: boolean };

    const id = await ctx.db.insert("inventoryItems", document);

    // Write audit log
    await ctx.db.insert("inventoryAuditLogs", {
      businessAccountId: args.businessAccountId,
      itemId: id,
      changeType: "create",
      deltaAvailable: args.quantityAvailable,
      deltaReserved: document.quantityReserved,
      deltaSold: document.quantitySold,
      toStatus: document.status,
      actorUserId: user._id,
      createdAt: now(),
    });

    return id;
  },
});

export const listInventoryItems = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    // Exclude archived items from standard listings
    const activeItems = items.filter((item) => !item.isArchived);

    return activeItems.sort((a, b) => a.name.localeCompare(b.name));
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

    await ctx.db.insert("inventoryAuditLogs", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "adjust",
      deltaAvailable: args.quantityAvailable - item.quantityAvailable,
      actorUserId: user._id,
      createdAt: now(),
    });

    return { itemId: args.itemId, quantityAvailable: args.quantityAvailable };
  },
});

export const updateInventoryItem = mutation({
  args: {
    itemId: v.id("inventoryItems"),
    name: v.optional(v.string()),
    colorId: v.optional(v.string()),
    location: v.optional(v.string()),
    condition: v.optional(v.union(v.literal("new"), v.literal("used"))),
    status: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("sold"))),
    quantityAvailable: v.optional(v.number()),
    quantityReserved: v.optional(v.number()),
    quantitySold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);

    const nextAvailable = args.quantityAvailable ?? item.quantityAvailable;
    const nextReserved = args.quantityReserved ?? item.quantityReserved ?? 0;
    const nextSold = args.quantitySold ?? item.quantitySold ?? 0;
    if (nextAvailable < 0 || nextReserved < 0 || nextSold < 0) {
      throw new ConvexError("Quantities cannot be negative");
    }

    const total = nextAvailable + nextReserved + nextSold;
    if (!Number.isFinite(total)) {
      throw new ConvexError("Invalid quantity values");
    }

    const updates: Partial<Doc<"inventoryItems">> & { updatedAt: number } = {
      updatedAt: now(),
    };
    (["name", "colorId", "location", "condition", "status"] as const).forEach((key) => {
      if (args[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updates as any)[key] = args[key] as unknown;
      }
    });
    if (args.quantityAvailable !== undefined) updates.quantityAvailable = nextAvailable;
    if (args.quantityReserved !== undefined) updates.quantityReserved = nextReserved;
    if (args.quantitySold !== undefined) updates.quantitySold = nextSold;

    await ctx.db.patch(args.itemId, updates);

    await ctx.db.insert("inventoryAuditLogs", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "update",
      deltaAvailable: nextAvailable - item.quantityAvailable,
      deltaReserved: nextReserved - (item.quantityReserved ?? 0),
      deltaSold: nextSold - (item.quantitySold ?? 0),
      fromStatus: item.status ?? "available",
      toStatus: updates.status ?? item.status ?? "available",
      actorUserId: user._id,
      createdAt: now(),
    });

    return { itemId: args.itemId };
  },
});

export const deleteInventoryItem = mutation({
  args: {
    itemId: v.id("inventoryItems"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Inventory item not found");
    assertBusinessMembership(user, item.businessAccountId);

    await ctx.db.patch(args.itemId, {
      isArchived: true,
      deletedAt: now(),
      updatedAt: now(),
    });

    await ctx.db.insert("inventoryAuditLogs", {
      businessAccountId: item.businessAccountId,
      itemId: args.itemId,
      changeType: "delete",
      actorUserId: user._id,
      reason: args.reason,
      createdAt: now(),
    });

    return { itemId: args.itemId, archived: true };
  },
});

export const getInventoryTotals = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
      .collect();

    const activeItems = items.filter((item) => !item.isArchived);

    let available = 0;
    let reserved = 0;
    let sold = 0;

    for (const it of activeItems) {
      available += it.quantityAvailable ?? 0;
      reserved += it.quantityReserved ?? 0;
      sold += it.quantitySold ?? 0;
    }

    return {
      counts: {
        items: activeItems.length,
      },
      totals: {
        available,
        reserved,
        sold,
      },
    };
  },
});

export const listInventoryAuditLogs = query({
  args: {
    businessAccountId: v.id("businessAccounts"),
    itemId: v.optional(v.id("inventoryItems")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    assertBusinessMembership(user, args.businessAccountId);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

    let logs: Doc<"inventoryAuditLogs">[] = [];
    if (args.itemId) {
      logs = await ctx.db
        .query("inventoryAuditLogs")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId!))
        .collect();
    } else {
      logs = await ctx.db
        .query("inventoryAuditLogs")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", args.businessAccountId))
        .collect();
    }

    // Sort newest first
    logs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return logs.slice(0, limit);
  },
});
