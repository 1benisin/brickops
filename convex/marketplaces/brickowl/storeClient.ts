import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError, type Value } from "convex/values";
import { internal } from "../../_generated/api";
import { normalizeApiError } from "../../lib/external/types";
import { recordMetric } from "../../lib/external/metrics";
import type { StoreOperationError, StoreErrorCode } from "../shared/types";
import {
  buildAuthHeaders,
  generateRequestId,
  getApiKey,
  validateApiKey,
  type BrickOwlCredentials,
} from "./auth";

const BASE_URL = "https://api.brickowl.com/v1";

export interface BrickOwlRequestOptions {
  path: string;
  method?: "GET" | "POST";
  queryParams?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
  isIdempotent?: boolean;
  retryPolicy?: Partial<BrickOwlRetryPolicy>;
}

export interface BrickOwlRetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export type BrickOwlRequestCache = Map<string, unknown>;

export interface BrickOwlRequestState {
  cache?: BrickOwlRequestCache;
}

export const DEFAULT_RETRY_POLICY: BrickOwlRetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffMultiplier: 2,
};

export function createRequestCache(): BrickOwlRequestCache {
  return new Map();
}

export function resolveRetryPolicy(overrides?: Partial<BrickOwlRetryPolicy>): BrickOwlRetryPolicy {
  if (!overrides) {
    return DEFAULT_RETRY_POLICY;
  }

  return {
    maxRetries: overrides.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    initialDelayMs: overrides.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: overrides.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    backoffMultiplier: overrides.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier,
  };
}

export async function requestWithRetry<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  credentials: BrickOwlCredentials,
  options: BrickOwlRequestOptions,
  state?: BrickOwlRequestState,
): Promise<T> {
  const policy = resolveRetryPolicy(options.retryPolicy);
  const method = (options.method ?? "GET").toUpperCase() as "GET" | "POST";
  const correlationId = options.correlationId ?? generateRequestId();
  const canRetry =
    options.isIdempotent === true || method === "GET" || options.idempotencyKey !== undefined;

  let lastError: unknown;
  let retryCount = 0;
  const requestState = state ?? {};

  while (retryCount <= policy.maxRetries) {
    try {
      return await request<T>(
        ctx,
        businessAccountId,
        credentials,
        { ...options, method, correlationId },
        requestState,
      );
    } catch (error) {
      lastError = error;

      let statusCode: number | undefined;
      if (error instanceof ConvexError) {
        const data = error.data as { httpStatus?: number };
        statusCode = data?.httpStatus;
      }

      if (!isRetryableError(error, statusCode) || !canRetry || retryCount >= policy.maxRetries) {
        throw error;
      }

      const delay = Math.min(
        policy.initialDelayMs * Math.pow(policy.backoffMultiplier, retryCount),
        policy.maxDelayMs,
      );

      recordMetric("external.brickowl.store.retry", {
        retryCount,
        delayMs: delay,
        correlationId,
        businessAccountId,
        operation: options.path,
      });

      await sleep(delay);
      retryCount += 1;
    }
  }

  throw lastError;
}

