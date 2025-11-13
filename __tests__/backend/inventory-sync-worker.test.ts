import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/inventory/helpers", () => ({
  ensureBrickowlIdForPartAction: vi.fn(),
  formatApiError: vi.fn((error: unknown) =>
    typeof error === "string" ? (error as string) : JSON.stringify(error),
  ),
}));

vi.mock("@/convex/marketplaces/bricklink/inventory/transformers", () => ({
  mapConvexToBlCreate: vi.fn(() => ({ kind: "create" })),
  mapConvexToBlUpdate: vi.fn(() => ({ kind: "update" })),
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/transformers", () => ({
  mapConvexToBrickOwlCreate: vi.fn(() => ({ kind: "create" })),
  mapConvexToBrickOwlUpdate: vi.fn(() => ({ kind: "update" })),
}));

vi.mock("@/convex/marketplaces/bricklink/inventory/actions", () => ({
  createBLInventory: vi.fn(async () => ({ success: true, marketplaceId: 501 })),
  updateBLInventory: vi.fn(async () => ({ success: true, marketplaceId: 502 })),
  deleteBLInventory: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/actions", () => ({
  createInventory: vi.fn(async () => ({ success: true, marketplaceId: "bo-501" })),
  updateInventory: vi.fn(async () => ({ success: true, marketplaceId: "bo-502" })),
  deleteInventory: vi.fn(async () => ({ success: true })),
}));

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import { internal } from "@/convex/_generated/api";
import {
  drainMarketplaceOutbox,
  getPendingOutboxMessages,
  markOutboxFailed,
  markOutboxFailedPermanently,
  markOutboxInflight,
  markOutboxSucceeded,
} from "@/convex/inventory/syncWorker";
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

const ensureBrickowlIdForPartActionMock = vi.mocked(ensureBrickowlIdForPartAction);
const formatApiErrorMock = vi.mocked(formatApiError);
const mapConvexToBlCreateMock = vi.mocked(mapConvexToBlCreate);
const mapConvexToBlUpdateMock = vi.mocked(mapConvexToBlUpdate);
const mapConvexToBrickOwlCreateMock = vi.mocked(mapConvexToBrickOwlCreate);
const mapConvexToBrickOwlUpdateMock = vi.mocked(mapConvexToBrickOwlUpdate);
const createBLInventoryMock = vi.mocked(createBLInventory);
const updateBLInventoryMock = vi.mocked(updateBLInventory);
const createBrickOwlInventoryMock = vi.mocked(createBrickOwlInventory);

