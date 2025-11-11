import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import { upstreamRequest } from "@/convex/lib/upstreamRequest";

const { consumeTokenMock } = vi.hoisted(() => ({
  consumeTokenMock: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  internal: {
    ratelimiter: {
      consumeToken: consumeTokenMock,
    },
  },
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function createCtx(): ActionCtx {
  return {
    runMutation: vi.fn((mutation: unknown, args: unknown) =>
      (mutation as (input: unknown) => unknown)(args),
    ),
  } as unknown as ActionCtx;
}

describe("upstreamRequest", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    consumeTokenMock.mockReset();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("performs a successful JSON request with rate limiting and telemetry", async () => {
    const resetAt = Date.now() + 1000;
    consumeTokenMock.mockResolvedValueOnce({
      granted: true,
      remaining: 42,
      resetAt,
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ foo: "bar" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const onAttempt = vi.fn();

    const result = await upstreamRequest<{ foo: string }>({
      ctx: createCtx(),
      baseUrl: "https://api.example.com",
      path: "/resource",
      method: "GET",
      query: { q: "parts" },
      rateLimit: { provider: "bricklink", bucket: "account:test" },
      auth: { kind: "none" },
      onAttempt,
    });

    expect(consumeTokenMock).toHaveBeenCalledWith({
      provider: "bricklink",
      bucket: "account:test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/resource?q=parts",
      expect.objectContaining({
        method: "GET",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ foo: "bar" });
    expect(result.throttle).toEqual({
      remaining: 42,
      resetAt,
    });
    expect(result.attempts).toBe(1);

    expect(onAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        status: 200,
        rateLimit: expect.objectContaining({
          provider: "bricklink",
          bucket: "account:test",
          granted: true,
        }),
      }),
    );
  });

  it("injects API key into headers, query string, and form body when configured", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = new URLSearchParams({ payload: "value" });

    const result = await upstreamRequest({
      ctx: createCtx(),
      baseUrl: "https://api.example.com",
      path: "/inventory",
      method: "POST",
      auth: {
        kind: "apiKey",
        value: "secret",
        header: { name: "X-API-Key", prefix: "Bearer " },
        query: { name: "key" },
        formField: { name: "key", methods: ["POST"] },
      },
      body,
      expectJson: false,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];

    expect(new URL(requestUrl).searchParams.get("key")).toBe("secret");

    expect(requestInit.headers).toMatchObject({
      "X-API-Key": "Bearer secret",
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const bodyParams = requestInit.body as URLSearchParams;
    expect(bodyParams.get("payload")).toBe("value");
    expect(bodyParams.get("key")).toBe("secret");

    expect(result.rawBody).toBe("{}");
  });

  it("retries on transient failures and eventually returns success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    consumeTokenMock.mockResolvedValue({
      granted: true,
      remaining: 12,
      resetAt: Date.now() + 1000,
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const onAttempt = vi.fn();

    const requestPromise = upstreamRequest({
      ctx: createCtx(),
      baseUrl: "https://api.example.com",
      path: "/retry",
      method: "GET",
      rateLimit: { provider: "bricklink", bucket: "account:test" },
      auth: { kind: "none" },
      onAttempt,
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);

    const result = await requestPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ success: true });
    expect(result.attempts).toBe(2);

    const firstFailureAttempt = onAttempt.mock.calls
      .map((call) => call[0])
      .find((info) => info.status === 502);

    expect(firstFailureAttempt).toBeDefined();
    expect(firstFailureAttempt?.status).toBe(502);
    expect(firstFailureAttempt?.retryInMs).toBe(300);

    mathRandomSpy.mockRestore();
  });
});
