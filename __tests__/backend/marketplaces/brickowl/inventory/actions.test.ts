import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/marketplaces/brickowl/client", async () => {
  const actual = await vi.importActual<typeof import("@/convex/marketplaces/brickowl/client")>(
    "@/convex/marketplaces/brickowl/client",
  );
  return {
    ...actual,
    withBoClient: vi.fn(),
    createBoRequestState: vi.fn(() => actual.createBoRequestState()),
  };
});

vi.mock("@/convex/marketplaces/brickowl/ids", () => ({
  generateCorrelationId: vi.fn(() => "corr-123"),
}));

vi.mock("@/convex/lib/external/metrics", () => ({
  recordMetric: vi.fn(),
}));

vi.mock("@/convex/marketplaces/brickowl/errors", () => ({
  normalizeBoStoreError: vi.fn(),
}));

vi.mock("@/convex/marketplaces/brickowl/inventory/bulk", () => ({
  executeBulkRequests: vi.fn(),
}));

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createInventory,
  deleteInventory,
  getInventory,
  listInventories,
  bulkCreateInventories,
  updateInventory,
  bulkDeleteInventories,
} from "@/convex/marketplaces/brickowl/inventory/actions";
import type { BOInventoryResponse } from "@/convex/marketplaces/brickowl/inventory/schema";
import type { StoreOperationResult } from "@/convex/marketplaces/shared/storeTypes";
import {
  createBoRequestState,
  withBoClient,
  type BOClient,
} from "@/convex/marketplaces/brickowl/client";
import { generateCorrelationId } from "@/convex/marketplaces/brickowl/ids";
import { recordMetric } from "@/convex/lib/external/metrics";
import { normalizeBoStoreError } from "@/convex/marketplaces/brickowl/errors";
import { executeBulkRequests } from "@/convex/marketplaces/brickowl/inventory/bulk";

type MockedClient = Pick<BOClient, "requestWithRetry"> & {
  requestWithRetry: ReturnType<typeof vi.fn>;
};

const businessAccountId = "ba-test" as Id<"businessAccounts">;
const ctx = {} as ActionCtx;

const sampleInventory: BOInventoryResponse = {
  lot_id: "lot-123",
  boid: "3001-1",
  quantity: "5",
  price: "1.50",
  condition: "new",
  personal_note: "A-01",
  external_id_1: "convex-1",
};

const withBoClientMock = vi.mocked(withBoClient);
const recordMetricMock = vi.mocked(recordMetric);
const normalizeBoStoreErrorMock = vi.mocked(normalizeBoStoreError);
const executeBulkRequestsMock = vi.mocked(executeBulkRequests);
const generateCorrelationIdMock = vi.mocked(generateCorrelationId);
const createBoRequestStateMock = vi.mocked(createBoRequestState);

function mockWithClient(client: MockedClient) {
  withBoClientMock.mockImplementation(async (_ctx, { fn }) => {
    return await fn(client as unknown as BOClient);
  });
}

function createMockClient(): MockedClient {
  return {
    requestWithRetry: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateCorrelationIdMock.mockReturnValue("corr-123");
});

describe("listInventories", () => {
  it("delegates to BrickOwl client and validates the response payloads", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValue([sampleInventory]);
    mockWithClient(client);

    const result = await listInventories(ctx, {
      businessAccountId,
      filters: {
        active_only: 0,
        external_id_1: "convex-1",
      },
    });

    expect(withBoClientMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ businessAccountId }),
    );
    expect(client.requestWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/inventory/list",
        method: "GET",
        query: {
          active_only: "0",
          external_id_1: "convex-1",
        },
        isIdempotent: true,
      }),
    );
    expect(result).toEqual([sampleInventory]);
  });

  it("normalizes nullable numeric fields and array tier pricing payloads", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValue([
      {
        ...sampleInventory,
        my_cost: null,
        lot_weight: null,
        tier_price: ["100:0.05", "200:0.04"],
      },
    ]);
    mockWithClient(client);

    const result = await listInventories(ctx, {
      businessAccountId,
    });

    expect(result).toHaveLength(1);
    expect(result[0].my_cost).toBeNull();
    expect(result[0].lot_weight).toBeNull();
    expect(result[0].tier_price).toBe("100:0.05,200:0.04");
  });

  it("accepts external_lot_ids returned as an array", async () => {
    const client = createMockClient();
    const externalLotIds = [
      "bricklink:12345",
      {
        provider: "eBay",
        id: "abc",
      },
    ];
    client.requestWithRetry.mockResolvedValue([
      {
        ...sampleInventory,
        external_lot_ids: externalLotIds,
      },
    ]);
    mockWithClient(client);

    const result = await listInventories(ctx, {
      businessAccountId,
    });

    expect(result).toHaveLength(1);
    expect(result[0].external_lot_ids).toEqual(externalLotIds);
  });
});