describe("inventory sync worker mutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getPendingOutboxMessages returns only messages ready for processing", async () => {
    const ctx = createConvexTestContext();
    const now = Date.now();

    await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:1",
      provider: "bricklink",
      kind: "update",
      status: "pending",
      attempt: 0,
      nextAttemptAt: now - 1,
      fromSeqExclusive: 1,
      toSeqInclusive: 2,
      createdAt: now,
    });

    await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:2",
      provider: "brickowl",
      kind: "create",
      status: "pending",
      attempt: 0,
      nextAttemptAt: now + 60_000,
      fromSeqExclusive: 0,
      toSeqInclusive: 1,
      createdAt: now,
    });

    const ready = await (getPendingOutboxMessages as any)._handler(ctx, {
      maxNextAttemptAt: now,
    });

    expect(ready).toHaveLength(1);
    expect(ready[0].itemId).toBe("inventoryItems:1");
  });

  it("markOutboxInflight enforces optimistic concurrency", async () => {
    const ctx = createConvexTestContext();
    const messageId = await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:1",
      provider: "bricklink",
      kind: "update",
      status: "pending",
      attempt: 1,
      nextAttemptAt: Date.now(),
      fromSeqExclusive: 1,
      toSeqInclusive: 2,
      createdAt: Date.now(),
    });

    const firstAttempt = await (markOutboxInflight as any)._handler(ctx, {
      messageId,
      currentAttempt: 1,
    });
    expect(firstAttempt).toEqual({ success: true });

    const secondAttempt = await (markOutboxInflight as any)._handler(ctx, {
      messageId,
      currentAttempt: 1,
    });
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.reason).toBe("Message state changed");
  });

  it("markOutboxFailed updates attempt counters and schedules retry", async () => {
    const ctx = createConvexTestContext();
    const messageId = await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:1",
      provider: "brickowl",
      kind: "create",
      status: "inflight",
      attempt: 2,
      nextAttemptAt: Date.now(),
      fromSeqExclusive: 5,
      toSeqInclusive: 6,
      createdAt: Date.now(),
    });

    const nextAttemptAt = Date.now() + 30_000;
    await (markOutboxFailed as any)._handler(ctx, {
      messageId,
      attempt: 3,
      nextAttemptAt,
      error: "temporary failure",
    });

    const updated = await ctx.db.get(messageId);
    expect(updated?.status).toBe("pending");
    expect(updated?.attempt).toBe(3);
    expect(updated?.nextAttemptAt).toBe(nextAttemptAt);
    expect(updated?.lastError).toBe("temporary failure");
  });

  it("markOutboxFailedPermanently records terminal error state", async () => {
    const ctx = createConvexTestContext();
    const messageId = await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:1",
      provider: "bricklink",
      kind: "delete",
      status: "inflight",
      attempt: 5,
      nextAttemptAt: Date.now(),
      fromSeqExclusive: 0,
      toSeqInclusive: 0,
      createdAt: Date.now(),
    });

    await (markOutboxFailedPermanently as any)._handler(ctx, {
      messageId,
      error: "max retries exceeded",
    });

    const updated = await ctx.db.get(messageId);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("max retries exceeded");
  });

  it("markOutboxSucceeded sets message status to succeeded", async () => {
    const ctx = createConvexTestContext();
    const messageId = await ctx.db.insert("marketplaceOutbox", {
      itemId: "inventoryItems:1",
      provider: "brickowl",
      kind: "delete",
      status: "inflight",
      attempt: 1,
      nextAttemptAt: Date.now(),
      fromSeqExclusive: 2,
      toSeqInclusive: 3,
      createdAt: Date.now(),
    });

    await (markOutboxSucceeded as any)._handler(ctx, { messageId });
    const updated = await ctx.db.get(messageId);
    expect(updated?.status).toBe("succeeded");
  });
});

