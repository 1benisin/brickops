import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import * as clientModule from "@/convex/marketplaces/bricklink/transport";
import {
  makeBlRequest,
  withBlClient,
  makeBlCatalogRequest,
} from "@/convex/marketplaces/bricklink/transport";
import { executeBlRequest } from "@/convex/marketplaces/bricklink/request";
import { getBlCredentials } from "@/convex/marketplaces/bricklink/credentials";
import { normalizeBlCredentials } from "@/convex/marketplaces/bricklink/credentials";
import { requireActiveUser } from "@/convex/users/authorization";
import { recordMetric } from "@/convex/lib/external/metrics";
import { normalizeApiError } from "@/convex/lib/external/types";
import { getBlCredentials as getEnvBlCredentials } from "@/convex/lib/external/env";
import { blAccountBucket } from "@/convex/marketplaces/bricklink/rateLimit";
import { parseBlEnvelope } from "@/convex/marketplaces/bricklink/envelope";
import { generateCorrelationId } from "@/convex/marketplaces/bricklink/ids";

vi.mock("@/convex/marketplaces/bricklink/request", () => {
  return {
    executeBlRequest: vi.fn(),
    withDefaultHeaders: vi.fn((headers: Record<string, string> | undefined, correlationId: string) => {
      const merged = new Headers({
        Accept: "application/json",
        "User-Agent": "BrickOps/1.0",
        "X-Correlation-Id": correlationId,
      });

      if (headers) {
        Object.entries(headers).forEach(([key, value]) => merged.set(key, value));
      }

      return merged;
    }),
    isActionCtx: vi.fn((candidate: unknown) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }
      const ctx = candidate as Partial<ActionCtx>;
      return typeof ctx.runQuery === "function" && typeof ctx.runMutation === "function";
    }),
  };
});

vi.mock("@/convex/marketplaces/bricklink/credentials", () => ({
  getBlCredentials: vi.fn(),
  normalizeBlCredentials: vi.fn(),
}));

