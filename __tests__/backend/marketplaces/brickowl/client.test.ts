import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_RETRY_POLICY,
  createBoRequestState,
  makeBoRequest,
  withBoClient,
} from "@/convex/marketplaces/brickowl/client";
import { getBrickOwlCredentials } from "@/convex/marketplaces/brickowl/credentials";
import { generateCorrelationId } from "@/convex/marketplaces/brickowl/ids";
import * as requestModule from "@/convex/marketplaces/brickowl/request";
import { upstreamRequest } from "@/convex/lib/upstreamRequest";
import type { UpstreamResponse } from "@/convex/lib/upstreamRequest";

vi.mock("@/convex/marketplaces/brickowl/credentials", () => ({
  getBrickOwlCredentials: vi.fn(),
}));

vi.mock("@/convex/marketplaces/brickowl/ids", () => ({
  generateCorrelationId: vi.fn(),
}));

vi.mock("@/convex/lib/upstreamRequest", () => ({
  upstreamRequest: vi.fn(),
}));

const upstreamRequestMock = vi.mocked(upstreamRequest);
const getBrickOwlCredentialsMock = vi.mocked(getBrickOwlCredentials);
const generateCorrelationIdMock = vi.mocked(generateCorrelationId);

const buildResponse = <T>(overrides: Partial<UpstreamResponse<T>> & { data?: T } = {}): UpstreamResponse<T> => {
  return {
    ok: true,
    status: 200,
    data: (overrides.data ?? ({ ok: true } as unknown as T)),
    rawBody: JSON.stringify(overrides.data ?? { ok: true }),
    headers: new Headers(),
    attempts: 1,
    durationMs: 12,
    throttle: undefined,
    oauth: undefined,
    ...overrides,
  };
};

const createCtx = (): ActionCtx =>
  ({
    runQuery: vi.fn(),
    runMutation: vi.fn(),
    scheduler: { runAfter: vi.fn(), runAt: vi.fn() },
    auth: {
      getUserIdentity: vi.fn(),
    },
  }) as unknown as ActionCtx;

const businessAccountId = "ba-test" as Id<"businessAccounts">;

beforeEach(() => {
  vi.clearAllMocks();

  getBrickOwlCredentialsMock.mockResolvedValue({ apiKey: "valid-api-key" });
  generateCorrelationIdMock.mockReturnValue("corr-123");
  upstreamRequestMock.mockResolvedValue(buildResponse());
});

describe("createBoRequestState", () => {
  it("returns a state object with a writable cache map", () => {
    const state = createBoRequestState();

    expect(state.cache).toBeInstanceOf(Map);
    state.cache?.set("foo", "bar");
    expect(state.cache?.get("foo")).toBe("bar");
  });
});

