/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import {
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  undoChange,
} from "@/convex/inventory/mutations";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("inventory undo functionality", () => {
  const businessAccountId = "businessAccounts:1" as any;
  const ownerUserId = "users:1" as any;
  const memberUserId = "users:2" as any;

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps Test",
        ownerUserId,
        inviteCode: "test123",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        firstName: "Owner",
        lastName: "User",
        name: "Owner User",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: memberUserId,
        businessAccountId,
        email: "member@example.com",
        role: "manager",
        firstName: "Member",
        lastName: "User",
        name: "Member User",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  describe("undoChange", () => {
    it("should undo a CREATE by executing DELETE", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      const itemId = await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      // Get the sync queue entry
      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changes.find((c: any) => c.changeType === "create");
      expect(createChange).toBeDefined();

      // Undo the create
      const result = await (undoChange as any)._handler(ctx, {
        changeId: createChange!._id,
        reason: "Testing undo",
      });

      expect(result).toMatchObject({
        originalChangeId: createChange!._id,
        itemId,
        compensatingAction: "delete",
      });

      // Verify item is archived
      const item = await ctx.db.get(itemId);
      expect(item!.isArchived).toBe(true);
      expect(item!.deletedAt).toBeDefined();

      // Verify bidirectional link
      const undoEntry = await ctx.db.get(result.undoChangeId);
      expect(undoEntry!.isUndo).toBe(true);
      expect(undoEntry!.undoesChangeId).toBe(createChange!._id);

      const originalUpdated = await ctx.db.get(createChange!._id);
      expect(originalUpdated!.undoneByChangeId).toBe(result.undoChangeId);
    });

    it("should undo an UPDATE by restoring previous values", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      const itemId = await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
        price: 5.0,
      });

      // Update the item
      await (updateInventoryItem as any)._handler(ctx, {
        itemId,
        quantityAvailable: 20,
        price: 7.5,
        reason: "Inventory adjustment",
      });

      // Get the update change
      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const updateChange = changes.find((c: any) => c.changeType === "update");
      expect(updateChange).toBeDefined();

      // Undo the update
      const result = await (undoChange as any)._handler(ctx, {
        changeId: updateChange!._id,
        reason: "Reverting update",
      });

      expect(result.compensatingAction).toBe("update");

      // Verify item is restored to previous state
      const item = await ctx.db.get(itemId);
      expect(item!.quantityAvailable).toBe(10);
      expect(item!.price).toBe(5.0);

      // Verify undo entry created
      const undoEntry = await ctx.db.get(result.undoChangeId);
      expect(undoEntry!.isUndo).toBe(true);
      expect(undoEntry!.changeType).toBe("update");
    });

    it("should undo a DELETE by restoring the item", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      const itemId = await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      // Delete the item
      await (deleteInventoryItem as any)._handler(ctx, {
        itemId,
        reason: "Removing from inventory",
      });

      // Verify item is archived
      let item = await ctx.db.get(itemId);
      expect(item!.isArchived).toBe(true);

      // Get the delete change
      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const deleteChange = changes.find((c: any) => c.changeType === "delete");
      expect(deleteChange).toBeDefined();

      // Undo the delete
      const result = await (undoChange as any)._handler(ctx, {
        changeId: deleteChange!._id,
        reason: "Restoring item",
      });

      expect(result.compensatingAction).toBe("create");

      // Verify item is restored
      item = await ctx.db.get(itemId);
      expect(item!.isArchived).toBe(false);
      expect(item!.deletedAt).toBeUndefined();
    });

    it("should support undo of undo (redo)", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      const itemId = await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      // Get the create change
      const changes1 = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changes1.find((c: any) => c.changeType === "create");

      // Undo the create (DELETE)
      const undoResult1 = await (undoChange as any)._handler(ctx, {
        changeId: createChange!._id,
        reason: "First undo",
      });

      // Verify item is archived
      let item = await ctx.db.get(itemId);
      expect(item!.isArchived).toBe(true);

      // Undo the undo (restore the item)
      const undoResult2 = await (undoChange as any)._handler(ctx, {
        changeId: undoResult1.undoChangeId,
        reason: "Redo - undo the undo",
      });

      expect(undoResult2.compensatingAction).toBe("create");

      // Verify item is restored
      item = await ctx.db.get(itemId);
      expect(item!.isArchived).toBe(false);
    });

    it("should require owner role", async () => {
      // Create item as owner first
      const ownerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await (addInventoryItem as any)._handler(ownerCtx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      const changes = await ownerCtx.db.query("inventorySyncQueue").collect();
      const createChange = changes[0];

      // Try to undo as manager (should fail - only owners can undo)
      const managerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${memberUserId}|session-002` }),
      });

      // Copy data to manager context
      const items = await ownerCtx.db.query("inventoryItems").collect();
      for (const item of items) {
        await managerCtx.db.insert("inventoryItems", item);
      }
      await managerCtx.db.insert("inventorySyncQueue", createChange);

      await expect(
        (undoChange as any)._handler(managerCtx, {
          changeId: createChange._id,
          reason: "Unauthorized undo",
        }),
      ).rejects.toThrow("owner");
    });

    it("should prevent undoing already undone changes", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changes[0];

      // Undo once
      await (undoChange as any)._handler(ctx, {
        changeId: createChange._id,
        reason: "First undo",
      });

      // Try to undo again (should fail)
      await expect(
        (undoChange as any)._handler(ctx, {
          changeId: createChange._id,
          reason: "Second undo",
        }),
      ).rejects.toThrow("already been undone");
    });

    it("should prevent undoing CREATE if item no longer exists", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      const itemId = await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changes[0];

      // Manually delete the item (simulate hard delete)
      await ctx.db.delete(itemId);

      // Try to undo (should fail)
      await expect(
        (undoChange as any)._handler(ctx, {
          changeId: createChange._id,
          reason: "Undo after deletion",
        }),
      ).rejects.toThrow("item no longer exists");
    });

    it("should create sync queue entry for compensating operation", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      const changesBefore = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changesBefore[0];

      // Undo the create
      await (undoChange as any)._handler(ctx, {
        changeId: createChange._id,
        reason: "Testing sync queue",
      });

      // Verify new sync queue entry was created
      const changesAfter = await ctx.db.query("inventorySyncQueue").collect();
      expect(changesAfter.length).toBe(2);

      const undoQueueEntry = changesAfter.find((c: any) => c.isUndo === true);
      expect(undoQueueEntry).toBeDefined();
      expect(undoQueueEntry!.syncStatus).toBe("pending");
      expect(undoQueueEntry!.changeType).toBe("delete");
      expect(undoQueueEntry!.correlationId).toBeDefined();
    });

    it("should create inventory history entry for undo", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create an inventory item
      await (addInventoryItem as any)._handler(ctx, {
        businessAccountId,
        name: "Test Brick",
        partNumber: "3001",
        colorId: "1",
        location: "Bin A",
        quantityAvailable: 10,
        condition: "new",
      });

      const changes = await ctx.db.query("inventorySyncQueue").collect();
      const createChange = changes[0];

      const historyBefore = await ctx.db.query("inventoryHistory").collect();
      const historyCountBefore = historyBefore.length;

      // Undo the create
      await (undoChange as any)._handler(ctx, {
        changeId: createChange._id,
        reason: "Testing history",
      });

      // Verify inventory history entry was created
      const historyAfter = await ctx.db.query("inventoryHistory").collect();
      expect(historyAfter.length).toBe(historyCountBefore + 1);

      const undoHistoryEntry = historyAfter[historyAfter.length - 1];
      expect(undoHistoryEntry.changeType).toBe("delete");
      expect(undoHistoryEntry.reason).toContain("Undo: Testing history");
    });
  });
});
