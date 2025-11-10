/**
 * BrickLink Store Client
 * Handles user's BrickLink store operations (inventory + orders) using BYOK credentials
 *
 * ROLLBACK PATTERNS FOR STORY 3.4:
 * ===================================
 *
 * All CRUD operations support compensating operations for rollback:
 *
 * 1. CREATE ROLLBACK:
 *    - Original: createInventory(payload) → returns { inventory_id: 123, ... }
 *    - Compensating: deleteInventory(123)
 *    - Required data: marketplaceId from create response
 *
 * 2. UPDATE ROLLBACK:
 *    - Original: updateInventory(123, { quantity: "+5", unit_price: "2.00" })
 *    - Compensating: updateInventory(123, { quantity: "-5", unit_price: "1.50" })
 *    - Required data: previousQuantity, previousPrice, previous values for all updated fields
 *    - Note: Reverse quantity delta ("+5" becomes "-5")
 *
 * 3. DELETE ROLLBACK:
 *    - Original: deleteInventory(123)
 *    - Compensating: createInventory(originalPayload)
 *    - Required data: Full original inventory payload captured before delete
 *    - Note: New inventory will have different inventory_id
 * STORY 3.4 INTEGRATION:
 * - inventoryHistory table tracks all changes with action type
 * - Each log entry stores oldData and newData for audit trail
 * - UI presents change history for searching and filtering
 * - No undo operations supported (history is read-only audit trail)
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { normalizeApiError } from "../../lib/external/types";
import { recordMetric } from "../../lib/external/metrics";
import type { StoreOperationError, StoreErrorCode } from "../shared/types";
import {
  generateOAuthParams,
  generateOAuthSignature,
  buildAuthorizationHeader,
  generateRequestId,
  type OAuthCredentials,
} from "./oauth";
import { getBrickLinkCredentials } from "./credentials";
import { parseBricklinkEnvelope } from "./validation";
import { requireActiveUser } from "@/convex/users/helpers";

const BASE_URL = "https://api.bricklink.com/api/store/v1/";

export interface BricklinkUserCredentials {
  consumerKey: string;
  consumerSecret: string;
  tokenValue: string;
  tokenSecret: string;
}

export type BricklinkCredentials = BricklinkUserCredentials;

export interface BricklinkRequestOptions {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  correlationId?: string;
}

export type BricklinkRequestResult<T> = {
  data: T;
  status: number;
  headers: Headers;
};

export type BricklinkApiResponse<T> = {
  meta: {
    description?: string;
    message?: string;
    code?: number;
  };
  data: T;
};

// export type BricklinkHttpClient = {
//   request: <T>(options: BricklinkRequestOptions) => Promise<BricklinkRequestResult<T>>;
// };

export async function makeBricklinkRequest<T>(
  ctx: ActionCtx,
  options: BricklinkRequestOptions,
): Promise<BricklinkRequestResult<T>> {
  const { businessAccountId } = await requireActiveUser(ctx);
  const credentials = await getBrickLinkCredentials(ctx, businessAccountId);
  validateCredentials(credentials);

  const method = (options.method ?? "GET").toUpperCase();
  const correlationId =
    options.correlationId ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : generateRequestId());

  return await makeRequest<T>(ctx, businessAccountId, credentials, method, options, correlationId);
}

export function normalizeBricklinkError(error: unknown): StoreOperationError {
  if (error instanceof ConvexError) {
    const data = asRecord(error.data);
    const httpStatus = pickNumber(data?.httpStatus);
    const retryAfterMs = pickNumber(data?.retryAfterMs);
    const providedCode = typeof data?.code === "string" ? (data.code as string) : undefined;
    const canonicalCode = mapStoreErrorCode({
      httpStatus,
      providerCode: providedCode,
    });

    const retryableFallback = isRetryable(canonicalCode, httpStatus);
    const retryable =
      typeof data?.retryable === "boolean" ? (data.retryable as boolean) : retryableFallback;

    return {
      code: canonicalCode,
      message:
        typeof data?.message === "string"
          ? (data.message as string)
          : typeof error.message === "string"
            ? error.message
            : "An unexpected BrickLink error occurred",
      retryable,
      details: data,
      httpStatus,
      rateLimitResetAt: retryAfterMs !== undefined ? toFutureIsoTimestamp(retryAfterMs) : undefined,
    };
  }

  const normalized = normalizeApiError("bricklink", error);
  const details = asRecord(normalized.error.details);
  const httpStatus = pickNumber(details?.status ?? details?.httpStatus);
  const providerCode =
    typeof normalized.error.code === "string" ? normalized.error.code : undefined;
  const retryAfterMs =
    pickNumber(details?.retryAfterMs) ??
    extractRetryAfterFromHeaders(details) ??
    extractRetryAfterFromBody(details);
  const canonicalCode = mapStoreErrorCode({
    httpStatus,
    providerCode,
  });

  return {
    code: canonicalCode,
    message: normalized.error.message,
    retryable: isRetryable(canonicalCode, httpStatus),
    details,
    httpStatus,
    rateLimitResetAt: retryAfterMs !== undefined ? toFutureIsoTimestamp(retryAfterMs) : undefined,
  };
}

type ErrorMappingInput = {
  httpStatus?: number;
  providerCode?: string;
};

function mapStoreErrorCode(input: ErrorMappingInput): StoreErrorCode {
  const status = input.httpStatus;
  const providerCode = input.providerCode?.toUpperCase();

  if (status === 429 || providerCode === "RATE_LIMIT_EXCEEDED") {
    return "RATE_LIMITED";
  }
  if (status === 408 || providerCode === "REQUEST_TIMEOUT" || providerCode === "TIMEOUT") {
    return "TIMEOUT";
  }
  if (status === 401) {
    return "AUTH";
  }
  if (status === 403) {
    return "PERMISSION";
  }
  if (status === 404 || providerCode === "NOT_FOUND") {
    return "NOT_FOUND";
  }
  if (status === 409 || providerCode === "CONFLICT") {
    return "CONFLICT";
  }
  if (providerCode === "INVALID_RESPONSE") {
    return "INVALID_RESPONSE";
  }
  if (providerCode === "VALIDATION_ERROR") {
    return "VALIDATION";
  }
  if (providerCode === "CIRCUIT_BREAKER_OPEN") {
    return "CIRCUIT_BREAKER_OPEN";
  }
  if (providerCode === "NETWORK_ERROR") {
    return "NETWORK";
  }

  if (typeof status === "number") {
    if (status >= 500) {
      return "SERVER_ERROR";
    }
    if (status >= 400) {
      return "VALIDATION";
    }
  }

  if (providerCode?.includes("TIMEOUT")) {
    return "TIMEOUT";
  }
  if (providerCode?.includes("NETWORK")) {
    return "NETWORK";
  }

  return "UNEXPECTED_ERROR";
}

function isRetryable(code: StoreErrorCode, httpStatus?: number): boolean {
  if (
    code === "RATE_LIMITED" ||
    code === "TIMEOUT" ||
    code === "NETWORK" ||
    code === "SERVER_ERROR"
  ) {
    return true;
  }

  if (code === "UNEXPECTED_ERROR") {
    // Treat unexpected errors without a 4xx status as retryable by default.
    return typeof httpStatus !== "number" || httpStatus >= 500;
  }

  return false;
}

function toFutureIsoTimestamp(offsetMs: number): string {
  return new Date(Date.now() + Math.max(0, offsetMs)).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function extractRetryAfterFromHeaders(details?: Record<string, unknown>): number | undefined {
  const headers = details?.headers;
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  const headerRecord = headers as Record<string, unknown>;
  const retryAfter =
    headerRecord["Retry-After"] ??
    headerRecord["retry-after"] ??
    headerRecord["Retry-after"] ??
    headerRecord["retryAfter"];

  if (typeof retryAfter === "number") {
    return retryAfter * 1000;
  }
  if (typeof retryAfter === "string") {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
    const timestamp = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp)) {
      return timestamp - Date.now();
    }
  }
  return undefined;
}

function extractRetryAfterFromBody(details?: Record<string, unknown>): number | undefined {
  const body = details?.body;
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const bodyRecord = body as Record<string, unknown>;
  const meta = bodyRecord.meta;
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const retryAfter = (meta as Record<string, unknown>).retry_after;
  if (retryAfter === undefined) {
    return undefined;
  }
  const numeric = pickNumber(retryAfter);
  if (numeric === undefined) {
    return undefined;
  }
  return numeric >= 1000 ? numeric : numeric * 1000;
}

function validateCredentials(credentials: BricklinkCredentials): void {
  if (
    !credentials.consumerKey ||
    !credentials.consumerSecret ||
    !credentials.tokenValue ||
    !credentials.tokenSecret
  ) {
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickLink credentials are missing required fields",
    });
  }
}

async function makeRequest<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  credentials: BricklinkCredentials,
  method: string,
  options: BricklinkRequestOptions,
  correlationId: string,
): Promise<BricklinkRequestResult<T>> {
  // Track request metadata for observability before performing any work.
  recordMetric("external.bricklink.store.request", {
    businessAccountId,
    operation: options.path,
    method,
    correlationId,
  });

  // Fetch current quota state to enforce BrickLink rate limits and circuit breaker.
  const quota = await ctx.runQuery(internal.marketplaces.shared.mutations.getQuotaState, {
    businessAccountId,
    provider: "bricklink",
  });

  const now = Date.now();
  const windowElapsed = now - quota.windowStart;
  const isWindowExpired = windowElapsed >= quota.windowDurationMs;

  if (quota.circuitBreakerOpenUntil && now < quota.circuitBreakerOpenUntil) {
    const retryAfterMs = quota.circuitBreakerOpenUntil - now;

    recordMetric("external.bricklink.store.circuit_breaker.blocked", {
      businessAccountId,
      correlationId,
    });

    throw new ConvexError({
      code: "CIRCUIT_BREAKER_OPEN",
      message: "BrickLink sync temporarily disabled due to repeated failures",
      retryAfterMs,
    });
  }

  if (!isWindowExpired && quota.requestCount >= quota.capacity) {
    const resetIn = quota.windowStart + quota.windowDurationMs - now;

    recordMetric("external.bricklink.store.quota.blocked", {
      businessAccountId,
      count: quota.requestCount,
      capacity: quota.capacity,
      percentage: quota.requestCount / quota.capacity,
      retryAfterMs: resetIn,
      correlationId,
    });

    throw new ConvexError({
      code: "RATE_LIMIT_EXCEEDED",
      message: `BrickLink rate limit exceeded (${quota.requestCount}/${quota.capacity}). Resets in ${Math.ceil(
        resetIn / 60000,
      )} minutes.`,
      retryAfterMs: resetIn,
      currentUsage: quota.requestCount,
      capacity: quota.capacity,
    });
  }

  // Construct the target URL and prepare OAuth credentials for request signing.
  const url = buildRequestUrl(options.path, options.query);

  const oauthCredentials: OAuthCredentials = {
    consumerKey: credentials.consumerKey,
    consumerSecret: credentials.consumerSecret,
    tokenValue: credentials.tokenValue,
    tokenSecret: credentials.tokenSecret,
  };

  const oauthParams = generateOAuthParams();

  const queryEntries = Object.entries(options.query ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  const oauthParamPairs: Array<[string, string]> = [
    ["oauth_consumer_key", oauthCredentials.consumerKey],
    ["oauth_token", oauthCredentials.tokenValue],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", oauthParams.timestamp],
    ["oauth_nonce", oauthParams.nonce],
    ["oauth_version", "1.0"],
  ];

  const allParams: Array<[string, string]> = [
    ...queryEntries.map(([key, value]): [string, string] => [key, String(value)]),
    ...oauthParamPairs,
  ];

  const baseUrl = url.href.split("?")[0];
  const signature = await generateOAuthSignature(oauthCredentials, method, baseUrl, allParams);
  const authorization = buildAuthorizationHeader(oauthCredentials, signature, oauthParams);

  const started = Date.now();
  let response: Response;

  try {
    // Execute the HTTP request with JSON payload and BrickLink-required headers.
    const requestBody = options.body ? JSON.stringify(options.body) : undefined;

    response = await fetch(url.href, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "BrickOps/1.0",
        ...(options.headers ?? {}),
        Authorization: authorization,
      },
      body: requestBody,
    });
  } catch (error) {
    const duration = Date.now() - started;

    await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
      businessAccountId,
      provider: "bricklink",
    });

    recordMetric("external.bricklink.store.error", {
      businessAccountId,
      operation: options.path,
      errorType: "network",
      durationMs: duration,
      correlationId,
    });

    throw normalizeApiError("bricklink", error, {
      endpoint: options.path,
      correlationId,
    });
  }

  const duration = Date.now() - started;

  if (!response.ok) {
    const body = await safeReadBody(response);

    console.error("[BrickLink API Error]", {
      endpoint: options.path,
      status: response.status,
      body,
      correlationId,
    });

    await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
      businessAccountId,
      provider: "bricklink",
    });

    recordMetric("external.bricklink.store.error", {
      businessAccountId,
      operation: options.path,
      httpStatus: response.status,
      durationMs: duration,
      correlationId,
    });

    throw normalizeApiError("bricklink", new Error(`HTTP ${response.status}`), {
      endpoint: options.path,
      status: response.status,
      body,
      correlationId,
    });
  }

  let rawBody: unknown;
  let envelope: BricklinkApiResponse<unknown>;
  try {
    // Parse and validate the BrickLink envelope to guard against schema drift.
    rawBody = await response.json();
    envelope = parseBricklinkEnvelope(rawBody, {
      endpoint: options.path,
      correlationId,
    }) as BricklinkApiResponse<unknown>;
  } catch (error) {
    await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
      businessAccountId,
      provider: "bricklink",
    });

    recordMetric("external.bricklink.store.error", {
      businessAccountId,
      operation: options.path,
      errorType: "invalid_response",
      durationMs: duration,
      correlationId,
    });

    if (error instanceof ConvexError) {
      throw error;
    }

    throw normalizeApiError("bricklink", error, {
      endpoint: options.path,
      correlationId,
      body: rawBody,
    });
  }

  const errorCode = envelope.meta.code;
  if (typeof errorCode === "number" && errorCode >= 400) {
    await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
      businessAccountId,
      provider: "bricklink",
    });

    recordMetric("external.bricklink.store.error", {
      businessAccountId,
      operation: options.path,
      httpStatus: errorCode,
      durationMs: duration,
      correlationId,
    });

    const message = envelope.meta.message ?? "Unknown BrickLink error";
    const description = envelope.meta.description;
    const formatted = description ? `${message} - ${description}` : message;

    throw normalizeApiError("bricklink", new Error(`BrickLink Error ${errorCode}: ${formatted}`), {
      endpoint: options.path,
      status: errorCode,
      body: envelope,
      correlationId,
    });
  }

  // Successful response: update quota accounting and reset failure counters.
  await ctx.runMutation(internal.marketplaces.shared.mutations.incrementQuota, {
    businessAccountId,
    provider: "bricklink",
  });

  await ctx.runMutation(internal.marketplaces.shared.mutations.resetFailures, {
    businessAccountId,
    provider: "bricklink",
  });

  const updatedQuota = await ctx.runQuery(internal.marketplaces.shared.mutations.getQuotaState, {
    businessAccountId,
    provider: "bricklink",
  });

  const percentage = updatedQuota.requestCount / updatedQuota.capacity;
  if (percentage >= updatedQuota.alertThreshold && updatedQuota.alertEmitted) {
    recordMetric("external.bricklink.store.quota.alert", {
      businessAccountId,
      provider: "bricklink",
      count: updatedQuota.requestCount,
      capacity: updatedQuota.capacity,
      percentage,
    });
  }

  recordMetric("external.bricklink.store.success", {
    businessAccountId,
    operation: options.path,
    durationMs: duration,
    correlationId,
  });

  const typedEnvelope = envelope as T;

  return {
    data: typedEnvelope,
    status: response.status,
    headers: response.headers,
  };
}

function buildRequestUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, BASE_URL);

  const entries = Object.entries(query ?? {}).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  entries.forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });

  return url;
}

async function safeReadBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    return { parseError: (error as Error).message };
  }
}
