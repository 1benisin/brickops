/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";
import { createFile, updateFile, deleteFile } from "@/convex/inventory/files/mutations";
import { listFiles, getFile, getFileItemCount } from "@/convex/inventory/files/queries";

describe("Inventory Files Management", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";
  const managerUserId = "users:2";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "Test Business",
        ownerUserId,
        createdAt: Date.now(),
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        status: "active",
        createdAt: Date.now(),
      },
      {
        _id: managerUserId,
        businessAccountId,
        email: "manager@example.com",
        role: "manager",
        status: "active",
        createdAt: Date.now(),
      },
    ],
  });

  describe("createFile mutation", () => {
    it("should create a file with owner role", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Import Batch 001",
        description: "Test batch import",
      });

      expect(fileId).toBeDefined();

      const file = await ctx.db.get(fileId);
      expect(file).toMatchObject({
        businessAccountId,
        name: "Import Batch 001",
        description: "Test batch import",
        createdBy: ownerUserId,
      });
      expect(file?.createdAt).toBeDefined();
      expect(file?.updatedAt).toBeDefined();
      expect(file?.deletedAt).toBeUndefined();
    });

    it("should create a file without description", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Import Batch 002",
      });

      const file = await ctx.db.get(fileId);
      expect(file?.description).toBeUndefined();
    });

    it("should allow creation by non-owner role (manager)", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${managerUserId}|session-002` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Manager Created File",
      });

      expect(fileId).toBeDefined();
      const file = await (getFile as any)._handler(ctx, { fileId });
      expect(file?.name).toBe("Manager Created File");
      expect(file?.createdBy).toBe(managerUserId);
    });
  });

  describe("updateFile mutation", () => {
    it("should update file name and description", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Original Name",
        description: "Original description",
      });

      await (updateFile as any)._handler(ctx, {
        fileId,
        name: "Updated Name",
        description: "Updated description",
      });

      const file = await ctx.db.get(fileId);
      expect(file).toMatchObject({
        name: "Updated Name",
        description: "Updated description",
      });
      expect(file?.updatedAt).toBeGreaterThanOrEqual(file?.createdAt || 0);
    });

    it("should update only name when description not provided", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Original Name",
        description: "Original description",
      });

      await (updateFile as any)._handler(ctx, {
        fileId,
        name: "Updated Name Only",
      });

      const file = await ctx.db.get(fileId);
      expect(file?.name).toBe("Updated Name Only");
      expect(file?.description).toBe("Original description");
    });

    it("should reject update by non-owner role", async () => {
      const ownerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ownerCtx, {
        businessAccountId,
        name: "Test File",
      });

      const managerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${managerUserId}|session-002` }),
      });

      // Need to add the file to manager context's DB
      await managerCtx.db.insert("inventoryFiles", {
        _id: fileId,
        businessAccountId,
        name: "Test File",
        createdBy: ownerUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await expect(
        (updateFile as any)._handler(managerCtx, {
          fileId,
          name: "Unauthorized Update",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("should reject update of deleted file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Test File",
      });

      await (deleteFile as any)._handler(ctx, { fileId });

      await expect(
        (updateFile as any)._handler(ctx, {
          fileId,
          name: "Updated After Delete",
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("should reject update of non-existent file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await expect(
        (updateFile as any)._handler(ctx, {
          fileId: "inventoryFiles:999",
          name: "Non-existent",
        }),
      ).rejects.toThrow(ConvexError);
    });
  });

  describe("deleteFile mutation", () => {
    it("should soft delete a file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File to Delete",
      });

      await (deleteFile as any)._handler(ctx, { fileId });

      const file = await ctx.db.get(fileId);
      expect(file?.deletedAt).toBeDefined();
      expect(file?._id).toBe(fileId); // File still exists (soft delete)
    });

    it("should reject deletion by non-owner role", async () => {
      const ownerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ownerCtx, {
        businessAccountId,
        name: "Test File",
      });

      const managerCtx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${managerUserId}|session-002` }),
      });

      await managerCtx.db.insert("inventoryFiles", {
        _id: fileId,
        businessAccountId,
        name: "Test File",
        createdBy: ownerUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await expect((deleteFile as any)._handler(managerCtx, { fileId })).rejects.toThrow(
        ConvexError,
      );
    });

    it("should reject deletion of already deleted file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Test File",
      });

      await (deleteFile as any)._handler(ctx, { fileId });

      await expect((deleteFile as any)._handler(ctx, { fileId })).rejects.toThrow(ConvexError);
    });

    it("should reject deletion of non-existent file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await expect(
        (deleteFile as any)._handler(ctx, { fileId: "inventoryFiles:999" }),
      ).rejects.toThrow(ConvexError);
    });
  });

  describe("listFiles query", () => {
    it("should list all files for business account", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 1",
      });
      await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 2",
      });

      const files = await (listFiles as any)._handler(ctx, { businessAccountId });

      expect(files).toHaveLength(2);
      expect(files[0].itemCount).toBe(0);
    });

    it("should exclude deleted files by default", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 1",
      });
      const fileId2 = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 2",
      });

      await (deleteFile as any)._handler(ctx, { fileId: fileId2 });

      const files = await (listFiles as any)._handler(ctx, { businessAccountId });

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("File 1");
    });

    it("should include deleted files when requested", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 1",
      });
      const fileId2 = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File 2",
      });

      await (deleteFile as any)._handler(ctx, { fileId: fileId2 });

      const files = await (listFiles as any)._handler(ctx, {
        businessAccountId,
        includeDeleted: true,
      });

      expect(files).toHaveLength(2);
    });

    it("should include item counts for each file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "File with Items",
      });

      // Add items to the file
      await ctx.db.insert("inventoryItems", {
        businessAccountId,
        name: "Item 1",
        partNumber: "3001",
        colorId: "1",
        location: "A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: ownerUserId,
        createdAt: Date.now(),
      });

      const files = await (listFiles as any)._handler(ctx, { businessAccountId });

      expect(files).toHaveLength(1);
      expect(files[0].itemCount).toBe(1);
    });

    it("should sort files by creation date (newest first)", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Create files with different timestamps
      const now = Date.now();
      const file1Id = await ctx.db.insert("inventoryFiles", {
        businessAccountId,
        name: "Older File",
        createdBy: ownerUserId,
        createdAt: now - 1000,
        updatedAt: now - 1000,
      });
      const file2Id = await ctx.db.insert("inventoryFiles", {
        businessAccountId,
        name: "Newer File",
        createdBy: ownerUserId,
        createdAt: now,
        updatedAt: now,
      });

      const files = await (listFiles as any)._handler(ctx, { businessAccountId });

      expect(files).toHaveLength(2);
      expect(files[0]._id).toBe(file2Id); // Newer file first
      expect(files[1]._id).toBe(file1Id);
    });
  });

  describe("getFile query", () => {
    it("should get a file by ID", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Test File",
        description: "Test description",
      });

      const file = await (getFile as any)._handler(ctx, { fileId });

      expect(file).toMatchObject({
        _id: fileId,
        name: "Test File",
        description: "Test description",
      });
    });

    it("should return null for non-existent file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const file = await (getFile as any)._handler(ctx, { fileId: "inventoryFiles:999" });

      expect(file).toBeNull();
    });

    it("should reject access to file from different business account", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await ctx.db.insert("inventoryFiles", {
        businessAccountId: "businessAccounts:999",
        name: "Other Account File",
        createdBy: "users:999",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await expect((getFile as any)._handler(ctx, { fileId })).rejects.toThrow(ConvexError);
    });
  });

  describe("getFileItemCount query", () => {
    it("should return count of items in file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Test File",
      });

      await ctx.db.insert("inventoryItems", {
        businessAccountId,
        name: "Item 1",
        partNumber: "3001",
        colorId: "1",
        location: "A1",
        quantityAvailable: 10,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: ownerUserId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("inventoryItems", {
        businessAccountId,
        name: "Item 2",
        partNumber: "3002",
        colorId: "2",
        location: "A2",
        quantityAvailable: 5,
        quantityReserved: 0,
        quantitySold: 0,
        status: "available",
        condition: "new",
        fileId,
        createdBy: ownerUserId,
        createdAt: Date.now(),
      });

      const count = await (getFileItemCount as any)._handler(ctx, { fileId });

      expect(count).toBe(2);
    });

    it("should return 0 for file with no items", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const fileId = await (createFile as any)._handler(ctx, {
        businessAccountId,
        name: "Empty File",
      });

      const count = await (getFileItemCount as any)._handler(ctx, { fileId });

      expect(count).toBe(0);
    });

    it("should return 0 for non-existent file", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const count = await (getFileItemCount as any)._handler(ctx, {
        fileId: "inventoryFiles:999",
      });

      expect(count).toBe(0);
    });
  });
});
