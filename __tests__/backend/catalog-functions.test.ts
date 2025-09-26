/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  searchParts,
  getPartDetails,
  savePartToLocalCatalog,
  batchImportParts,
  seedBricklinkColors,
  seedBricklinkCategories,
  seedPartColorAvailability,
  seedElementReferences,
} from "../../convex/functions/catalog";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "../../test/utils/convex-test-context";

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

  const now = Date.now();

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
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("searchParts", () => {
    it("returns paginated results with metadata", async () => {
      const seedWithParts = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Brick 2 x 4",
            description: "Standard brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            imageUrl: null,
            bricklinkPartId: "3001",
            bricklinkCategoryId: 100,
            searchKeywords: "brick 2x4 3001",
            primaryColorId: 1,
            availableColorIds: [1, 21],
            sortGrid: "A",
            sortBin: "12",
            marketPrice: 1.23,
            marketPriceCurrency: "USD",
            marketPriceLastSyncedAt: now,
            dataSource: "brickops",
            lastUpdated: now,
            lastFetchedFromBricklink: now,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: now,
          },
          {
            businessAccountId,
            partNumber: "3002",
            name: "Brick 2 x 3",
            description: "Smaller brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            imageUrl: null,
            bricklinkPartId: "3002",
            bricklinkCategoryId: 100,
            searchKeywords: "brick 2x3 3002",
            primaryColorId: 2,
            availableColorIds: [2],
            sortGrid: "B",
            sortBin: "10",
            marketPrice: 0.95,
            marketPriceCurrency: "USD",
            marketPriceLastSyncedAt: now,
            dataSource: "brickops",
            lastUpdated: now,
            lastFetchedFromBricklink: now,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: now,
          },
        ],
        bricklinkColorReference: [
          {
            businessAccountId,
            bricklinkColorId: 1,
            name: "White",
            rgb: "FFFFFF",
            colorType: "Solid",
            isTransparent: false,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          {
            businessAccountId,
            bricklinkColorId: 2,
            name: "Black",
            rgb: "000000",
            colorType: "Solid",
            isTransparent: false,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
        bricklinkCategoryReference: [
          {
            businessAccountId,
            bricklinkCategoryId: 100,
            name: "Bricks",
            parentCategoryId: null,
            path: [100],
            pathKey: "100",
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed: seedWithParts,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (searchParts as any)._handler(ctx, {
        query: "brick",
        pageSize: 10,
        includeMetadata: true,
      });

      expect(result.parts).toHaveLength(2);
      expect(result.source).toBe("local");
      expect(result.metadata?.colors).toHaveLength(2);
      expect(result.metadata?.categories).toHaveLength(1);
      expect(result.pagination?.pageSize).toBe(10);
    });

    it("filters by color selection", async () => {
      const seed = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "111",
            name: "Red Brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            searchKeywords: "red brick",
            primaryColorId: 5,
            availableColorIds: [5],
            dataSource: "brickops",
            lastUpdated: now,
            lastFetchedFromBricklink: now,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: now,
          },
          {
            businessAccountId,
            partNumber: "222",
            name: "Blue Brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            searchKeywords: "blue brick",
            primaryColorId: 23,
            availableColorIds: [23],
            dataSource: "brickops",
            lastUpdated: now,
            lastFetchedFromBricklink: now,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (searchParts as any)._handler(ctx, {
        query: "brick",
        colors: [23],
      });

      expect(result.parts).toHaveLength(1);
      expect(result.parts[0].partNumber).toBe("222");
    });
  });

  describe("getPartDetails", () => {
    it("returns enriched local data with availability", async () => {
      const seed = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "3001",
            name: "Brick 2 x 4",
            description: "Standard brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            searchKeywords: "brick 2x4",
            primaryColorId: 1,
            availableColorIds: [1, 5],
            dataSource: "brickops",
            lastUpdated: now,
            lastFetchedFromBricklink: now,
            dataFreshness: "fresh",
            createdBy: ownerUserId,
            createdAt: now,
          },
        ],
        bricklinkColorReference: [
          {
            businessAccountId,
            bricklinkColorId: 1,
            name: "White",
            rgb: "FFFFFF",
            colorType: "Solid",
            isTransparent: false,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
        bricklinkPartColorAvailability: [
          {
            businessAccountId,
            partNumber: "3001",
            bricklinkPartId: "3001",
            colorId: 1,
            elementIds: ["300101"],
            isLegacy: false,
            syncedAt: now,
          },
        ],
        bricklinkElementReference: [
          {
            businessAccountId,
            elementId: "300101",
            partNumber: "3001",
            colorId: 1,
            bricklinkPartId: "3001",
            designId: "123",
            syncedAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (getPartDetails as any)._handler(ctx, {
        partNumber: "3001",
      });

      expect(result.partNumber).toBe("3001");
      expect(result.colorAvailability).toHaveLength(1);
      expect(result.elementReferences).toHaveLength(1);
      expect(result.marketPricing).toBeNull();
    });
  });

  describe("savePartToLocalCatalog", () => {
    it("materializes search keywords and metadata", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const partId = await (savePartToLocalCatalog as any)._handler(ctx, {
        partNumber: "77777",
        name: "Slope Brick",
        description: "Fancy slope",
        category: "Slopes",
        imageUrl: null,
        bricklinkPartId: "77777",
        bricklinkCategoryId: 200,
        dataSource: "manual",
        categoryPath: [200, 201],
        primaryColorId: 1,
        availableColorIds: [1, 21],
        sortGrid: "C",
        sortBin: "7",
        marketPrice: 2.5,
        marketPriceCurrency: "USD",
        marketPriceLastSyncedAt: now,
        aliases: ["slope"],
      });

      const stored = await ctx.db.get(partId);
      expect(stored?.searchKeywords).toContain("slope");
      expect(stored?.categoryPathKey).toBe("200/201");
      expect(stored?.availableColorIds).toEqual([1, 21]);
    });
  });

  describe("batchImportParts", () => {
    it("updates existing parts with new metadata", async () => {
      const seed = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
            businessAccountId,
            partNumber: "888",
            name: "Old Part",
            category: "Legacy",
            searchKeywords: "old part",
            dataSource: "manual",
            lastUpdated: now - 1000,
            lastFetchedFromBricklink: now - 1000,
            dataFreshness: "stale",
            createdBy: ownerUserId,
            createdAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const result = await (batchImportParts as any)._handler(ctx, {
        parts: [
          {
            partNumber: "888",
            name: "Updated Part",
            description: "Updated description",
            category: "Updated",
            imageUrl: null,
            bricklinkPartId: "888",
            bricklinkCategoryId: 10,
            categoryPath: [10],
            primaryColorId: 2,
            availableColorIds: [2, 3],
            sortGrid: "D",
            sortBin: "4",
            marketPrice: 4.5,
            marketPriceCurrency: "USD",
            marketPriceLastSyncedAt: now,
            aliases: ["updated"],
          },
        ],
        dataSource: "bricklink",
      });

      expect(result.updated).toBe(1);
      const stored = await ctx.db.get("legoPartCatalog:1" as any);
      expect(stored?.sortGrid).toBe("D");
      expect(stored?.marketPrice).toBe(4.5);
      expect(stored?.dataFreshness).toBe("fresh");
    });
  });

  describe("reference seeding", () => {
    it("upserts color and category references", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const colorResult = await (seedBricklinkColors as any)._handler(ctx, {
        businessAccountId,
        records: [
          {
            bricklinkColorId: 1,
            name: "White",
            rgb: "FFFFFF",
            colorType: "Solid",
            isTransparent: false,
            syncedAt: now,
          },
        ],
        clearExisting: true,
      });

      expect(colorResult.inserted).toBe(1);

      const categoryResult = await (seedBricklinkCategories as any)._handler(ctx, {
        businessAccountId,
        records: [
          {
            bricklinkCategoryId: 100,
            name: "Bricks",
            parentCategoryId: null,
            path: [100],
            syncedAt: now,
          },
        ],
        clearExisting: true,
      });

      expect(categoryResult.inserted).toBe(1);

      const availabilityResult = await (seedPartColorAvailability as any)._handler(ctx, {
        businessAccountId,
        records: [
          {
            partNumber: "3001",
            bricklinkPartId: "3001",
            colorId: 1,
            elementIds: ["300101"],
            isLegacy: false,
            syncedAt: now,
          },
        ],
        clearExisting: true,
      });

      expect(availabilityResult.inserted).toBe(1);

      const elementsResult = await (seedElementReferences as any)._handler(ctx, {
        businessAccountId,
        records: [
          {
            elementId: "300101",
            partNumber: "3001",
            colorId: 1,
            bricklinkPartId: "3001",
            designId: "123",
            syncedAt: now,
          },
        ],
        clearExisting: true,
      });

      expect(elementsResult.inserted).toBe(1);
    });
  });
});