vi.mock("@/convex/users/authorization", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("@/convex/lib/external/metrics", () => ({
  recordMetric: vi.fn(),
}));

vi.mock("@/convex/lib/external/types", () => ({
  normalizeApiError: vi.fn(),
}));

vi.mock("@/convex/lib/external/env", () => ({
  getBlCredentials: vi.fn(),
}));

vi.mock("@/convex/marketplaces/bricklink/rateLimit", () => ({
  blAccountBucket: vi.fn(),
}));

vi.mock("@/convex/marketplaces/bricklink/envelope", () => ({
  parseBlEnvelope: vi.fn(),
}));

vi.mock("@/convex/marketplaces/bricklink/ids", () => ({
  generateCorrelationId: vi.fn(),
}));

const executeBlRequestMock = vi.mocked(executeBlRequest);
const getBlCredentialsMock = vi.mocked(getBlCredentials);
const normalizeBlCredentialsMock = vi.mocked(normalizeBlCredentials);
const requireActiveUserMock = vi.mocked(requireActiveUser);
const recordMetricMock = vi.mocked(recordMetric);
const normalizeApiErrorMock = vi.mocked(normalizeApiError);
const getEnvBlCredentialsMock = vi.mocked(getEnvBlCredentials);
const blAccountBucketMock = vi.mocked(blAccountBucket);
const parseBlEnvelopeMock = vi.mocked(parseBlEnvelope);
const generateCorrelationIdMock = vi.mocked(generateCorrelationId);

type Envelope<T> = {
  meta: { code: number; message?: string; description?: string };
  data: T;
};

type ExecuteResponse<T> = {
  ok: boolean;
  status: number;
  data: Envelope<T> | undefined;
  headers: Headers;
  correlationId: string;
  durationMs: number;
  attempts?: number;
  throttle?: { limit: number; remaining: number; resetAt: number };
  oauth?: { header: string };
  rawBody: string | null;
};

const sampleCredentials = {
  consumerKey: "ck",
  consumerSecret: "cs",
  tokenValue: "tv",
  tokenSecret: "ts",
};

const buildExecuteResponse = <T>(
  overrides: Partial<ExecuteResponse<T>> = {},
): ExecuteResponse<T> => ({
  ok: true,
  status: 200,
  data: {
    meta: { code: 200, message: "OK" },
    data: { payload: true } as unknown as T,
  },
  headers: new Headers(),
  correlationId: overrides.correlationId ?? "corr-generated",
  durationMs: 15,
  attempts: 1,
  throttle: undefined,
  oauth: undefined,
  rawBody: '{"meta":{"code":200},"data":{"payload":true}}',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();

  generateCorrelationIdMock.mockReturnValue("corr-123");

  executeBlRequestMock.mockResolvedValue(buildExecuteResponse());

  parseBlEnvelopeMock.mockImplementation((raw: Envelope<unknown>) => raw);

  getBlCredentialsMock.mockResolvedValue(sampleCredentials);
  normalizeBlCredentialsMock.mockImplementation((raw) => ({
    consumerKey: raw.consumerKey?.trim() ?? "",
    consumerSecret: raw.consumerSecret?.trim() ?? "",
    tokenValue: raw.tokenValue?.trim() ?? "",
    tokenSecret: raw.tokenSecret?.trim() ?? "",
  }));
  getEnvBlCredentialsMock.mockReturnValue({
    consumerKey: "env-ck",
    consumerSecret: "env-cs",
    accessToken: "env-tv",
    tokenSecret: "env-ts",
  });

  blAccountBucketMock.mockImplementation((businessAccountId: Id<"businessAccounts">) => {
    return `bricklink:account:${businessAccountId}`;
  });

  normalizeApiErrorMock.mockImplementation((provider, error, context) => ({
    provider,
    error,
    context,
  }));
});

describe("makeBlRequest", () => {
  it("fetches credentials via active user and applies default rate limit", async () => {
    const identity = { tokenIdentifier: "token" };
    const runQuery = vi.fn();
    const ctx = {
      runQuery,
      runMutation: vi.fn(),
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue(identity),
      },
    } as unknown as ActionCtx;
    const businessAccountId = "ba_1" as Id<"businessAccounts">;

    const activeUserContext = { businessAccountId } as unknown as Awaited<
      ReturnType<typeof requireActiveUser>
    >;
    requireActiveUserMock.mockResolvedValue(activeUserContext);

    const result = await makeBlRequest(ctx, { path: "/colors" });

    expect(requireActiveUserMock).toHaveBeenCalledWith(ctx);
    expect(getBlCredentialsMock).toHaveBeenCalledWith(
      ctx,
      businessAccountId,
      expect.objectContaining({
        allowSystemAccess: false,
        identity,
        activeUserContext,
      }),
    );
    expect(blAccountBucketMock).toHaveBeenCalledWith(businessAccountId);

    expect(executeBlRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/colors",
        credentials: sampleCredentials,
        correlationId: "corr-123",
        rateLimit: {
          provider: "bricklink",
          bucket: "bricklink:account:ba_1",
        },
      }),
    );

    expect(result.data).toEqual({
      meta: { code: 200, message: "OK" },
      data: { payload: true },
    });
    expect(result.correlationId).toBe("corr-123");
  });

  it("throws a ConvexError when no business account is available", async () => {
    const identity = { tokenIdentifier: "token" };
    const ctx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue(identity),
      },
    } as unknown as ActionCtx;

    requireActiveUserMock.mockResolvedValue({ businessAccountId: undefined });

    await expect(makeBlRequest(ctx, { path: "/parts" })).rejects.toMatchObject({
      data: { code: "BUSINESS_ACCOUNT_REQUIRED" },
    });

    expect(executeBlRequestMock).not.toHaveBeenCalled();
    expect(getBlCredentialsMock).not.toHaveBeenCalled();
  });

  it("allows system contexts to provide a business account without requiring an identity", async () => {
    const getUserIdentity = vi.fn().mockResolvedValue(null);
    const ctx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity },
    } as unknown as ActionCtx;
    const businessAccountId = "ba_system" as Id<"businessAccounts">;

    await makeBlRequest(ctx, { path: "/notifications", businessAccountId });

    expect(getUserIdentity).toHaveBeenCalled();
    expect(requireActiveUserMock).not.toHaveBeenCalled();
    expect(getBlCredentialsMock).toHaveBeenCalledWith(
      ctx,
      businessAccountId,
      expect.objectContaining({
        allowSystemAccess: true,
        identity: null,
        activeUserContext: undefined,
      }),
    );
  });

  it("uses provided credentials, correlation id, and rate limit overrides", async () => {
    const getUserIdentity = vi.fn();
    const ctx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity },
    } as unknown as ActionCtx;
    const customCorrelationId = "corr-custom";
    const customRateLimit = { bucket: "custom-bucket" };
    const providedCredentials = {
      consumerKey: "override-ck",
      consumerSecret: "override-cs",
      tokenValue: "override-tv",
      tokenSecret: "override-ts",
    };

    const result = await makeBlRequest(ctx, {
      path: "/inventory",
      correlationId: customCorrelationId,
      rateLimit: customRateLimit,
      credentials: providedCredentials,
    });

    expect(requireActiveUserMock).not.toHaveBeenCalled();
    expect(getUserIdentity).not.toHaveBeenCalled();
    expect(getBlCredentialsMock).not.toHaveBeenCalled();

    expect(executeBlRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: customCorrelationId,
        credentials: providedCredentials,
        rateLimit: customRateLimit,
      }),
    );

    expect(result.correlationId).toBe(customCorrelationId);
  });

  it("throws INVALID_RESPONSE when BrickLink returns an empty body", async () => {
    const getUserIdentity = vi.fn();
    const ctx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity },
    } as unknown as ActionCtx;
    const providedCredentials = sampleCredentials;

    executeBlRequestMock.mockResolvedValueOnce(
      buildExecuteResponse({
        data: undefined,
        status: 204,
        rawBody: null,
      }),
    );

    await expect(
      makeBlRequest(ctx, { path: "/colors", credentials: providedCredentials }),
    ).rejects.toMatchObject({
      data: {
        code: "INVALID_RESPONSE",
        httpStatus: 204,
        correlationId: "corr-123",
      },
    });

    expect(parseBlEnvelopeMock).not.toHaveBeenCalled();
  });

  it("wraps BrickLink error envelopes as ConvexErrors with retry metadata", async () => {
    const getUserIdentity = vi.fn();
    const ctx = {
      runQuery: vi.fn(),
      runMutation: vi.fn(),
      auth: { getUserIdentity },
    } as unknown as ActionCtx;
    const providedCredentials = sampleCredentials;
    const throttle = { limit: 10, remaining: 0, resetAt: Date.now() + 1000 };

    executeBlRequestMock.mockResolvedValueOnce(
      buildExecuteResponse({
        ok: false,
        status: 503,
        headers: new Headers({ "Retry-After": "7" }),
        throttle,
        oauth: { header: "OAuth realm=\"bricklink\"" },
      }),
    );

    parseBlEnvelopeMock.mockReturnValueOnce({
      meta: { code: 503, message: "Down", description: "Maintenance" },
      data: null,
    });

    await expect(
      makeBlRequest(ctx, { path: "/orders", credentials: providedCredentials }),
    ).rejects.toMatchObject({
      data: {
        code: "503",
        message: "Down",
        httpStatus: 503,
        retryAfterMs: 7000,
        details: {
          description: "Maintenance",
          throttle,
          rawBody: '{"meta":{"code":200},"data":{"payload":true}}',
          oauth: { header: 'OAuth realm="bricklink"' },
        },
      },
    });
  });
});

