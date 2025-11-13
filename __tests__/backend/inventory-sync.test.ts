import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/inventory/helpers", () => ({
  ensureBrickowlIdForPartAction: vi.fn(),
  formatApiError: vi.fn((error: unknown) =>
    typeof error === "string" ? (error as string) : JSON.stringify(error),
  ),
}));

vi.mock("@/convex/marketplaces/bricklink/inventory/transformers", () => ({
  mapConvexToBlCreate: vi.fn(() => ({ mapped: "create" })),
  mapConvexToBlUpdate: vi.fn(() => ({ mapped: "update" })),
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/transformers", () => ({
  mapConvexToBrickOwlCreate: vi.fn(() => ({ mapped: "create" })),
  mapConvexToBrickOwlUpdate: vi.fn(() => ({ mapped: "update" })),
}));

vi.mock("@/convex/marketplaces/bricklink/inventory/actions", () => ({
  createBLInventory: vi.fn(async () => ({ success: true, marketplaceId: 910 })),
  updateBLInventory: vi.fn(async () => ({ success: true, marketplaceId: 911 })),
  deleteBLInventory: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/actions", () => ({
  createInventory: vi.fn(async () => ({ success: true, marketplaceId: "bo-910" })),
  updateInventory: vi.fn(async () => ({ success: true, marketplaceId: "bo-911" })),
  deleteInventory: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/convex/lib/external/metrics", () => ({
  recordMetric: vi.fn(),
}));

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import { internal } from "@/convex/_generated/api";
import { updateSyncStatuses, syncInventoryChange } from "@/convex/inventory/sync";
import { createConvexTestContext } from "@/test-utils/convex-test-context";
import {
  ensureBrickowlIdForPartAction,
  formatApiError,
} from "@/convex/inventory/helpers";
import {
  mapConvexToBlCreate,
  mapConvexToBlUpdate,
} from "@/convex/marketplaces/bricklink/inventory/transformers";
import {
  mapConvexToBrickOwlCreate,
  mapConvexToBrickOwlUpdate,
} from "@/convex/marketplaces/brickowl/inventory/transformers";
import {
  createBLInventory,
  updateBLInventory,
} from "@/convex/marketplaces/bricklink/inventory/actions";
import {
  createInventory as createBrickOwlInventory,
} from "@/convex/marketplaces/brickowl/inventory/actions";
import { recordMetric } from "@/convex/lib/external/metrics";

const ensureBrickowlIdForPartActionMock = vi.mocked(ensureBrickowlIdForPartAction);
const formatApiErrorMock = vi.mocked(formatApiError);
const mapConvexToBlCreateMock = vi.mocked(mapConvexToBlCreate);
const mapConvexToBlUpdateMock = vi.mocked(mapConvexToBlUpdate);
const mapConvexToBrickOwlCreateMock = vi.mocked(mapConvexToBrickOwlCreate);
const mapConvexToBrickOwlUpdateMock = vi.mocked(mapConvexToBrickOwlUpdate);
const createBLInventoryMock = vi.mocked(createBLInventory);
const updateBLInventoryMock = vi.mocked(updateBLInventory);
const createBrickOwlInventoryMock = vi.mocked(createBrickOwlInventory);
const recordMetricMock = vi.mocked(recordMetric);

describe("updateSyncStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges provider updates while preserving existing metadata", async () => {
    const ctx = createConvexTestContext();
    const inventoryItemId = await ctx.db.insert("inventoryItems", {
      businessAccountId: "businessAccounts:1",
      quantityAvailable: 10,
      quantityReserved: 0,
      condition: "new",
      marketplaceSync: {
        bricklink: {
          status: "synced",
          lotId: 12345,
          lastSyncAttempt: Date.now() - 1_000,
          lastSyncedAvailable: 6,
        },
        brickowl: {
          status: "synced",
          lotId: "bo-123",
          lastSyncAttempt: Date.now() - 2_000,
        },
      },
    });

    const start = Date.now();

    await (updateSyncStatuses as any)._handler(ctx, {
      inventoryItemId,
      results: [
        {
          provider: "bricklink",
          success: true,
          marketplaceId: 777,
          lastSyncedSeq: 42,
          lastSyncedAvailable: 15,
        },
        {
          provider: "brickowl",
          success: false,
          error: "rate limited",
        },
      ],
    });

    const updated = (await ctx.db.get(inventoryItemId))!;
    expect(updated.marketplaceSync.bricklink).toMatchObject({
      status: "synced",
      lotId: 777,
      lastSyncedSeq: 42,
      lastSyncedAvailable: 15,
    });
    expect(updated.marketplaceSync.bricklink.lastSyncAttempt).toBeGreaterThanOrEqual(start);
    expect(updated.marketplaceSync.brickowl).toMatchObject({
      status: "failed",
      lotId: "bo-123",
      error: "rate limited",
    });
  });
});

