import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import {
  executeBlRequest,
  withDefaultHeaders,
} from "@/convex/marketplaces/bricklink/request";
import type { BLOAuthCredentials } from "@/convex/marketplaces/bricklink/credentials";
import { upstreamRequest } from "@/convex/lib/upstreamRequest";
import {
  buildAuthorizationHeader,
  generateOAuthParams,
  generateOAuthSignature,
} from "@/convex/marketplaces/bricklink/oauth";
import { generateCorrelationId } from "@/convex/marketplaces/bricklink/ids";

vi.mock("@/convex/lib/upstreamRequest", () => ({
  upstreamRequest: vi.fn(),
}));

vi.mock("@/convex/marketplaces/bricklink/ids", () => ({
  generateCorrelationId: vi.fn(),
}));

vi.mock("@/convex/marketplaces/bricklink/oauth", () => ({
  buildAuthorizationHeader: vi.fn(),
  generateOAuthParams: vi.fn(),
  generateOAuthSignature: vi.fn(),
}));

const upstreamRequestMock = vi.mocked(upstreamRequest);
const generateCorrelationIdMock = vi.mocked(generateCorrelationId);
const generateOAuthParamsMock = vi.mocked(generateOAuthParams);
const generateOAuthSignatureMock = vi.mocked(generateOAuthSignature);
const buildAuthorizationHeaderMock = vi.mocked(buildAuthorizationHeader);

const credentials: BLOAuthCredentials = {
  consumerKey: "ck",
  consumerSecret: "cs",
  tokenValue: "tv",
  tokenSecret: "ts",
};

describe("BrickLink request helpers", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("withDefaultHeaders", () => {
    it("merges defaults with caller-provided headers and correlation id", () => {
      const headers = withDefaultHeaders(
        {
          Accept: "text/plain",
          "X-Extra": "123",
        },
        "corr-1",
      );

      expect(headers.get("Accept")).toBe("text/plain");
      expect(headers.get("User-Agent")).toBe("BrickOps/1.0");
      expect(headers.get("X-Correlation-Id")).toBe("corr-1");
      expect(headers.get("X-Extra")).toBe("123");
    });
  });

  describe("executeBlRequest", () => {
    it("delegates to upstreamRequest when an Action context is provided", async () => {
      const ctx = { runQuery: vi.fn(), runMutation: vi.fn() } as unknown as ActionCtx;
      const onAttempt = vi.fn();
      const rateLimit = { bucket: "bricklink:account:123" };
      const retry = { maxAttempts: 2 };

      generateCorrelationIdMock.mockReturnValue("corr-action");
      upstreamRequestMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { meta: true },
        headers: new Headers({ "x-test": "200" }),
        durationMs: 42,
        attempts: 2,
        throttle: { limit: 10, remaining: 9, resetAt: Date.now() + 1000 },
        oauth: { header: "OAuth realm=\"bricklink\"" },
        rawBody: '{"meta":true}',
      });

      const result = await executeBlRequest({
        ctx,
        credentials,
        path: "/colors/21",
        method: "PUT",
        query: { foo: "bar" },
        headers: { Accept: "text/plain", "X-Extra": "value" },
        body: { sample: true },
        expectJson: false,
        rateLimit,
        onAttempt,
        retry,
      });

      expect(upstreamRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ctx,
          baseUrl: "https://api.bricklink.com/api/store/v1",
          path: "/colors/21",
          method: "PUT",
          query: { foo: "bar" },
          body: { sample: true },
          headers: expect.objectContaining({
            Accept: "text/plain",
            "User-Agent": "BrickOps/1.0",
            "X-Correlation-Id": "corr-action",
            "X-Extra": "value",
          }),
          auth: {
            kind: "oauth1",
            consumerKey: "ck",
            consumerSecret: "cs",
            token: "tv",
            tokenSecret: "ts",
          },
          expectJson: false,
          rateLimit,
          onAttempt,
          retry,
        }),
      );

      expect(result).toMatchObject({
        ok: true,
        status: 200,
        data: { meta: true },
        correlationId: "corr-action",
        durationMs: 42,
        attempts: 2,
        rawBody: '{"meta":true}',
      });
      expect(result.headers).toBeInstanceOf(Headers);
      expect(result.throttle).toEqual(
        expect.objectContaining({ limit: 10, remaining: 9, resetAt: expect.any(Number) }),
      );
      expect(result.oauth).toEqual(expect.objectContaining({ header: expect.stringContaining("OAuth") }));
    });

    it("falls back to fetch when no Action context is provided and signs the request", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        text: vi.fn().mockResolvedValue('{"payload":true}'),
      });
      vi.stubGlobal("fetch", fetchMock);

      generateCorrelationIdMock.mockReturnValue("corr-fetch");
      generateOAuthParamsMock.mockReturnValue({ timestamp: "1234567890", nonce: "nonce" });
      generateOAuthSignatureMock.mockResolvedValue("signature");
      buildAuthorizationHeaderMock.mockReturnValue("OAuth header");

      const result = await executeBlRequest({
        credentials,
        path: "/items/part/3001",
        method: "POST",
        query: { guide_type: "stock", new_or_used: "U", include: undefined, includeBoolean: true },
        headers: { "X-Custom": "one" },
        body: { foo: "bar" },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;

      expect(url).toBe(
        "https://api.bricklink.com/api/store/v1/items/part/3001?guide_type=stock&new_or_used=U&includeBoolean=true",
      );

      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ foo: "bar" }));

      const headerEntries = Array.from((init?.headers as Headers)?.entries() ?? []);
      const headerRecord = Object.fromEntries(headerEntries);
      expect(headerRecord).toMatchObject({
        Accept: "application/json",
        "User-Agent": "BrickOps/1.0",
        "X-Correlation-Id": "corr-fetch",
        Authorization: "OAuth header",
        "X-Custom": "one",
        "Content-Type": "application/json; charset=utf-8",
      });

      expect(generateOAuthSignatureMock).toHaveBeenCalledWith(
        credentials,
        "POST",
        "https://api.bricklink.com/api/store/v1/items/part/3001",
        expect.arrayContaining([
          ["guide_type", "stock"],
          ["new_or_used", "U"],
          ["includeBoolean", "true"],
          ["oauth_consumer_key", "ck"],
          ["oauth_token", "tv"],
          ["oauth_timestamp", "1234567890"],
        ]),
      );

      expect(buildAuthorizationHeaderMock).toHaveBeenCalledWith(credentials, "signature", {
        timestamp: "1234567890",
        nonce: "nonce",
      });

      expect(result).toMatchObject({
        ok: true,
        status: 201,
        data: { payload: true },
        correlationId: "corr-fetch",
        durationMs: 0,
        attempts: 1,
        rawBody: '{"payload":true}',
        throttle: undefined,
        oauth: undefined,
      });
      expect(result.headers).toBeInstanceOf(Headers);
    });
  });
});