describe("drainMarketplaceOutbox action", () => {
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

  it("processes a bricklink update message and advances sync cursor", async () => {
    const message = {
      _id: "marketplaceOutbox:1" as Id<"marketplaceOutbox">,
      itemId: "inventoryItems:1" as Id<"inventoryItems">,
      provider: "bricklink" as const,
      kind: "update" as const,
      fromSeqExclusive: 10,
      toSeqInclusive: 12,
      attempt: 0,
    };
    const item = {
      _id: message.itemId,
      businessAccountId: "businessAccounts:1" as Id<"businessAccounts">,
      quantityAvailable: 14,
      partNumber: "3001",
      marketplaceSync: {
        bricklink: {
          lotId: 987,
          lastSyncedAvailable: 8,
        },
      },
    };

    const ledgerEntry = { postAvailable: 15 };
    mapConvexToBlUpdateMock.mockReturnValueOnce({ payload: "update" });
    updateBLInventoryMock.mockResolvedValueOnce({ success: true, marketplaceId: 777 });

    const unexpectedQueries: Array<{ key: string; args: Record<string, unknown> }> = [];
    const runQuery = vi.fn(async (query: unknown, args: Record<string, unknown>) => {
      if ("maxNextAttemptAt" in args) {
        expect(args).toMatchObject({ maxNextAttemptAt: expect.any(Number) });
        return [message];
      }
      if ("fromSeqExclusive" in args && "toSeqInclusive" in args) {
        expect(args).toEqual({
          itemId: message.itemId,
          fromSeqExclusive: message.fromSeqExclusive,
          toSeqInclusive: message.toSeqInclusive,
        });
        return 6;
      }
      if (Object.keys(args).length === 1 && "itemId" in args) {
        expect(args).toEqual({ itemId: message.itemId });
        return item;
      }
      if ("seq" in args) {
        expect(args).toEqual({ itemId: message.itemId, seq: message.toSeqInclusive });
        return ledgerEntry;
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
      if ("currentAttempt" in args) {
        expect(args).toEqual({ messageId: message._id, currentAttempt: message.attempt });
        return { success: true };
      }
      if (Array.isArray((args as { results?: unknown[] }).results)) {
        syncUpdates.push(args);
        return undefined;
      }
      if (Object.keys(args).length === 1 && "messageId" in args) {
        expect(args).toEqual({ messageId: message._id });
        return undefined;
      }
      throw new Error(`Unexpected mutation args: ${JSON.stringify(args)}`);
    });

    const ctx = createActionCtx({ runQuery, runMutation });

    await (drainMarketplaceOutbox as any)._handler(ctx, {});

    expect(runQuery).toHaveBeenCalledWith(
      internal.inventory.syncWorker.getPendingOutboxMessages,
      expect.any(Object),
    );
    expect(unexpectedQueries).toEqual([]);
    expect(mapConvexToBlUpdateMock).toHaveBeenCalledWith(item, 8);
    expect(updateBLInventoryMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        businessAccountId: item.businessAccountId,
        inventoryId: 987,
        payload: { payload: "update" },
      }),
    );
    expect(syncUpdates).toHaveLength(1);
    const [updateCall] = syncUpdates;
    expect(updateCall).toMatchObject({
      inventoryItemId: item._id,
      results: [
        {
          provider: "bricklink",
          success: true,
          marketplaceId: 987,
          lastSyncedSeq: message.toSeqInclusive,
          lastSyncedAvailable: ledgerEntry.postAvailable,
        },
      ],
    });
  });

  it("falls back to create when lot id missing for update messages", async () => {
    const message = {
      _id: "marketplaceOutbox:2" as Id<"marketplaceOutbox">,
      itemId: "inventoryItems:2" as Id<"inventoryItems">,
      provider: "bricklink" as const,
      kind: "update" as const,
      fromSeqExclusive: 0,
      toSeqInclusive: 1,
      attempt: 0,
    };

    const item = {
      _id: message.itemId,
      businessAccountId: "businessAccounts:1" as Id<"businessAccounts">,
      quantityAvailable: 9,
      partNumber: "3002",
      marketplaceSync: {},
    };

    mapConvexToBlCreateMock.mockReturnValueOnce({ payload: "create" });
    createBLInventoryMock.mockResolvedValueOnce({ success: true, marketplaceId: 444 });

    const unexpectedQueries: Array<{ key: string; args: Record<string, unknown> }> = [];
    const runQuery = vi.fn(async (query: unknown, args: Record<string, unknown>) => {
      if ("maxNextAttemptAt" in args) {
        return [message];
      }
      if ("fromSeqExclusive" in args && "toSeqInclusive" in args) {
        return 1;
      }
      if (Object.keys(args).length === 1 && "itemId" in args) {
        return item;
      }
      if ("seq" in args) {
        return null;
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
      if ("currentAttempt" in args) {
        return { success: true };
      }
      if (Array.isArray((args as { results?: unknown[] }).results)) {
        syncUpdates.push(args);
        return undefined;
      }
      if (Object.keys(args).length === 1 && "messageId" in args) {
        return undefined;
      }
      if ("attempt" in args && "nextAttemptAt" in args) {
        // markOutboxFailed in retry path
        return undefined;
      }
      if ("error" in args && !("attempt" in args)) {
        mutationCalls.push({ mutation: "markOutboxFailedPermanently", args });
        return undefined;
      }
      throw new Error(`Unexpected mutation args: ${JSON.stringify(args)}`);
    });

    const ctx = createActionCtx({ runQuery, runMutation });

    await (drainMarketplaceOutbox as any)._handler(ctx, {});

    expect(createBLInventoryMock).toHaveBeenCalledTimes(1);
    expect(updateBLInventoryMock).not.toHaveBeenCalled();
    expect(syncUpdates).toHaveLength(1);
    const [updateCall] = syncUpdates;
    const results = updateCall.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({
      provider: "bricklink",
      success: true,
      marketplaceId: 444,
      lastSyncedSeq: message.toSeqInclusive,
      lastSyncedAvailable: item.quantityAvailable,
    });
    expect(unexpectedQueries).toEqual([]);
  });

  it("handles brickowl identifier gaps by marking message as failed permanently", async () => {
    const message = {
      _id: "marketplaceOutbox:3" as Id<"marketplaceOutbox">,
      itemId: "inventoryItems:3" as Id<"inventoryItems">,
      provider: "brickowl" as const,
      kind: "create" as const,
      fromSeqExclusive: 2,
      toSeqInclusive: 3,
      attempt: 1,
    };

    const item = {
      _id: message.itemId,
      businessAccountId: "businessAccounts:1" as Id<"businessAccounts">,
      quantityAvailable: 4,
      partNumber: "3003",
      colorId: "21",
      marketplaceSync: {
        brickowl: {
          status: "pending" as const,
        },
      },
    };

    ensureBrickowlIdForPartActionMock.mockResolvedValue("");

    const unexpectedQueries: Array<{ key: string; args: Record<string, unknown> }> = [];
    const runQuery = vi.fn(async (query: unknown, args: Record<string, unknown>) => {
      if ("maxNextAttemptAt" in args) {
        return [message];
      }
      if ("fromSeqExclusive" in args && "toSeqInclusive" in args) {
        return 0;
      }
      if (Object.keys(args).length === 1 && "itemId" in args) {
        return item;
      }
      if ("seq" in args) {
        return null;
      }
      const key =
        typeof query === "object" && query !== null && "_path" in query
          ? ((query as { _path: string[] })._path ?? []).join(".")
          : "unknown";
      unexpectedQueries.push({ key, args });
      return [];
    });

    const mutationCalls: Array<{ mutation: string; args: Record<string, unknown> }> = [];
    const runMutation = vi.fn(async (_mutation: unknown, args: Record<string, unknown>) => {
      let mutationName = "unknown";
      if ("currentAttempt" in args) {
        mutationName = "markOutboxInflight";
        mutationCalls.push({ mutation: mutationName, args });
        return { success: true };
      }
      if (Array.isArray((args as { results?: unknown[] }).results)) {
        mutationName = "updateSyncStatuses";
        mutationCalls.push({ mutation: mutationName, args });
        return undefined;
      }
      if ("attempt" in args && "nextAttemptAt" in args) {
        mutationName = "markOutboxFailed";
        mutationCalls.push({ mutation: mutationName, args });
        return undefined;
      }
      if ("error" in args && !("attempt" in args)) {
        mutationName = "markOutboxFailedPermanently";
        mutationCalls.push({ mutation: mutationName, args });
        return undefined;
      }
      mutationCalls.push({ mutation: mutationName, args });
      return undefined;
    });

    const ctx = createActionCtx({ runQuery, runMutation });

    await (drainMarketplaceOutbox as any)._handler(ctx, {});

    expect(createBrickOwlInventoryMock).not.toHaveBeenCalled();
    const failedCall = mutationCalls.find(({ mutation }) => mutation === "markOutboxFailedPermanently");
    expect(failedCall).toBeDefined();
    expect(failedCall?.args).toMatchObject({
      messageId: message._id,
      error: expect.stringContaining("BrickOwl ID not available"),
    });

    const syncCall = mutationCalls.find(({ mutation }) => mutation === "updateSyncStatuses");
    expect(syncCall).toBeDefined();
    const [result] = (syncCall!.args.results ?? []) as Array<Record<string, unknown>>;
    expect(result).toMatchObject({
      provider: "brickowl",
      success: false,
      error: expect.stringContaining(item.partNumber),
    });

    const retryCall = mutationCalls.find(({ mutation }) => mutation === "markOutboxFailed");
    expect(retryCall).toBeUndefined();
    expect(unexpectedQueries).toEqual([]);
  });
});


