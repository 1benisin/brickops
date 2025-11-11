import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BLCatalogCtx } from "@/convex/marketplaces/bricklink/client";
import type { BLEnvelope } from "@/convex/marketplaces/bricklink/shared/envelope";
import {
  checkBlCatalogHealth,
  fetchBlColor,
  fetchBlPriceGuide,
  makeBlCatalogRequest,
} from "@/convex/marketplaces/bricklink/client";
import { addMetricListener, clearMetricListeners } from "@/convex/lib/external/metrics";
import * as env from "@/convex/lib/external/env";

type FetchMock = ReturnType<typeof vi.fn>;

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const textResponse = (body: string, status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => JSON.parse(body),
  text: async () => body,
});

describe("BrickLink catalog client", () => {
  const originalEnv = { ...process.env };
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearMetricListeners();
    Object.assign(process.env, {
      BRICKLINK_CONSUMER_KEY: "fallback-ck",
      BRICKLINK_CONSUMER_SECRET: "fallback-cs",
      BRICKLINK_ACCESS_TOKEN: "fallback-at",
      BRICKLINK_TOKEN_SECRET: "fallback-ts",
    });

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearMetricListeners();
    Object.assign(process.env, originalEnv);
  });

  it("uses ctx.env credentials and maps color responses", async () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(now);

    const envSpy = vi.spyOn(env, "getBlCredentials");
    const envGet = vi.fn(async (key: string) => {
      const values: Record<string, string> = {
        BRICKLINK_CONSUMER_KEY: "ctx-ck",
        BRICKLINK_CONSUMER_SECRET: "ctx-cs",
        BRICKLINK_ACCESS_TOKEN: "ctx-at",
        BRICKLINK_TOKEN_SECRET: "ctx-ts",
      };
      return values[key];
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        meta: {},
        data: {
          color_id: 21,
          color_name: "Bright Red",
          color_code: "BR",
          color_type: "SOLID",
        },
      }),
    );

    const events: string[] = [];
    addMetricListener((event) => events.push(event.name));

    const ctx: BLCatalogCtx = { env: { get: envGet } };
    const result = await fetchBlColor(ctx, { colorId: 21 });

    expect(envGet).toHaveBeenCalledTimes(4);
    expect(envSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/colors/21");
    expect(result).toEqual({
      colorId: 21,
      colorName: "Bright Red",
      colorCode: "BR",
      colorType: "SOLID",
      lastFetched: now.valueOf(),
      createdAt: now.valueOf(),
    });
    expect(events).toContain("external.bricklink.catalog.request");

    envSpy.mockRestore();
  });

  it("fetches and maps all price guide variants", async () => {
    vi.useFakeTimers();
    const now = new Date("2024-02-01T12:00:00.000Z");
    vi.setSystemTime(now);

    const priceByVariant: Record<string, string> = {
      "stock-U": "1.11",
      "stock-N": "2.22",
      "sold-U": "3.33",
      "sold-N": "4.44",
    };

    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? new URL(input) : new URL(input.url);
      const guideType = url.searchParams.get("guide_type") ?? "";
      const newOrUsed = url.searchParams.get("new_or_used") ?? "";
      const key = `${guideType}-${newOrUsed}`;

      return Promise.resolve(
        jsonResponse({
          meta: {},
          data: {
            item: { no: "3001", type: "PART" },
            new_or_used: newOrUsed,
            currency_code: "USD",
            guide_type: guideType,
            avg_price: priceByVariant[key],
            min_price: "0.50",
            max_price: "5.00",
          },
        }),
      );
    });

    const events: string[] = [];
    addMetricListener((event) => events.push(event.name));

    const result = await fetchBlPriceGuide(undefined, {
      itemNo: "3001",
      colorId: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const requestUrls = fetchMock.mock.calls.map((call) => call[0]);
    expect(requestUrls.every((url) => String(url).includes("/items/part/3001/price"))).toBe(true);

    expect(result.usedStock).toMatchObject({
      partNo: "3001",
      colorId: 5,
      guideType: "stock",
      newOrUsed: "U",
      avgPrice: 1.11,
      lastFetched: now.valueOf(),
      createdAt: now.valueOf(),
    });
    expect(result.newStock).toMatchObject({
      guideType: "stock",
      newOrUsed: "N",
      avgPrice: 2.22,
    });
    expect(result.usedSold).toMatchObject({
      guideType: "sold",
      newOrUsed: "U",
      avgPrice: 3.33,
    });
    expect(result.newSold).toMatchObject({
      guideType: "sold",
      newOrUsed: "N",
      avgPrice: 4.44,
    });

    const requestEvents = events.filter((name) => name === "external.bricklink.catalog.request");
    expect(requestEvents).toHaveLength(4);
  });

  it("uses provided credentials override when making catalog requests", async () => {
    const envSpy = vi.spyOn(env, "getBlCredentials");
    const credentials = {
      consumerKey: "override-ck",
      consumerSecret: "override-cs",
      tokenValue: "override-at",
      tokenSecret: "override-ts",
    };

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        meta: {},
        data: { sample: true },
      }),
    );

    const result = await makeBlCatalogRequest<BLEnvelope>(
      undefined,
      { path: "/colors" },
      { credentials },
    );

    expect(envSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({
      meta: {},
      data: { sample: true },
    });

    envSpy.mockRestore();
  });

  it("captures health check failures with structured errors", async () => {
    fetchMock.mockResolvedValueOnce(textResponse('{"error":"down"}', 503));

    const events: Array<{ name: string }> = [];
    addMetricListener((event) => events.push({ name: event.name }));

    const result = await checkBlCatalogHealth();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error?.error.code).toBe("UNEXPECTED_ERROR");

    const eventNames = events.map((event) => event.name);
    expect(eventNames).toContain("external.bricklink.catalog.request");
    expect(eventNames).toContain("external.bricklink.catalog.health");
  });
});