describe("syncInventoryChange action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatApiErrorMock.mockImplementation(
      (error: unknown) => (typeof error === "string" ? (error as string) : String(error)),
    );
  });

  function createActionCtx(overrides: Partial<ActionCtx> = {}): ActionCtx {
    const base = createConvexTestContext();
    return {
      ...base,
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      scheduler: base.scheduler,
      auth: base.auth,
      storage: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      },
      waitUntil: vi.fn(),
      ...overrides,
    } as unknown as ActionCtx;
  }

  it("syncs to all configured providers and records metrics", async () => {
    const itemId = "inventoryItems:item-1" as Id<"inventoryItems">;
    const businessAccountId = "businessAccounts:acct-1" as Id<"businessAccounts">;
    const inventoryItem = {
      _id: itemId,
      businessAccountId,
      quantityAvailable: 12,
      quantityReserved: 0,
      condition: "new" as const,
      partNumber: "3001",
      colorId: "5",
      marketplaceSync: {},
    };

    ensureBrickowlIdForPartActionMock.mockResolvedValue("BO-3001");
    mapConvexToBlCreateMock.mockReturnValue({ payload: "bl-create" });
    mapConvexToBrickOwlCreateMock.mockReturnValue({ payload: "bo-create" });

    const unexpectedQueries: Array<{ query: unknown; args: Record<string, unknown> }> = [];
    const runQuery = vi.fn(async (_query: unknown, args: Record<string, unknown>) => {
      if (Object.keys(args).length === 1 && "itemId" in args) {
        expect(args).toEqual({ itemId });
        return inventoryItem;
      }
      if (Object.keys(args).length === 1 && "businessAccountId" in args) {
        expect(args).toEqual({ businessAccountId });
        return ["bricklink", "brickowl"];
      }
      if ("colorId" in args) {
        return { brickowlColorId: 501 };
      }
      const key =
        typeof query === "object" && query !== null && "_path" in query
          ? ((query as { _path: string[] })._path ?? []).join(".")
          : "unknown";
      unexpectedQueries.push({ key, args });
      return [];
    });

    const syncUpdates: Array<Record<string, unknown>> = [];
    const runMutation = vi.fn(async (_mutation: unknown, args: Record<string, unknown>) => {
      if (Array.isArray((args as { results?: unknown[] }).results)) {
        syncUpdates.push(args);
        return undefined;
      }
      throw new Error(`Unexpected mutation args: ${JSON.stringify(args)}`);
    });

    const ctx = createActionCtx({ runQuery, runMutation });

    await (syncInventoryChange as any)._handler(ctx, {
      businessAccountId,
      inventoryItemId: itemId,
      changeType: "create",
      previousData: {},
      correlationId: "corr-123",
    });

    expect(createBLInventoryMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        businessAccountId,
        payload: { payload: "bl-create" },
      }),
    );
    expect(createBrickOwlInventoryMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        businessAccountId,
        payload: { payload: "bo-create" },
        options: { idempotencyKey: "corr-123" },
      }),
    );
    expect(recordMetricMock).toHaveBeenCalledWith(
      "inventory.sync.bricklink.success",
      expect.any(Object),
    );
    expect(recordMetricMock).toHaveBeenCalledWith(
      "inventory.sync.brickowl.success",
      expect.any(Object),
    );
    expect(syncUpdates).toHaveLength(1);
    const [updateCall] = syncUpdates;
    expect(updateCall.inventoryItemId).toBe(itemId);
    const results = updateCall.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ provider: "bricklink", success: true });
    expect(results[1]).toMatchObject({ provider: "brickowl", success: true });
    expect(unexpectedQueries).toEqual([]);
  });
});