describe("withBlClient", () => {
  it("injects the provided business account into makeBlRequest calls", async () => {
    const identity = { tokenIdentifier: "token" };
    const runQuery = vi.fn();
    const ctx = {
      runQuery,
      runMutation: vi.fn(),
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue(identity),
      },
    } as unknown as ActionCtx;
    const businessAccountId = "ba-client" as Id<"businessAccounts">;
    const activeUserContext = { businessAccountId } as unknown as Awaited<
      ReturnType<typeof requireActiveUser>
    >;
    requireActiveUserMock.mockResolvedValue(activeUserContext);
    const fn = vi.fn(async (client: clientModule.BLClient) => {
      await client.request({ path: "/colors" });
    });

    await clientModule.withBlClient(ctx, { businessAccountId, fn });

    expect(fn).toHaveBeenCalled();
    expect(requireActiveUserMock).toHaveBeenCalled();
    expect(getBlCredentialsMock).toHaveBeenCalledWith(
      ctx,
      businessAccountId,
      expect.objectContaining({
        allowSystemAccess: false,
        identity,
        activeUserContext,
      }),
    );
  });
});

describe("makeBlCatalogRequest", () => {
  it("records success metrics and returns the response envelope", async () => {
    const credentials = sampleCredentials;
    const responseHeaders = new Headers({ "x-correlation": "foo" });

    executeBlRequestMock.mockResolvedValueOnce(
      buildExecuteResponse({
        headers: responseHeaders,
        durationMs: 25,
      }),
    );

    parseBlEnvelopeMock.mockReturnValueOnce({
      meta: { code: 200 },
      data: { color_id: 21 },
    });

    const result = await makeBlCatalogRequest(
      undefined,
      { path: "/colors/21" },
      { credentials },
    );

    expect(recordMetricMock).toHaveBeenCalledWith("external.bricklink.catalog.request", {
      ok: true,
      status: 200,
      operation: "/colors/21",
      method: "GET",
      durationMs: expect.any(Number),
      correlationId: "corr-123",
    });

    expect(result.data).toEqual({
      meta: { code: 200 },
      data: { color_id: 21 },
    });
  });

  it("records failure metrics and normalizes errors when performBlRequest throws", async () => {
    const credentials = sampleCredentials;
    const throttle = { limit: 5, remaining: 0, resetAt: Date.now() + 500 };
    const syntheticError = new ConvexError({
      code: "500",
      httpStatus: 500,
      correlationId: "corr-err",
      details: { rawBody: "oops" },
    });
    const normalizedError = { error: { code: "NORMALIZED" } };

    executeBlRequestMock.mockResolvedValueOnce(
      buildExecuteResponse({
        ok: false,
        status: 500,
        throttle,
      }),
    );
    parseBlEnvelopeMock.mockReturnValueOnce({
      meta: { code: 500, message: "fail" },
      data: null,
    });

    normalizeApiErrorMock.mockReturnValueOnce(normalizedError);

    const promise = makeBlCatalogRequest(
      undefined,
      { path: "/colors/21" },
      { credentials },
    );

    await expect(promise).rejects.toBe(normalizedError);

    expect(recordMetricMock).toHaveBeenCalledWith(
      "external.bricklink.catalog.request",
      expect.objectContaining({
        ok: false,
        operation: "/colors/21",
        method: "GET",
        durationMs: expect.any(Number),
        correlationId: expect.any(String),
      }),
    );

    expect(normalizeApiErrorMock).toHaveBeenCalledWith(
      "bricklink",
      expect.any(ConvexError),
      expect.objectContaining({
        endpoint: "/colors/21",
        body: undefined,
        correlationId: expect.any(String),
      }),
    );
    const [, , normalizedContext] = normalizeApiErrorMock.mock.calls.at(-1)!;
    expect(normalizedContext.status).toBeUndefined();
  });

  it("loads catalog credentials from ctx.env.get when overrides are not provided", async () => {
    const envValues: Record<string, string | undefined> = {
      BRICKLINK_CONSUMER_KEY: "  ck ",
      BRICKLINK_CONSUMER_SECRET: " cs ",
      BRICKLINK_ACCESS_TOKEN: " tv ",
      BRICKLINK_TOKEN_SECRET: " ts ",
    };
    const envCtx = {
      env: {
        get: vi.fn(async (key: string) => envValues[key]),
      },
    };

    executeBlRequestMock.mockResolvedValueOnce(buildExecuteResponse());
    parseBlEnvelopeMock.mockReturnValueOnce({
      meta: { code: 200 },
      data: {},
    });

    await makeBlCatalogRequest(envCtx, { path: "/colors" });

    expect(envCtx.env.get).toHaveBeenCalledTimes(4);
    expect(normalizeBlCredentialsMock).toHaveBeenCalledWith({
      consumerKey: "  ck ",
      consumerSecret: " cs ",
      tokenValue: " tv ",
      tokenSecret: " ts ",
    });
    expect(getEnvBlCredentialsMock).not.toHaveBeenCalled();
  });

  it("falls back to environment credentials when ctx.env is unavailable", async () => {
    executeBlRequestMock.mockResolvedValueOnce(buildExecuteResponse());
    parseBlEnvelopeMock.mockReturnValueOnce({
      meta: { code: 200 },
      data: {},
    });

    await makeBlCatalogRequest(undefined, { path: "/colors" });

    expect(getEnvBlCredentialsMock).toHaveBeenCalled();
    expect(normalizeBlCredentialsMock).toHaveBeenCalledWith({
      consumerKey: "env-ck",
      consumerSecret: "env-cs",
      tokenValue: "env-tv",
      tokenSecret: "env-ts",
    });
  });
});