describe("getInventory", () => {
  it("returns the matching inventory item when BrickOwl responds", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValue([sampleInventory]);
    mockWithClient(client);

    const result = await getInventory(ctx, {
      businessAccountId,
      identifier: { lotId: "lot-123" },
    });

    expect(client.requestWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          active_only: "1",
          lot_id: "lot-123",
        },
      }),
    );
    expect(result).toEqual(sampleInventory);
  });

  it("throws when the requested inventory lot cannot be found", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValue([]);
    mockWithClient(client);

    await expect(
      getInventory(ctx, { businessAccountId, identifier: { lotId: "missing-lot" } }),
    ).rejects.toThrow("Inventory lot missing-lot not found on BrickOwl");
  });
});

describe("createInventory", () => {
  const payload = {
    boid: "3001-1",
    quantity: 5,
    price: 1.5,
    condition: "new",
    personal_note: "A-01",
  } as const;

  it("returns a synthetic result when invoked in dry-run mode", async () => {
    const result = await createInventory(ctx, {
      businessAccountId,
      payload,
      options: { dryRun: true },
    });

    expect(withBoClientMock).not.toHaveBeenCalled();
    expect(result).toEqual<StoreOperationResult>({
      success: true,
      marketplaceId: "dry-run-lot-id",
      correlationId: "corr-123",
      rollbackData: {
        originalPayload: payload,
      },
    });
  });

  it("creates an inventory lot and records success metrics", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValue(sampleInventory);
    mockWithClient(client);

    const result = await createInventory(ctx, {
      businessAccountId,
      payload,
      options: { idempotencyKey: "idem-1" },
    });

    expect(createBoRequestStateMock).toHaveBeenCalled();
    expect(client.requestWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/inventory/create",
        method: "POST",
        body: payload,
        correlationId: "corr-123",
        idempotencyKey: "idem-1",
        isIdempotent: true,
      }),
      expect.any(Object),
    );
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/create",
      method: "POST",
      status: "success",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: true,
      marketplaceId: "lot-123",
      correlationId: "corr-123",
      rollbackData: {
        originalPayload: payload,
      },
    });
  });

  it("normalizes errors, records failure metrics, and returns a failure result", async () => {
    const client = createMockClient();
    const upstreamError = new Error("boom");
    const normalizedError = {
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryable: true,
    };
    client.requestWithRetry.mockRejectedValue(upstreamError);
    mockWithClient(client);
    normalizeBoStoreErrorMock.mockReturnValueOnce(normalizedError);

    const result = await createInventory(ctx, {
      businessAccountId,
      payload,
    });

    expect(normalizeBoStoreErrorMock).toHaveBeenCalledWith(upstreamError);
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/create",
      method: "POST",
      status: "failure",
      errorCode: "RATE_LIMITED",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: false,
      correlationId: "corr-123",
      error: normalizedError,
    });
  });
});

describe("updateInventory", () => {
  const payload = {
    absolute_quantity: 10,
    price: 2.25,
    personal_note: "B-02",
  } as const;

  it("applies updates, returns rollback data, and records metrics", async () => {
    const client = createMockClient();
    const currentInventory: BOInventoryResponse = {
      ...sampleInventory,
      quantity: "4",
      personal_note: "A-01",
      price: "1.50",
    };
    client.requestWithRetry
      .mockResolvedValueOnce([currentInventory])
      .mockResolvedValueOnce({ ...sampleInventory, lot_id: "lot-123" });
    mockWithClient(client);

    const result = await updateInventory(ctx, {
      businessAccountId,
      identifier: { lotId: "lot-123" },
      payload,
    });

    expect(client.requestWithRetry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/inventory/list",
        query: {
          active_only: "1",
          lot_id: "lot-123",
        },
      }),
    );
    expect(client.requestWithRetry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/inventory/update",
        body: {
          lot_id: "lot-123",
          ...payload,
        },
      }),
      undefined,
    );
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/update",
      method: "POST",
      status: "success",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: true,
      marketplaceId: "lot-123",
      correlationId: "corr-123",
      rollbackData: {
        previousQuantity: 4,
        previousPrice: "1.50",
        previousNotes: "A-01",
      },
    });
  });

  it("returns a failure result when the update call throws", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValueOnce([sampleInventory]).mockRejectedValueOnce("oops");
    mockWithClient(client);
    const normalized = { code: "SERVER_ERROR", message: "retry later", retryable: true };
    normalizeBoStoreErrorMock.mockReturnValueOnce(normalized);

    const result = await updateInventory(ctx, {
      businessAccountId,
      identifier: { lotId: "lot-123" },
      payload,
    });

    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/update",
      method: "POST",
      status: "failure",
      errorCode: "SERVER_ERROR",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: false,
      correlationId: "corr-123",
      error: normalized,
    });
  });
});

