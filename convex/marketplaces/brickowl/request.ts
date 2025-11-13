import type { Id } from "../../_generated/dataModel";
import type { RateLimitOptions } from "../../lib/upstreamRequest";
import type { BrickOwlCredentials } from "./credentials";
import { boAccountBucket } from "./rateLimit";

export const BO_BASE_URL = "https://api.brickowl.com/v1";
export const BO_USER_AGENT = "BrickOps/1.0";

export type BOHttpMethod = "GET" | "POST";

export function buildBoDefaultHeaders(correlationId: string): Record<string, string> {
  return {
    "User-Agent": BO_USER_AGENT,
    "X-Correlation-Id": correlationId,
  };
}

export function buildBoApiKeyAuth(credentials: BrickOwlCredentials) {
  return {
    kind: "apiKey" as const,
    value: credentials.apiKey,
    query: {
      name: "key",
      methods: ["GET" as BOHttpMethod],
    },
    formField: {
      name: "key",
      methods: ["POST" as BOHttpMethod],
    },
  };
}

export function buildBoRateLimitOptions(
  businessAccountId: Id<"businessAccounts">,
): RateLimitOptions {
  return {
    provider: "brickowl",
    bucket: boAccountBucket(businessAccountId),
  };
}

export function normalizeBoQuery(
  query?: Record<string, string | number | boolean | undefined>,
): Record<string, string> | undefined {
  if (!query) {
    return undefined;
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
}

export function buildBoRequestBody(
  method: BOHttpMethod,
  body: Record<string, unknown> | undefined,
): URLSearchParams | undefined {
  if (method !== "POST" || !body) {
    return undefined;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value) || typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}
