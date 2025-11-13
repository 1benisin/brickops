/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, expect, vi } from "vitest";

import { importBricklinkInventory, importBrickowlInventory } from "@/convex/inventory/import";
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

const mockListInventories = vi.hoisted(
  () => vi.fn<(...args: unknown[]) => Promise<any>>(),
) as ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<any>>>;
const mockListBrickOwlInventories = vi.hoisted(
  () => vi.fn<(...args: unknown[]) => Promise<any>>(),
) as ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<any>>>;

vi.mock("@/convex/marketplaces/bricklink/inventory/actions", () => ({
  getBLInventories: mockListInventories,
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/actions", () => ({
  listInventories: mockListBrickOwlInventories,
}));

describe("inventory import dedupe by lot ID", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "invite-123",
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

  it("imports two Bricklink lots that share part, color, and location but have different lot IDs", async () => {
    const baseCtx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-1` }),
    });

    const addInventoryCalls: any[] = [];
    const markCalls: any[] = [];

    const runMutation = vi.fn(async (mutation: unknown, args: any) => {
      if (mutation === api.inventory.mutations.addInventoryItem) {
        addInventoryCalls.push(args);
        const id = `inventoryItems:${addInventoryCalls.length}`;
        return id;
      }
      if (mutation === internal.inventory.import.markMarketplaceImported) {
        markCalls.push(args);
        return undefined;
      }
      throw new Error(`Unexpected mutation: ${String(mutation)}`);
    });

    const runQuery = vi.fn(async (...args: any[]) => {
      const [, params] = args;
      if (!params || Object.keys(params).length === 0) {
        return [];
      }
      throw new Error("Unexpected query");
    });

    const ctx = {
      ...baseCtx,
      runQuery,
      runMutation,
    } as any;

    mockListInventories.mockResolvedValue([
      {
        inventory_id: 101,
        item: { no: "2440", name: "Hinge 6 x 3", type: "PART" },
        color_id: 0,
        quantity: 5,
        new_or_used: "U",
        color_name: "Black",
        unit_price: "0.25",
        remarks: "",
      },
      {
        inventory_id: 202,
        item: { no: "2440", name: "Hinge 6 x 3", type: "PART" },
        color_id: 0,
        quantity: 3,
        new_or_used: "U",
        color_name: "Black",
        unit_price: "0.30",
        remarks: "Shelf A",
      },
    ]);

    const result = await (importBricklinkInventory as any)._handler(ctx, {
      candidateIds: ["bricklink:101", "bricklink:202"],
    });

    console.log("bricklink result", result);
    expect(result).toMatchObject({
      provider: "bricklink",
      imported: 2,
      skippedExisting: 0,
      skippedUnavailable: 0,
      skippedInvalid: 0,
    });

    expect(runMutation).toHaveBeenCalledWith(
      api.inventory.mutations.addInventoryItem,
      expect.anything(),
    );
    expect(runMutation).toHaveBeenCalledWith(
      internal.inventory.import.markMarketplaceImported,
      expect.objectContaining({ provider: "bricklink" }),
    );
    expect(addInventoryCalls).toHaveLength(2);
    expect(markCalls).toHaveLength(2);
  });

  it("imports two BrickOwl lots that share part, color, and location but have different lot IDs", async () => {
    const baseCtx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-2` }),
    });

    const addInventoryCalls: any[] = [];
    const markCalls: any[] = [];

    const runMutation = vi.fn(async (mutation: unknown, args: any) => {
      if (mutation === api.inventory.mutations.addInventoryItem) {
        addInventoryCalls.push(args);
        const id = `inventoryItems:${addInventoryCalls.length}`;
        return id;
      }
      if (mutation === internal.inventory.import.markMarketplaceImported) {
        markCalls.push(args);
        return undefined;
      }
      if (mutation === internal.catalog.mutations.updatePartBrickowlId) {
        return undefined;
      }
      throw new Error(`Unexpected mutation: ${String(mutation)}`);
    });

    const runQuery = vi.fn(async (...args: any[]) => {
      const [, params] = args;
      if (!params || Object.keys(params).length === 0) {
        return [];
      }
      if ("brickowlId" in params) {
        return {
          no: "2440",
          name: "Hinge 6 x 3",
          brickowlId: params.brickowlId,
        };
      }
      if ("partNumber" in params) {
        return {
          no: params.partNumber,
          name: "Hinge 6 x 3",
          brickowlId: "2440-0000",
        };
      }
      if ("brickowlColorId" in params) {
        return { colorId: 0 };
      }
      throw new Error("Unexpected query");
    });

    const runAction = vi.fn(async (action: unknown) => {
      if (action === internal.catalog.actions.getBricklinkPartIdsFromBrickowl) {
        return ["2440"];
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
        lot_id: "lot-a",
        boid: "2440-0000",
        color_id: 0,
        quantity: 4,
        for_sale: "1",
        personal_note: "",
        condition: "new",
        price: "0.20",
      },
      {
        lot_id: "lot-b",
        boid: "2440-0000",
        color_id: 0,
        quantity: 6,
        for_sale: "1",
        personal_note: " ",
        condition: "used",
        price: "0.18",
      },
    ]);

    const result = await (importBrickowlInventory as any)._handler(ctx, {
      candidateIds: ["brickowl:lot-a", "brickowl:lot-b"],
    });

    console.log("brickowl result", result);
    expect(result).toMatchObject({
      provider: "brickowl",
      imported: 2,
      skippedExisting: 0,
      skippedUnavailable: 0,
      skippedInvalid: 0,
    });

    expect(runMutation).toHaveBeenCalledWith(
      api.inventory.mutations.addInventoryItem,
      expect.anything(),
    );
    expect(runMutation).toHaveBeenCalledWith(
      internal.inventory.import.markMarketplaceImported,
      expect.objectContaining({ provider: "brickowl" }),
    );
    expect(addInventoryCalls).toHaveLength(2);
    expect(addInventoryCalls.every((args) => args.location === "")).toBe(true);
    expect(markCalls).toEqual([
      expect.objectContaining({ marketplaceId: "lot-a" }),
      expect.objectContaining({ marketplaceId: "lot-b" }),
    ]);
  });
});
