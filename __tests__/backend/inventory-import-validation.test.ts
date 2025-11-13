/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, expect, vi } from "vitest";

import { validateBricklinkImport, validateBrickowlImport } from "@/convex/inventory/import";
import { api, internal } from "@/convex/_generated/api";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

const mockGetAuthUserId = vi.hoisted(
  () => vi.fn<() => Promise<string | null>>(),
) as ReturnType<typeof vi.fn<() => Promise<string | null>>>;

vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: mockGetAuthUserId,
}));

const mockListInventories = vi.fn<(...args: unknown[]) => Promise<any>>();
const mockListBrickOwlInventories = vi.fn<(...args: unknown[]) => Promise<any>>();

vi.mock("@/convex/marketplaces/bricklink/inventories", () => ({
  getBLInventories: mockListInventories,
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/actions", () => ({
  listInventories: mockListBrickOwlInventories,
}));

describe("inventory import validation", () => {
  const businessAccountId = "businessAccounts:val";
  const ownerUserId = "users:val";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "invite-val",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        status: "active",
        firstName: "Owner",
        lastName: "User",
        name: "Owner User",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserId.mockReset();
    mockGetAuthUserId.mockResolvedValue(ownerUserId);
  });

  it("summarizes BrickLink validation issues for unavailable and existing lots", async () => {
    const baseCtx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|val-1` }),
    });

    const existingInventoryItem = {
      _id: "inventoryItems:existing",
      _creationTime: 1,
      businessAccountId,
      name: "Existing Item",
      partNumber: "2440",
      colorId: "0",
      location: "",
      quantityAvailable: 4,
      quantityReserved: 0,
      condition: "used" as const,
      price: undefined,
      notes: undefined,
      createdBy: ownerUserId,
      createdAt: 1,
      updatedAt: undefined,
      isArchived: undefined,
      deletedAt: undefined,
      marketplaceSync: {
        bricklink: {
          lotId: 505,
          status: "synced" as const,
          lastSyncAttempt: 1,
        },
      },
    };

    const runQuery = vi.fn(async (query: unknown) => {
      if (query === api.users.queries.getCurrentUser) {
        return {
          user: { _id: ownerUserId, role: "owner" },
          businessAccount: { _id: businessAccountId },
        };
      }
      if (query === api.inventory.queries.listInventoryItems) {
        return [existingInventoryItem];
      }
      throw new Error(`Unexpected query: ${String(query)}`);
    });

    const ctx = {
      ...baseCtx,
      runQuery,
    } as any;

    mockListInventories.mockResolvedValue([
      {
        inventory_id: 505,
        item: { no: "2440", name: "Hinge 6 x 3" },
        color_id: 0,
        quantity: 2,
        new_or_used: "U",
      },
      {
        inventory_id: 606,
        item: { no: "2440", name: "Hinge 6 x 3" },
        color_id: 0,
        quantity: 0,
        new_or_used: "U",
      },
      {
        inventory_id: 707,
        item: { no: "3062b", name: "Round Brick 1 x 1" },
        color_id: 0,
        quantity: 8,
        new_or_used: "N",
      },
    ]);

    const result = await (validateBricklinkImport as any)._handler(ctx, {});

    expect(result).toMatchObject({
      provider: "bricklink",
      totalRemote: 3,
      readyCount: 1,
      existingCount: 1,
      unavailableCount: 1,
      invalidCount: 0,
    });

    const existingCandidate = result.candidates.find(
      (candidate: any) => candidate.candidateId === "bricklink:505",
    );
    expect(existingCandidate?.status).toBe("skip-existing");

    const unavailableCandidate = result.candidates.find(
      (candidate: any) => candidate.candidateId === "bricklink:606",
    );
    expect(unavailableCandidate?.status).toBe("skip-unavailable");

    const readyCandidate = result.candidates.find(
      (candidate: any) => candidate.candidateId === "bricklink:707",
    );
    expect(readyCandidate?.status).toBe("ready");
  });

  it("identifies BrickOwl candidates missing color mappings", async () => {
    const baseCtx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|val-2` }),
    });

    const runQuery = vi.fn(async (query: unknown, args: any) => {
      if (query === api.users.queries.getCurrentUser) {
        return {
          user: { _id: ownerUserId, role: "owner" },
          businessAccount: { _id: businessAccountId },
        };
      }
      if (query === api.inventory.queries.listInventoryItems) {
        return [];
      }
      if (query === internal.catalog.queries.getPartByBrickowlId) {
        return {
          no: "3001",
          name: "Brick 2 x 4",
          brickowlId: args.brickowlId,
        };
      }
      if (query === internal.catalog.queries.getPartInternal) {
        return null;
      }
      if (query === internal.catalog.queries.getColorByBrickowlColorId) {
        if (args.brickowlColorId === 999) {
          return null;
        }
        return { colorId: 1 };
      }
      throw new Error(`Unexpected query: ${String(query)}`);
    });

    const runMutation = vi.fn(async () => undefined);
    const runAction = vi.fn(async (action: unknown) => {
      if (action === internal.catalog.actions.getBricklinkPartIdsFromBrickowl) {
        return [];
      }
      throw new Error(`Unexpected action: ${String(action)}`);
    });

    const ctx = {
      ...baseCtx,
      runQuery,
      runMutation,
      runAction,
    } as any;

    mockListBrickOwlInventories.mockResolvedValue([
      {
        lot_id: "ready-lot",
        boid: "3001-0001",
        color_id: 1,
        quantity: 10,
        for_sale: "1",
        personal_note: "",
      },
      {
        lot_id: "missing-color",
        boid: "3001-0999",
        color_id: 999,
        quantity: 5,
        for_sale: "1",
        personal_note: "",
      },
    ]);

    const result = await (validateBrickowlImport as any)._handler(ctx, {});

    expect(result).toMatchObject({
      provider: "brickowl",
      totalRemote: 2,
      readyCount: 1,
      invalidCount: 1,
    });

    const readyCandidate = result.candidates.find(
      (candidate: any) => candidate.candidateId === "brickowl:ready-lot",
    );
    expect(readyCandidate?.status).toBe("ready");

    const invalidCandidate = result.candidates.find(
      (candidate: any) => candidate.candidateId === "brickowl:missing-color",
    );
    expect(invalidCandidate?.status).toBe("skip-invalid");
    expect(invalidCandidate?.issues?.[0]?.code).toBe("catalog.color_missing");
  });
});
