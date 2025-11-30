/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, afterEach } from "vitest";

import { ensurePart } from "@/convex/catalog/actions";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";
import * as userAuthorization from "@/convex/users/authorization";
import { internal } from "@/convex/_generated/api";

describe("catalog: ensurePart", () => {
  const businessAccountId = "businessAccounts:1";
  const userId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId: userId,
        inviteCode: "abc12345",
        createdAt: Date.now(),
      },
    ],
    users: [
      {
        _id: userId,
        businessAccountId,
        email: "test@example.com",
        role: "owner",
        firstName: "Test",
        lastName: "User",
        name: "Test User",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupTest = (seedOverrides: any = {}) => {
    const seed = { ...baseSeed, ...seedOverrides };
    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${userId}|session-001` }),
    });

    // Mock requireActiveUser
    vi.spyOn(userAuthorization, "requireActiveUser").mockResolvedValue({
      userId: seed.users[0]._id,
      user: seed.users[0],
      businessAccountId,
    } as any);

    // Mock runMutation and runQuery
    const runMutation = vi.fn();
    const runQuery = vi.fn();

    const actionCtx = {
      ...ctx,
      runMutation,
      runQuery,
      auth: {
        getUserIdentity: async () => createTestIdentity({ subject: `${userId}|session-001` }),
      },
    } as any;

    return { actionCtx, runMutation, runQuery };
  };

  it("enqueues refresh for missing part", async () => {
    const { actionCtx, runMutation, runQuery } = setupTest();

    // 1. getPartInternal -> null
    // 2. getPartColorsInternal -> []
    runQuery.mockResolvedValueOnce(null).mockResolvedValueOnce([]);

    await (ensurePart as any)._handler(actionCtx, { partNumber: "3001" });

    // Should enqueue part refresh
    expect(runMutation).toHaveBeenCalledWith(
      internal.catalog.mutations.enqueueCatalogRefresh,
      expect.objectContaining({
        tableName: "parts",
        primaryKey: "3001",
      }),
    );
  });

  it("enqueues refresh for stale part", async () => {
    const { actionCtx, runMutation, runQuery } = setupTest();
    const staleTime = Date.now() - 31 * 24 * 60 * 60 * 1000;

    // 1. getPartInternal -> stale
    // 2. getPartColorsInternal -> []
    runQuery.mockResolvedValueOnce({ lastFetched: staleTime }).mockResolvedValueOnce([]);

    await (ensurePart as any)._handler(actionCtx, { partNumber: "3001" });

    expect(runMutation).toHaveBeenCalledWith(
      internal.catalog.mutations.enqueueCatalogRefresh,
      expect.objectContaining({
        tableName: "parts",
        primaryKey: "3001",
      }),
    );
  });

  it("enqueues refresh for missing colors (when part is fresh)", async () => {
    const { actionCtx, runMutation, runQuery } = setupTest();

    // 1. getPartInternal -> fresh
    // 2. getPartColorsInternal -> []
    runQuery.mockResolvedValueOnce({ lastFetched: Date.now() }).mockResolvedValueOnce([]);

    await (ensurePart as any)._handler(actionCtx, { partNumber: "3001" });

    // Should NOT enqueue part refresh (it's fresh)
    expect(runMutation).not.toHaveBeenCalledWith(
      internal.catalog.mutations.enqueueCatalogRefresh,
      expect.objectContaining({ tableName: "parts" }),
    );

    // Should enqueue partColors refresh
    expect(runMutation).toHaveBeenCalledWith(
      internal.catalog.mutations.enqueueCatalogRefresh,
      expect.objectContaining({
        tableName: "partColors",
        primaryKey: "3001",
      }),
    );
  });

  it("enqueues refresh for missing prices", async () => {
    const { actionCtx, runMutation, runQuery } = setupTest();

    // 1. getPartInternal -> fresh
    // 2. getPartColorsInternal -> [color1]
    // 3. getPriceGuideInternal -> []
    runQuery
      .mockResolvedValueOnce({ lastFetched: Date.now() })
      .mockResolvedValueOnce([{ colorId: 1, lastFetched: Date.now() }])
      .mockResolvedValueOnce([]);

    await (ensurePart as any)._handler(actionCtx, { partNumber: "3001" });

    expect(runMutation).toHaveBeenCalledWith(
      internal.catalog.mutations.enqueueCatalogRefresh,
      expect.objectContaining({
        tableName: "partPrices",
        primaryKey: "3001",
        secondaryKey: "1",
      }),
    );
  });

  it("does nothing if everything is fresh", async () => {
    const { actionCtx, runMutation, runQuery } = setupTest();

    // 1. getPartInternal -> fresh
    // 2. getPartColorsInternal -> [color1]
    // 3. getPriceGuideInternal -> [price1]
    runQuery
      .mockResolvedValueOnce({ lastFetched: Date.now() })
      .mockResolvedValueOnce([{ colorId: 1, lastFetched: Date.now() }])
      .mockResolvedValueOnce([{ lastFetched: Date.now() }]);

    await (ensurePart as any)._handler(actionCtx, { partNumber: "3001" });

    expect(runMutation).not.toHaveBeenCalled();
  });
});
