import { describe, expect, it } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import {
  BO_USER_AGENT,
  buildBoApiKeyAuth,
  buildBoDefaultHeaders,
  buildBoRateLimitOptions,
  buildBoRequestBody,
  normalizeBoQuery,
} from "@/convex/marketplaces/brickowl/request";

describe("BrickOwl request helpers", () => {
  it("builds default headers with correlation id", () => {
    const headers = buildBoDefaultHeaders("corr-abc");

    expect(headers).toEqual({
      "User-Agent": BO_USER_AGENT,
      "X-Correlation-Id": "corr-abc",
    });
  });

  it("returns API key auth metadata for query and form usage", () => {
    const auth = buildBoApiKeyAuth({ apiKey: "secret-key" });

    expect(auth).toEqual({
      kind: "apiKey",
      value: "secret-key",
      query: {
        name: "key",
        methods: ["GET"],
      },
      formField: {
        name: "key",
        methods: ["POST"],
      },
    });
  });

  it("normalizes query parameters by stringifying primitive values", () => {
    const normalized = normalizeBoQuery({
      page: 2,
      active_only: 1,
      include_archived: false,
      search: undefined,
    });

    expect(normalized).toEqual({
      page: "2",
      active_only: "1",
      include_archived: "false",
    });
  });

  it("builds URLSearchParams bodies for POST requests", () => {
    const params = buildBoRequestBody("POST", {
      lot_id: "1234",
      metadata: { tags: ["rare", "bulk"] },
      quantity: 5,
      omit: undefined,
    });

    expect(params).toBeInstanceOf(URLSearchParams);
    expect((params as URLSearchParams).get("lot_id")).toBe("1234");
    expect((params as URLSearchParams).get("quantity")).toBe("5");
    expect((params as URLSearchParams).get("metadata")).toBe(JSON.stringify({ tags: ["rare", "bulk"] }));

    expect(buildBoRequestBody("GET", { lot_id: "1234" })).toBeUndefined();
  });

  it("builds rate limit options scoped to the business account", () => {
    const businessAccountId = "ba-999" as Id<"businessAccounts">;

    const rateLimit = buildBoRateLimitOptions(businessAccountId);

    expect(rateLimit).toEqual({
      provider: "brickowl",
      bucket: `brickowl:account:${businessAccountId}`,
    });
  });
});