export async function request<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  credentials: BrickOwlCredentials,
  options: BrickOwlRequestOptions,
  state?: BrickOwlRequestState,
): Promise<T> {
  validateApiKey(credentials.apiKey);

  const method = (options.method ?? "GET").toUpperCase() as "GET" | "POST";
  const correlationId = options.correlationId ?? generateRequestId();
  const cache = state?.cache;
  const startTime = Date.now();

  if (options.idempotencyKey && cache?.has(options.idempotencyKey)) {
    recordMetric("external.brickowl.store.cache_hit", {
      operation: options.path,
      correlationId,
      businessAccountId,
    });
    return cache.get(options.idempotencyKey) as T;
  }

  recordMetric("external.brickowl.store.request", {
    operation: options.path,
    method,
    businessAccountId,
    correlationId,
  });

  const quota = await ctx.runQuery(internal.marketplaces.shared.mutations.getQuotaState, {
    businessAccountId,
    provider: "brickowl",
  });

  const now = Date.now();
  if (quota.circuitBreakerOpenUntil && now < quota.circuitBreakerOpenUntil) {
    const retryAfterMs = quota.circuitBreakerOpenUntil - now;
    throw new ConvexError(
      `BrickOwl sync temporarily disabled due to repeated failures. Retry in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
  }

  if (quota.requestCount >= quota.capacity) {
    const retryAfterMs = quota.windowStart + quota.windowDurationMs - now;
    recordMetric("external.brickowl.store.quota_exceeded", {
      businessAccountId,
      correlationId,
    });
    throw new ConvexError(
      `BrickOwl API rate limit exceeded. Resets in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
  }

  if (quota.alertEmitted) {
    recordMetric("external.brickowl.store.quota.alert", {
      businessAccountId,
      requestCount: quota.requestCount,
      capacity: quota.capacity,
      percentage: Math.round((quota.requestCount / quota.capacity) * 100),
      correlationId,
    });
  }

  const isPostRequest = method === "POST";
  const apiKey = getApiKey(credentials.apiKey);
  const url = buildRequestUrl(options.path, options.queryParams);

  if (!isPostRequest) {
    url.searchParams.set("key", apiKey);
  }

  const headers = buildAuthHeaders(credentials.apiKey, isPostRequest);

  let requestBody: string | undefined;
  if (isPostRequest) {
    const formData = new URLSearchParams();
    formData.append("key", apiKey);
    const bodyEntries = Object.entries(options.body ?? {});
    for (const [key, value] of bodyEntries) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) || typeof value === "object") {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    }
    requestBody = formData.toString();
  }

  console.log("[BrickOwl API Request]", {
    operation: options.path,
    method,
    url: url.toString(),
    correlationId,
    requestBody: requestBody ? requestBody.replace(/key=[^&]+/, "key=***") : undefined,
  });

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: requestBody,
    });

    await ctx.runMutation(internal.marketplaces.shared.mutations.incrementQuota, {
      businessAccountId,
      provider: "brickowl",
    });

    const responseBody = await parseResponseBody(response);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      await handleErrorResponse(
        ctx,
        businessAccountId,
        response.status,
        responseBody,
        correlationId,
      );
    }

    if (options.idempotencyKey && cache) {
      cache.set(options.idempotencyKey, responseBody);
    }

    recordMetric("external.brickowl.store.success", {
      operation: options.path,
      businessAccountId,
      durationMs,
      correlationId,
    });

    return responseBody as T;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    recordMetric("external.brickowl.store.error", {
      operation: options.path,
      businessAccountId,
      durationMs,
      correlationId,
      errorMessage:
        error instanceof ConvexError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error",
    });

    if (error instanceof TypeError && error.message.includes("fetch")) {
      await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
        businessAccountId,
        provider: "brickowl",
      });
    }

    throw error;
  }
}

export async function executeWithRetry<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  operation: () => Promise<T>,
  retryPolicy: BrickOwlRetryPolicy = DEFAULT_RETRY_POLICY,
  correlationId?: string,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  let delay = retryPolicy.initialDelayMs;

  while (attempt <= retryPolicy.maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      let statusCode: number | undefined;
      if (error instanceof ConvexError) {
        const data = error.data as { httpStatus?: number };
        statusCode = data?.httpStatus;
      }

      if (attempt === retryPolicy.maxRetries || !isRetryableError(error, statusCode)) {
        throw error;
      }

      recordMetric("external.brickowl.store.retry", {
        retryCount: attempt,
        delayMs: delay,
        correlationId,
        businessAccountId,
      });

      await sleep(delay);
      delay = Math.min(delay * retryPolicy.backoffMultiplier, retryPolicy.maxDelayMs);
      attempt += 1;
    }
  }

  throw lastError;
}

