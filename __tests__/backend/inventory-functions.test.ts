/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";

import {
  addInventoryItem,
  listInventoryItems,
  updateInventoryQuantity,
  deleteInventoryItem,
  getInventoryTotals,
  listInventoryAuditLogs,
} from "@/convex/functions/inventory";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("inventory functions", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "abc12345",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        firstName: "Olivia",
        lastName: "Ops",
        name: "Olivia Ops",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  it("creates an inventory item for an authenticated user", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    const itemId = await (addInventoryItem as any)._handler(ctx, {
      businessAccountId,
      sku: "3001",
      name: "Brick 2x4",
      colorId: "5",
      location: "A1-B2",
      quantityAvailable: 10,
      condition: "new",
    });

    expect(itemId).toMatch(/^inventoryItems:/);

    const items = await (listInventoryItems as any)._handler(ctx, {
      businessAccountId,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sku: "3001",
      quantityAvailable: 10,
      createdBy: ownerUserId,
    });
  });

  it("prevents duplicate SKU entries for the same business", async () => {
    const seed = buildSeedData({
      ...baseSeed,
      inventoryItems: [
        {
          _id: "inventoryItems:1",
          businessAccountId,
          sku: "3001",
          name: "Brick 2x4",
          colorId: "5",
          location: "A1-B2",
          quantityAvailable: 10,
          condition: "new",
          createdBy: ownerUserId,
          createdAt: 1,
        },
      ],
    });

    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    await expect(
      (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        sku: "3001",
        name: "Brick 2x4",
        colorId: "5",
        location: "A1-B3",
        quantityAvailable: 5,
        condition: "new",
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("prevents updates that would set negative inventory", async () => {
    const seed = buildSeedData({
      ...baseSeed,
      inventoryItems: [
        {
          _id: "inventoryItems:1",
          businessAccountId,
          sku: "3001",
          name: "Brick 2x4",
          colorId: "5",
          location: "A1-B2",
          quantityAvailable: 10,
          condition: "new",
          createdBy: ownerUserId,
          createdAt: 1,
        },
      ],
    });

    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    await expect(
      (updateInventoryQuantity as any)._handler(ctx, {
        itemId: "inventoryItems:1",
        quantityAvailable: -3,
      }),
    ).rejects.toThrow("Quantity available cannot be negative");
  });

  it("only returns inventory items belonging to the current business account", async () => {
    const otherBusinessId = "businessAccounts:2";
    const seed = buildSeedData({
      businessAccounts: [
        ...(baseSeed.businessAccounts ?? []),
        {
          _id: otherBusinessId,
          name: "Other BrickOps",
          ownerUserId: "users:3",
          inviteCode: "xyz98765",
          createdAt: 1,
        },
      ],
      users: baseSeed.users,
      inventoryItems: [
        {
          _id: "inventoryItems:1",
          businessAccountId,
          sku: "3001",
          name: "Brick 2x4",
          colorId: "5",
          location: "A1-B2",
          quantityAvailable: 10,
          condition: "new",
          createdBy: ownerUserId,
          createdAt: 1,
        },
        {
          _id: "inventoryItems:2",
          businessAccountId: otherBusinessId,
          sku: "3002",
          name: "Plate 2x2",
          colorId: "1",
          location: "B1-C3",
          quantityAvailable: 5,
          condition: "used",
          createdBy: ownerUserId,
          createdAt: 1,
        },
      ],
    });

    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    const items = await (listInventoryItems as any)._handler(ctx, {
      businessAccountId,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      businessAccountId,
      sku: "3001",
    });
  });

  it("denies access when identity is missing", async () => {
    const ctx = createConvexTestContext({ seed: baseSeed, identity: null });

    await expect(
      (listInventoryItems as any)._handler(ctx, {
        businessAccountId,
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("excludes archived items from listings and totals", async () => {
    const seed = buildSeedData({
      ...baseSeed,
      inventoryItems: [
        {
          _id: "inventoryItems:1",
          businessAccountId,
          sku: "3001",
          name: "Brick 2x4",
          colorId: "5",
          location: "A1-B2",
          quantityAvailable: 10,
          quantityReserved: 2,
          quantitySold: 1,
          condition: "new",
          createdBy: ownerUserId,
          createdAt: 1,
        },
        {
          _id: "inventoryItems:2",
          businessAccountId,
          sku: "3002",
          name: "Plate 2x2",
          colorId: "1",
          location: "B1-C3",
          quantityAvailable: 5,
          quantityReserved: 1,
          quantitySold: 0,
          condition: "used",
          createdBy: ownerUserId,
          createdAt: 1,
          isArchived: true,
          deletedAt: 2,
        },
      ],
    });

    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    const items = await (listInventoryItems as any)._handler(ctx, {
      businessAccountId,
    });
    expect(items).toHaveLength(1);
    expect(items[0]._id).toBe("inventoryItems:1");

    const totals = await (getInventoryTotals as any)._handler(ctx, {
      businessAccountId,
    });
    expect(totals).toMatchObject({
      counts: { items: 1 },
      totals: { available: 10, reserved: 2, sold: 1 },
    });
  });

  it("records audit logs for create/update/delete and lists them by item and by tenant", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    const itemId = await (addInventoryItem as any)._handler(ctx, {
      businessAccountId,
      sku: "3001",
      name: "Brick 2x4",
      colorId: "5",
      location: "A1-B2",
      quantityAvailable: 10,
      condition: "new",
    });

    await (updateInventoryQuantity as any)._handler(ctx, {
      itemId,
      quantityAvailable: 12,
    });

    await (deleteInventoryItem as any)._handler(ctx, {
      itemId,
      reason: "test cleanup",
    });

    const byItem = await (listInventoryAuditLogs as any)._handler(ctx, {
      businessAccountId,
      itemId,
    });
    expect(byItem.length).toBeGreaterThanOrEqual(3);
    expect(byItem[0]).toHaveProperty("changeType");

    const byTenant = await (listInventoryAuditLogs as any)._handler(ctx, {
      businessAccountId,
      limit: 2,
    });
    expect(byTenant.length).toBeLessThanOrEqual(2);
  });
});