describe("makeBoRequest", () => {
  it("fetches credentials, normalizes query, and forwards to upstreamRequest", async () => {
    const ctx = createCtx();
    const normalizeSpy = vi.spyOn(requestModule, "normalizeBoQuery");
    const rateLimitSpy = vi.spyOn(requestModule, "buildBoRateLimitOptions");
    const bodySpy = vi.spyOn(requestModule, "buildBoRequestBody");
    const headersSpy = vi.spyOn(requestModule, "buildBoDefaultHeaders");

    const result = await makeBoRequest(ctx, businessAccountId, {
      path: "/inventory/list",
      method: "GET",
      query: { per_page: 50, active_only: 1 },
    });

    expect(result).toEqual({ ok: true });

    expect(getBrickOwlCredentialsMock).toHaveBeenCalledWith(ctx, businessAccountId);

    expect(normalizeSpy).toHaveBeenCalledWith({ per_page: 50, active_only: 1 });
    expect(rateLimitSpy).toHaveBeenCalledWith(businessAccountId);
    expect(bodySpy).toHaveBeenCalledWith("GET", undefined);
    expect(headersSpy).toHaveBeenCalledWith("corr-123");

    expect(upstreamRequestMock).toHaveBeenCalledWith({
      ctx,
      baseUrl: requestModule.BO_BASE_URL,
      path: "/inventory/list",
      method: "GET",
      query: {
        per_page: "50",
        active_only: "1",
      },
      body: undefined,
      headers: {
        "User-Agent": requestModule.BO_USER_AGENT,
        "X-Correlation-Id": "corr-123",
      },
      auth: {
        kind: "apiKey",
        value: "valid-api-key",
        query: {
          name: "key",
          methods: ["GET"],
        },
        formField: {
          name: "key",
          methods: ["POST"],
        },
      },
      rateLimit: {
        provider: "brickowl",
        bucket: `brickowl:account:${businessAccountId}`,
      },
      retry: undefined,
      expectJson: true,
      onAttempt: undefined,
    });

    normalizeSpy.mockRestore();
    rateLimitSpy.mockRestore();
    bodySpy.mockRestore();
    headersSpy.mockRestore();
  });

  it("converts retry policy overrides into upstream retry configuration", async () => {
    const ctx = createCtx();

    await makeBoRequest(ctx, businessAccountId, {
      path: "/inventory/update",
      method: "POST",
      body: { lot_id: "1234" },
      retryPolicy: {
        maxRetries: 2,
        initialDelayMs: 150,
        maxDelayMs: 2000,
        backoffMultiplier: 4,
      },
      onAttempt: vi.fn(),
    });

    expect(upstreamRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        retry: {
          attempts: 3,
          baseDelayMs: 150,
          maxDelayMs: 2000,
          retryStatuses: [408, 425, 429, 500, 502, 503, 504],
        },
      }),
    );
  });

  it("reuses cached responses when an idempotency key is provided", async () => {
    const ctx = createCtx();
    const state = createBoRequestState();
    const payload = { lot_id: "foo" };

    upstreamRequestMock.mockResolvedValueOnce(buildResponse({ data: payload }));

    const first = await makeBoRequest(
      ctx,
      businessAccountId,
      {
        path: "/inventory/create",
        method: "POST",
        body: payload,
        idempotencyKey: "idem-123",
      },
      state,
    );

    expect(upstreamRequestMock).toHaveBeenCalledTimes(1);
    expect(state.cache?.get("idem-123")).toEqual(payload);

    const second = await makeBoRequest(
      ctx,
      businessAccountId,
      {
        path: "/inventory/create",
        method: "POST",
        body: payload,
        idempotencyKey: "idem-123",
      },
      state,
    );

    expect(upstreamRequestMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("throws a ConvexError with structured payload when upstreamRequest fails", async () => {
    const ctx = createCtx();

    upstreamRequestMock.mockResolvedValueOnce(
      buildResponse({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "5" }),
        data: { error: "too many requests" },
      }),
    );

    await expect(
      makeBoRequest(ctx, businessAccountId, {
        path: "/inventory/list",
      }),
    ).rejects.toMatchObject({
      data: {
        code: "RATE_LIMITED",
        message: "BrickOwl rate limit reached. Please retry later.",
        httpStatus: 429,
        endpoint: "/inventory/list",
        correlationId: "corr-123",
        retryAfterMs: 5000,
      },
    });
  });
});

describe("withBoClient", () => {
  it("invokes makeBoRequest with the provided business account id", async () => {
    const ctx = createCtx();
    upstreamRequestMock.mockClear();

    const fn = vi.fn(async (client: { request: (options: { path: string }) => Promise<unknown> }) => {
      await client.request({ path: "/inventory/list" });
    });

    await withBoClient(ctx, {
      businessAccountId,
      fn,
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(upstreamRequestMock).toHaveBeenCalledTimes(1);
    expect(getBrickOwlCredentialsMock).toHaveBeenCalledWith(ctx, businessAccountId);
    const [requestOptions] = upstreamRequestMock.mock.calls[0] ?? [];
    expect(requestOptions?.path).toBe("/inventory/list");
  });

  it("applies default correlation id to nested requests", async () => {
    const ctx = createCtx();
    upstreamRequestMock.mockClear();

    await withBoClient(ctx, {
      businessAccountId,
      correlationId: "corr-default",
      fn: async (client) => {
        await client.request({ path: "/inventory/list" });
        await client.request({ path: "/inventory/list", correlationId: "explicit-corr" });
        await client.requestWithRetry({
          path: "/inventory/list",
          retryPolicy: { maxRetries: 5 },
        });
      },
    });

    expect(upstreamRequestMock).toHaveBeenCalledTimes(3);

    const firstCall = upstreamRequestMock.mock.calls[0]?.[0];
    const secondCall = upstreamRequestMock.mock.calls[1]?.[0];
    const thirdCall = upstreamRequestMock.mock.calls[2]?.[0];

    expect(firstCall?.headers?.["X-Correlation-Id"]).toBe("corr-default");
    expect(secondCall?.headers?.["X-Correlation-Id"]).toBe("explicit-corr");
    expect(thirdCall?.headers?.["X-Correlation-Id"]).toBe("corr-default");
    expect(thirdCall?.retry).toEqual({
      attempts: 6,
      baseDelayMs: DEFAULT_RETRY_POLICY.initialDelayMs,
      maxDelayMs: DEFAULT_RETRY_POLICY.maxDelayMs,
      retryStatuses: [408, 425, 429, 500, 502, 503, 504],
    });
  });
});