describe("deleteInventory", () => {
  it("deletes an inventory lot and returns rollback data", async () => {
    const client = createMockClient();
    client.requestWithRetry
      .mockResolvedValueOnce([sampleInventory])
      .mockResolvedValueOnce(undefined);
    mockWithClient(client);

    const result = await deleteInventory(ctx, {
      businessAccountId,
      identifier: { lotId: "lot-123" },
    });

    expect(client.requestWithRetry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: "/inventory/delete",
        body: {
          lot_id: "lot-123",
        },
      }),
      undefined,
    );
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/delete",
      method: "POST",
      status: "success",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: true,
      marketplaceId: "lot-123",
      correlationId: "corr-123",
      rollbackData: {
        originalPayload: sampleInventory,
      },
    });
  });

  it("returns a failure result when the delete call throws", async () => {
    const client = createMockClient();
    client.requestWithRetry.mockResolvedValueOnce([sampleInventory]).mockRejectedValueOnce("bad");
    mockWithClient(client);
    const normalized = { code: "NETWORK", message: "retry", retryable: true };
    normalizeBoStoreErrorMock.mockReturnValueOnce(normalized);

    const result = await deleteInventory(ctx, {
      businessAccountId,
      identifier: { lotId: "lot-123" },
    });

    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: "corr-123",
      endpoint: "/inventory/delete",
      method: "POST",
      status: "failure",
      errorCode: "NETWORK",
    });
    expect(result).toEqual<StoreOperationResult>({
      success: false,
      correlationId: "corr-123",
      error: normalized,
    });
  });
});

describe("bulkCreateInventories", () => {
  const payloads = [
    { boid: "3001-1", quantity: 5, price: 1.5, condition: "new" },
    { boid: "3002-1", quantity: 3, price: 2, condition: "usedn" },
  ] as const;

  it("maps bulk executor responses into StoreOperationResult entries and records metrics", async () => {
    executeBulkRequestsMock.mockResolvedValue({
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { success: true, data: sampleInventory },
        {
          success: false,
          error: { code: "VALIDATION", message: "invalid", retryable: false },
        },
      ],
      errors: [],
    });

    const results = await bulkCreateInventories(ctx, {
      businessAccountId,
      payloads: [...payloads],
    });

    expect(executeBulkRequestsMock).toHaveBeenCalledWith(ctx, {
      businessAccountId,
      requests: [
        { endpoint: "inventory/create", request_method: "POST", params: [payloads[0]] },
        { endpoint: "inventory/create", request_method: "POST", params: [payloads[1]] },
      ],
      options: {},
    });

    const [successResult, failureResult] = results;
    expect(successResult).toMatchObject({
      success: true,
      marketplaceId: "lot-123",
      rollbackData: {
        originalPayload: payloads[0],
      },
    });
    expect(failureResult).toEqual({
      success: false,
      correlationId: expect.any(String),
      error: { code: "VALIDATION", message: "invalid", retryable: false },
    });

    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: successResult.correlationId,
      endpoint: "/bulk/batch",
      method: "POST",
      status: "success",
    });
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: failureResult.correlationId,
      endpoint: "/bulk/batch",
      method: "POST",
      status: "failure",
      errorCode: "VALIDATION",
    });
  });
});

describe("bulkDeleteInventories", () => {
  it("gracefully handles success responses without payload and records metrics", async () => {
    executeBulkRequestsMock.mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ success: true }],
      errors: [],
    });

    const results = await bulkDeleteInventories(ctx, {
      businessAccountId,
      identifiers: [{ lotId: "lot-123" }],
    });

    const [result] = results;
    expect(result).toMatchObject({
      success: true,
      marketplaceId: "lot-123",
      correlationId: expect.any(String),
    });
    expect(recordMetricMock).toHaveBeenCalledWith("external.brickowl.inventory", {
      businessAccountId,
      correlationId: result.correlationId,
      endpoint: "/bulk/batch",
      method: "POST",
      status: "success",
    });
  });
});
