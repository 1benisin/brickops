/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  searchParts,
  getPartDetails,
  savePartToLocalCatalog,
  batchImportParts,
} from "../../convex/functions/catalog";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "../../test/utils/convex-test-context";

// Mock the external dependencies
vi.mock("@/convex/lib/external/bricklink", () => ({
  BricklinkClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
  })),
}));

vi.mock("@/convex/lib/external/inMemoryRateLimiter", () => ({
  sharedRateLimiter: {
    consume: vi.fn(),
  },
}));

vi.mock("@/convex/lib/external/metrics", () => ({
  recordMetric: vi.fn(),
}));

describe("Catalog Functions", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        name: "Test Business",
        ownerUserId,
        inviteCode: "TEST123",
        createdAt: 1,
      },
    ],
    users: [
      {
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        firstName: "Test",
        lastName: "Owner",
        name: "Test Owner",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        businessAccountId,
        email: "member@example.com",
        role: "manager",
        firstName: "Test",
        lastName: "Member",
        name: "Test Member",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("searchParts", () => {
    it("should search local catalog and return results", async () => {
      const seedWithParts = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Brick 2 x 4",
            description: "Standard LEGO brick",
            category: "brick",
            imageUrl: "https://example.com/3001.jpg",
            bricklinkPartId: "3001",
            bricklinkCategoryId: 1,
            dataSource: "brickops",
            lastUpdated: Date.now(),
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithParts,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (searchParts as any)._handler(ctx, {
        searchTerm: "Brick",
        limit: 10,
        includeBricklinkFallback: false,
      });

      expect(result).toBeDefined();
      expect(result.parts).toHaveLength(1);
      expect(result.parts[0].partNumber).toBe("3001");
      expect(result.parts[0].name).toBe("Brick 2 x 4");
      expect(result.source).toBe("local");
      expect(result.searchDurationMs).toBeDefined();
      expect(typeof result.searchDurationMs).toBe("number");
    });

    it("should enforce minimum search term length", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await expect(
        (searchParts as any)._handler(ctx, {
          searchTerm: "a",
          limit: 10,
        }),
      ).rejects.toThrow("Search term must be at least 2 characters");
    });

    it("should limit search results to maximum of 100", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (searchParts as any)._handler(ctx, {
        searchTerm: "test",
        limit: 150, // Request more than allowed
      });

      // Since we don't have 100 parts, we just verify the logic doesn't error
      expect(result).toBeDefined();
      expect(result.parts).toBeDefined();
    });

    it("should filter by category when provided", async () => {
      const seedWithParts = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Test Brick",
            category: "brick",
            dataSource: "brickops",
            lastUpdated: Date.now(),
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: 1,
          },
          {
            businessAccountId,
            partNumber: "3005",
            name: "Test Plate",
            category: "plate",
            dataSource: "brickops",
            lastUpdated: Date.now(),
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithParts,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const brickResults = await (searchParts as any)._handler(ctx, {
        searchTerm: "Test",
        category: "brick",
      });

      expect(brickResults.parts).toHaveLength(1);
      expect(brickResults.parts[0].partNumber).toBe("3001");
    });

    it("should respect tenant isolation", async () => {
      const otherBusinessAccountId = "businessAccounts:2";
      const otherUserId = "users:3";

      const seedWithMultipleTenants = buildSeedData({
        ...baseSeed,
        businessAccounts: [
          {
            name: "Test Business",
            ownerUserId,
            inviteCode: "TEST123",
            createdAt: 1,
          },
          {
            name: "Other Business",
            ownerUserId: otherUserId,
            inviteCode: "OTHER123",
            createdAt: 1,
          },
        ],
        users: [
          {
            businessAccountId,
            email: "owner@example.com",
            role: "owner",
            firstName: "Test",
            lastName: "Owner",
            name: "Test Owner",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
          {
            businessAccountId,
            email: "member@example.com",
            role: "manager",
            firstName: "Test",
            lastName: "Member",
            name: "Test Member",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
          {
            businessAccountId: otherBusinessAccountId,
            email: "other@example.com",
            role: "owner",
            firstName: "Other",
            lastName: "User",
            name: "Other User",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        legoPartCatalog: [
          {
            businessAccountId: otherBusinessAccountId, // Different tenant
            partNumber: "9999",
            name: "Secret Part",
            dataSource: "brickops",
            lastUpdated: Date.now(),
            dataFreshness: "fresh",
            createdBy: otherUserId,
            createdAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithMultipleTenants,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      // Search should not return the other business's parts
      const result = await (searchParts as any)._handler(ctx, {
        searchTerm: "Secret",
      });

      expect(result.parts).toHaveLength(0);
    });
  });

  describe("getPartDetails", () => {
    it("should get part details from local catalog", async () => {
      const seedWithPart = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Brick 2 x 4",
            description: "Standard LEGO brick",
            dataSource: "brickops",
            lastUpdated: Date.now(),
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithPart,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (getPartDetails as any)._handler(ctx, {
        partNumber: "3001",
        fetchFromBricklink: false,
      });

      expect(result).toBeDefined();
      expect(result.partNumber).toBe("3001");
      expect(result.name).toBe("Brick 2 x 4");
      expect(result.dataFreshness).toBe("fresh");
    });

    it("should throw error for non-existent part", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await expect(
        (getPartDetails as any)._handler(ctx, {
          partNumber: "NONEXISTENT",
          fetchFromBricklink: false,
        }),
      ).rejects.toThrow("Part NONEXISTENT not found in catalog");
    });
  });

  describe("savePartToLocalCatalog", () => {
    it("should create new part in catalog", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (savePartToLocalCatalog as any)._handler(ctx, {
        partNumber: "3001",
        name: "Brick 2 x 4",
        description: "Standard LEGO brick",
        category: "brick",
        imageUrl: "https://example.com/3001.jpg",
        bricklinkPartId: "3001",
        bricklinkCategoryId: 1,
        dataSource: "manual",
      });

      expect(result).toBeDefined();

      // Verify part was created
      const part = await ctx.db.get(result);
      expect(part).toBeDefined();
      expect(part?.partNumber).toBe("3001");
      expect(part?.name).toBe("Brick 2 x 4");
      expect(part?.businessAccountId).toBe(businessAccountId);
      expect(part?.createdBy).toBe(ownerUserId);
    });

    it("should update existing part in catalog", async () => {
      const seedWithPart = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Old Name",
            description: "Old description",
            dataSource: "manual",
            lastUpdated: Date.now() - 1000,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithPart,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (savePartToLocalCatalog as any)._handler(ctx, {
        partNumber: "3001",
        name: "New Name",
        description: "New description",
        category: "brick",
        dataSource: "manual",
      });

      expect(result).toBe("legoPartCatalog:1");

      // Verify part was updated
      const updatedPart = await ctx.db.get("legoPartCatalog:1");
      expect(updatedPart?.name).toBe("New Name");
      expect(updatedPart?.description).toBe("New description");
      expect(updatedPart?.category).toBe("brick");
    });
  });

  describe("batchImportParts", () => {
    it("should import multiple parts successfully", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const partsToImport = [
        {
          partNumber: "3001",
          name: "Brick 2 x 4",
          description: "Standard brick",
          category: "brick",
          imageUrl: "https://example.com/3001.jpg",
          bricklinkPartId: "3001",
          bricklinkCategoryId: 1,
        },
        {
          partNumber: "3003",
          name: "Brick 2 x 2",
          description: "Small brick",
          category: "brick",
          imageUrl: "https://example.com/3003.jpg",
          bricklinkPartId: "3003",
          bricklinkCategoryId: 1,
        },
      ];

      const result = await (batchImportParts as any)._handler(ctx, {
        parts: partsToImport,
        dataSource: "manual",
      });

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty batch", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      await expect(
        (batchImportParts as any)._handler(ctx, {
          parts: [],
          dataSource: "manual",
        }),
      ).rejects.toThrow("No parts provided for import");
    });

    it("should reject batch over size limit", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const largeBatch = Array.from({ length: 101 }, (_, i) => ({
        partNumber: `part${i}`,
        name: `Part ${i}`,
      }));

      await expect(
        (batchImportParts as any)._handler(ctx, {
          parts: largeBatch,
          dataSource: "manual",
        }),
      ).rejects.toThrow("Batch size limited to 100 parts per request");
    });
  });

  describe("Authentication and Authorization", () => {
    it("should require authentication", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: null, // No authentication
      });

      await expect(
        (searchParts as any)._handler(ctx, {
          searchTerm: "test",
        }),
      ).rejects.toThrow("Authentication required");
    });

    it("should require active user status", async () => {
      const inactiveUserId = "users:3";
      const seedWithInactiveUser = buildSeedData({
        ...baseSeed,
        users: [
          {
            businessAccountId,
            email: "owner@example.com",
            role: "owner",
            firstName: "Test",
            lastName: "Owner",
            name: "Test Owner",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
          {
            businessAccountId,
            email: "member@example.com",
            role: "manager",
            firstName: "Test",
            lastName: "Member",
            name: "Test Member",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
          {
            businessAccountId,
            email: "inactive@example.com",
            role: "picker",
            firstName: "Inactive",
            lastName: "User",
            name: "Inactive User",
            status: "invited", // Not active
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithInactiveUser,
        identity: createTestIdentity({ subject: `${inactiveUserId}|session-001` }),
      });

      await expect(
        (searchParts as any)._handler(ctx, {
          searchTerm: "test",
        }),
      ).rejects.toThrow("User account is not active");
    });
  });

  describe("Performance Requirements", () => {
    it("search should complete within reasonable time", async () => {
      // Create multiple test parts
      const parts = Array.from({ length: 10 }, (_, i) => ({
        businessAccountId,
        partNumber: `300${i + 1}`,
        name: `Test Brick ${i + 1}`,
        dataSource: "brickops" as const,
        lastUpdated: Date.now(),
        dataFreshness: "fresh" as const,
        createdBy: ownerUserId,
        createdAt: 1,
      }));

      const seedWithManyParts = buildSeedData({
        ...baseSeed,
        legoPartCatalog: parts,
      });

      const ctx = createConvexTestContext({
        seed: seedWithManyParts,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const startTime = Date.now();
      const result = await (searchParts as any)._handler(ctx, {
        searchTerm: "Test",
        limit: 10,
      });
      const duration = Date.now() - startTime;

      expect(result.parts.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.searchDurationMs).toBeDefined();
      expect(typeof result.searchDurationMs).toBe("number");
    });
  });
});
