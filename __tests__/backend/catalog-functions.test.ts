/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  searchParts,
  getPartDetails,
  getPartOverlay,
  upsertPartOverlay,
} from "../../convex/functions/catalog";
import {
  savePartToLocalCatalog,
  batchImportParts,
  seedBricklinkColors,
  seedBricklinkCategories,
  seedPartColorAvailability,
  seedElementReferences,
  refreshCatalogEntries,
} from "../../convex/functions/scriptOps";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "../../test/utils/convex-test-context";
import type { BusinessAccountSeed, UserSeed } from "../../test/utils/convex-test-context";

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
  const managerUserId = "users:2";

  const now = Date.now();

  const baseSeed: {
    businessAccounts: BusinessAccountSeed[];
    users: UserSeed[];
  } = {
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "Test Business",
        ownerUserId,
        inviteCode: "TEST123",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
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
        _id: managerUserId,
        businessAccountId,
        email: "manager@example.com",
        role: "manager",
        firstName: "Test",
        lastName: "Manager",
        name: "Test Manager",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };

  beforeEach(() => {
    process.env.BRICKOPS_SYSTEM_ADMIN_EMAILS = "owner@example.com";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.BRICKOPS_SYSTEM_ADMIN_EMAILS;
  });

  describe("searchParts", () => {
    it("returns paginated results", async () => {
      const seedWithParts = buildSeedData({
        businessAccounts: baseSeed.businessAccounts,
        users: baseSeed.users,
        legoPartCatalog: [
          {
            partNumber: "3001",
            name: "Brick 2 x 4",
            description: "Standard brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            imageUrl: undefined,
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
            partNumber: "3002",
            name: "Brick 2 x 3",
            description: "Smaller brick",
            category: "Bricks",
            categoryPath: [100],
            categoryPathKey: "100",
            imageUrl: undefined,
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
        partTitle: "brick",
        pageSize: 10,
      });

      expect(result.parts).toHaveLength(2);
      expect(result.source).toBe("local");
      expect(result.pagination?.pageSize).toBe(10);
    });
  });

  describe("getPartDetails", () => {
    it("returns enriched local data with availability", async () => {
      const seed = buildSeedData({
        ...baseSeed,
        legoPartCatalog: [
          {
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

  describe("part overlays", () => {
    it("returns overlay scoped to the current tenant", async () => {
      const seed = buildSeedData({
        businessAccounts: baseSeed.businessAccounts,
        users: baseSeed.users,
        catalogPartOverlay: [
          {
            businessAccountId,
            partNumber: "3001",
            tags: ["bin-ready"],
            notes: "Keep near station",
            sortGrid: "A",
            sortBin: "1",
            createdBy: ownerUserId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-010` }),
      });

      const overlay = await (getPartOverlay as any)._handler(ctx, {
        partNumber: "3001",
      });

      expect(overlay?.tags).toEqual(["bin-ready"]);
      expect(overlay?.notes).toBe("Keep near station");
    });

    it("creates a new overlay when none exists", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-011` }),
      });

      const result = await (upsertPartOverlay as any)._handler(ctx, {
        partNumber: "4001",
        notes: "New overlay",
        tags: ["new"],
      });

      expect(result?.notes).toBe("New overlay");
      expect(result?.tags).toEqual(["new"]);

      const stored = await ctx.db.query("catalogPartOverlay").collect();
      expect(stored).toHaveLength(1);
      expect(stored[0].partNumber).toBe("4001");
    });

    it("allows any tenant member to upsert overlays", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({
          subject: `${managerUserId}|session-012a`,
          email: "manager@example.com",
        }),
      });

      const overlay = await (upsertPartOverlay as any)._handler(ctx, {
        partNumber: "5000",
        notes: "Manager note",
      });

      expect(overlay?.notes).toBe("Manager note");
    });

    it("updates existing overlay fields", async () => {
      const seed = buildSeedData({
        businessAccounts: baseSeed.businessAccounts,
        users: baseSeed.users,
        catalogPartOverlay: [
          {
            businessAccountId,
            partNumber: "5001",
            tags: ["old"],
            notes: "Legacy note",
            createdBy: ownerUserId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-012` }),
      });

      const result = await (upsertPartOverlay as any)._handler(ctx, {
        partNumber: "5001",
        tags: ["updated"],
        sortGrid: "Z",
        sortBin: "99",
        notes: "Updated note",
      });

      expect(result?.tags).toEqual(["updated"]);
      expect(result?.sortGrid).toBe("Z");
      expect(result?.notes).toBe("Updated note");
    });

    it("isolates overlays per tenant", async () => {
      const otherBusinessAccountId = "businessAccounts:2";
      const otherOwnerUserId = "users:3";

      const seed = buildSeedData({
        businessAccounts: [
          ...baseSeed.businessAccounts,
          {
            _id: otherBusinessAccountId,
            name: "Other Business",
            ownerUserId: otherOwnerUserId,
            inviteCode: "OTHER123",
            createdAt: 1,
          },
        ],
        users: [
          ...baseSeed.users,
          {
            _id: otherOwnerUserId,
            businessAccountId: otherBusinessAccountId,
            email: "other-owner@example.com",
            role: "owner",
            firstName: "Other",
            lastName: "Owner",
            name: "Other Owner",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        catalogPartOverlay: [
          {
            businessAccountId,
            partNumber: "shared",
            tags: ["primary"],
            createdBy: ownerUserId,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({
          subject: `${otherOwnerUserId}|session-013`,
          email: "other-owner@example.com",
        }),
      });

      const overlay = await (getPartOverlay as any)._handler(ctx, {
        partNumber: "shared",
      });

      expect(overlay).toBeNull();
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
        imageUrl: undefined,
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

    it("rejects non-system administrators", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({
          subject: `${managerUserId}|session-002`,
          email: "manager@example.com",
        }),
      });

      await expect(
        (savePartToLocalCatalog as any)._handler(ctx, {
          partNumber: "999",
          name: "Restricted Part",
          dataSource: "manual",
        }),
      ).rejects.toThrow("System administrator access required");
    });
  });

  describe("batchImportParts", () => {
    it("updates existing parts with new metadata", async () => {
      const seed = buildSeedData({
        businessAccounts: baseSeed.businessAccounts,
        users: baseSeed.users,
        legoPartCatalog: [
          {
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
            imageUrl: undefined,
            bricklinkPartId: "888",
            bricklinkCategoryId: 10,
            categoryPath: [10],
            primaryColorId: 2,
            availableColorIds: [2, 3],
            aliases: ["updated"],
          },
        ],
        dataSource: "bricklink",
      });

      expect(result.updated).toBe(1);
      const stored = await ctx.db.get("legoPartCatalog:1" as any);
      expect(stored?.name).toBe("Updated Part");
      expect(stored?.primaryColorId).toBe(2);
      expect(stored?.dataFreshness).toBe("fresh");
    });

    it("blocks imports from non-system administrators", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({
          subject: `${managerUserId}|session-003`,
          email: "manager@example.com",
        }),
      });

      await expect(
        (batchImportParts as any)._handler(ctx, {
          parts: [
            {
              partNumber: "restricted",
              name: "Restricted",
              dataSource: "manual",
            },
          ],
          dataSource: "manual",
        }),
      ).rejects.toThrow("System administrator access required");
    });
  });

  describe("reference seeding", () => {
    it("upserts color and category references", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
      });

      const colorResult = await (seedBricklinkColors as any)._handler(ctx, {
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

    it("requires system administrator permissions", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({
          subject: `${managerUserId}|session-004`,
          email: "manager@example.com",
        }),
      });

      await expect(
        (seedBricklinkColors as any)._handler(ctx, {
          records: [],
        }),
      ).rejects.toThrow("System administrator access required");
    });
  });

  describe("refreshCatalogEntries", () => {
    it("requires system administrator access", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({
          subject: `${managerUserId}|session-005`,
          email: "manager@example.com",
        }),
      });

      await expect(
        (refreshCatalogEntries as any)._handler(ctx, {
          limit: 5,
        }),
      ).rejects.toThrow("System administrator access required");
    });
  });
});