export function normalizeBrickOwlError(error: unknown): StoreOperationError {
  if (error instanceof ConvexError) {
    const data = asRecord(error.data);
    const httpStatus = pickNumber(data?.httpStatus);
    const providedCode = typeof data?.code === "string" ? (data.code as string) : undefined;
    const canonicalCode = mapBrickOwlErrorCode({
      httpStatus,
      providerCode: providedCode,
    });
    const retryAfterMs = pickNumber(data?.retryAfterMs);

    const retryable =
      typeof data?.retryable === "boolean"
        ? (data.retryable as boolean)
        : isRetryable(canonicalCode, httpStatus);

    return {
      code: canonicalCode,
      message:
        typeof data?.message === "string"
          ? (data.message as string)
          : typeof error.message === "string"
            ? error.message
            : "An unexpected BrickOwl error occurred",
      retryable,
      details: data,
      httpStatus,
      rateLimitResetAt: retryAfterMs !== undefined ? toFutureIsoTimestamp(retryAfterMs) : undefined,
    };
  }

  const normalized = normalizeApiError("brickowl", error);
  const details = asRecord(normalized.error.details);
  const httpStatus = pickNumber(details?.status ?? details?.httpStatus);
  const providerCode =
    typeof normalized.error.code === "string" ? normalized.error.code : undefined;
  const retryAfterMs =
    pickNumber(details?.retryAfterMs) ??
    extractRetryAfterFromHeaders(details) ??
    extractRetryAfterFromBody(details);
  const canonicalCode = mapBrickOwlErrorCode({
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

type BrickOwlErrorMappingInput = {
  httpStatus?: number;
  providerCode?: string;
};

function mapBrickOwlErrorCode(input: BrickOwlErrorMappingInput): StoreErrorCode {
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
  const retryAfter = bodyRecord.retry_after ?? bodyRecord.retryAfter;
  if (retryAfter === undefined) {
    return undefined;
  }
  const numeric = pickNumber(retryAfter);
  if (numeric === undefined) {
    return undefined;
  }
  return numeric >= 1000 ? numeric : numeric * 1000;
}

export function buildRequestUrl(
  path: string,
  queryParams?: Record<string, string | number | boolean | undefined>,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${BASE_URL}/${normalizedPath}`);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  return url;
}

export function serializeErrorBody(errorBody: unknown): Value {
  if (typeof errorBody === "string") {
    return errorBody;
  }
  if (errorBody === undefined) {
    return "undefined";
  }
  try {
    return JSON.stringify(errorBody);
  } catch (error) {
    return (error as Error).message ?? "Unable to serialize error body";
  }
}

function attachErrorData<T extends Value>(
  error: ConvexError<T>,
  data: Record<string, Value | undefined>,
): void {
  const existing =
    error.data &&
    typeof error.data === "object" &&
    error.data !== null &&
    !Array.isArray(error.data)
      ? (error.data as Record<string, Value | undefined>)
      : {};

  const sanitized = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null),
  );

  error.data = {
    ...existing,
    ...sanitized,
  } as unknown as T;
}

async function handleErrorResponse(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  status: number,
  errorBody: unknown,
  correlationId: string,
): Promise<never> {
  console.error("[BrickOwl API Error]", {
    status,
    correlationId,
    errorBody: JSON.stringify(errorBody),
  });

  const apiError = normalizeApiError("brickowl", errorBody, { correlationId });

  if (status === 429) {
    recordMetric("external.brickowl.store.throttle", {
      correlationId,
      retryAfterMs: 60000,
      businessAccountId,
    });

    const err = new ConvexError("BrickOwl rate limit: retry after 60s");
    attachErrorData(err, { httpStatus: status });
    throw err;
  }

  if (status === 401) {
    const err = new ConvexError(
      "BrickOwl API key is invalid or expired. Please update credentials.",
    );
    attachErrorData(err, { httpStatus: status });
    throw err;
  }

  if (status === 404) {
    const isHtmlError = typeof errorBody === "string" && errorBody.trim().startsWith("<!DOCTYPE");
    let message: string;

    if (isHtmlError) {
      message =
        "BrickOwl API endpoint not found or authentication failed. Please check your API key and endpoint URL.";
    } else if (
      typeof errorBody === "object" &&
      errorBody !== null &&
      "error" in errorBody &&
      typeof (errorBody as { error?: { status?: string } }).error?.status === "string" &&
      (errorBody as { error: { status: string } }).error.status.includes("Invalid BOID")
    ) {
      message =
        "Invalid BOID: The part number provided is not a valid BrickOwl BOID. Look up the correct BOID before creating inventory.";
    } else {
      message = "Inventory lot not found on BrickOwl";
    }

    const err = new ConvexError(message);
    attachErrorData(err, {
      httpStatus: status,
      errorBody: serializeErrorBody(errorBody),
    });
    throw err;
  }

  if (status === 400) {
    const err = new ConvexError(apiError.error.message || "Invalid request data");
    attachErrorData(err, { httpStatus: status });
    throw err;
  }

  if (status >= 500) {
    await ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
      businessAccountId,
      provider: "brickowl",
    });
  }

  const err = new ConvexError(apiError.error.message || `BrickOwl API error: ${status}`);
  attachErrorData(err, { httpStatus: status });
  throw err;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = response.headers.get("content-length");

  if (contentLength === "0") {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (error) {
      throw new ConvexError(
        `BrickOwl API response parse error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return await response.text();
}

function isRetryableError(error: unknown, statusCode?: number): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }

  if (statusCode && statusCode >= 500) {
    return true;
  }

  if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
    return false;
  }

  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
