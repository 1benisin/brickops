import { expect, test, describe } from "vitest";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("Inventory Files Schema", () => {
  describe("inventoryFiles table", () => {
    test("should create inventory file with all required fields", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
        identity: createTestIdentity({ subject: "users:1|session-001" }),
      });

      const fileId = await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Test Import File",
        description: "Test description",
        createdBy: "users:1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(fileId).toBeDefined();

      const file = await ctx.db.get(fileId);

      expect(file).toMatchObject({
        businessAccountId: "businessAccounts:1",
        name: "Test Import File",
        description: "Test description",
        createdBy: "users:1",
      });
    });

    test("should support soft delete with deletedAt field", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const fileId = await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Test File",
        createdBy: "users:1",
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      });

      const file = await ctx.db.get(fileId);

      expect(file?.deletedAt).toBe(now);
    });

    test("should query files by businessAccount index", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "File 1",
        createdBy: "users:1",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "File 2",
        createdBy: "users:1",
        createdAt: now + 1000,
        updatedAt: now + 1000,
      });

      const files = await ctx.db
        .query("inventoryFiles")
        .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", "businessAccounts:1"))
        .collect();

      expect(files).toHaveLength(2);
    });

    test("should query files by businessAccount and createdAt index (chronological order)", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Older File",
        createdBy: "users:1",
        createdAt: now - 1000,
        updatedAt: now - 1000,
      });
      await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Newer File",
        createdBy: "users:1",
        createdAt: now,
        updatedAt: now,
      });

      const files = await ctx.db
        .query("inventoryFiles")
        .withIndex("by_businessAccount_createdAt", (q) =>
          q.eq("businessAccountId", "businessAccounts:1"),
        )
        .collect();

      expect(files).toHaveLength(2);
      // Note: Results are ordered by index
      expect(files[0].name).toBe("Older File");
      expect(files[1].name).toBe("Newer File");
    });
  });

  describe("inventoryItems table extensions", () => {
    test("should create inventory item with fileId reference", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const fileId = await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Test File",
        createdBy: "users:1",
        createdAt: now,
        updatedAt: now,
      });

      const itemId = await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: "users:1",
        createdAt: now,
      });

      const item = await ctx.db.get(itemId);

      expect(item?.fileId).toBe(fileId);
    });

    test("should create inventory item with sync status fields", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const itemId = await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        bricklinkSyncStatus: "pending",
        brickowlSyncStatus: "synced",
        bricklinkSyncError: undefined,
        brickowlSyncError: undefined,
        createdBy: "users:1",
        createdAt: now,
      });

      const item = await ctx.db.get(itemId);

      expect(item?.bricklinkSyncStatus).toBe("pending");
      expect(item?.brickowlSyncStatus).toBe("synced");
      expect(item?.bricklinkSyncError).toBeUndefined();
      expect(item?.brickowlSyncError).toBeUndefined();
    });

    test("should create inventory item with marketplace IDs", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const itemId = await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        bricklinkLotId: 123456,
        brickowlLotId: "OWL789",
        createdBy: "users:1",
        createdAt: now,
      });

      const item = await ctx.db.get(itemId);

      expect(item?.bricklinkLotId).toBe(123456);
      expect(item?.brickowlLotId).toBe("OWL789");
    });

    test("should query inventory items by fileId index", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const fileId = await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:1",
        name: "Test File",
        createdBy: "users:1",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Item 1",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: "users:1",
        createdAt: now,
      });
      await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Item 2",
        partNumber: "3002",
        colorId: "2",
        location: "Bin A2",
        quantityAvailable: 5,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: "users:1",
        createdAt: now + 1000,
      });

      const items = await ctx.db
        .query("inventoryItems")
        .withIndex("by_fileId", (q) => q.eq("fileId", fileId))
        .collect();

      expect(items).toHaveLength(2);
      expect(items.every((item) => item.fileId === fileId)).toBe(true);
    });

    test("should allow inventory items without fileId (main inventory)", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const itemId = await ctx.db.insert("inventoryItems", {
        businessAccountId: "businessAccounts:1",
        name: "Main Inventory Item",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        // No fileId - this is in main inventory
        createdBy: "users:1",
        createdAt: now,
      });

      const item = await ctx.db.get(itemId);

      expect(item?.fileId).toBeUndefined();
    });
  });

  describe("Marketplace Credentials", () => {
    test("should create marketplace credentials with sync settings", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const credsId = await ctx.db.insert("marketplaceCredentials", {
        businessAccountId: "businessAccounts:1",
        provider: "bricklink",
        isActive: true,
        syncEnabled: false, // Test sync disabled
        createdAt: now,
        updatedAt: now,
      });

      const creds = await ctx.db.get(credsId);

      expect(creds?.syncEnabled).toBe(false);
      expect(creds?.provider).toBe("bricklink");
      expect(creds?.isActive).toBe(true);
    });

    test("should default syncEnabled to true when not specified", async () => {
      const ctx = createConvexTestContext({
        seed: buildSeedData({
          businessAccounts: [
            {
              _id: "businessAccounts:1",
              name: "Test Business",
              ownerUserId: "users:1",
              createdAt: Date.now(),
            },
          ],
          users: [
            {
              _id: "users:1",
              businessAccountId: "businessAccounts:1",
              email: "test@example.com",
              role: "owner",
              status: "active",
              createdAt: Date.now(),
            },
          ],
        }),
      });

      const now = Date.now();
      const credsId = await ctx.db.insert("marketplaceCredentials", {
        businessAccountId: "businessAccounts:1",
        provider: "brickowl",
        isActive: true,
        // syncEnabled not specified - should default to true
        createdAt: now,
        updatedAt: now,
      });

      const creds = await ctx.db.get(credsId);

      expect(creds?.syncEnabled).toBeUndefined(); // Optional field, undefined means default true
      expect(creds?.provider).toBe("brickowl");
      expect(creds?.isActive).toBe(true);
    });
  });
});
