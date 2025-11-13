import { ConvexError } from "convex/values";
import { normalizeApiError } from "../../lib/external/types";
import type { StoreErrorCode, StoreOperationError } from "../shared/storeTypes";

export function normalizeBoStoreError(error: unknown): StoreOperationError {
  if (error instanceof ConvexError) {
    const data = toRecord(error.data);
    const httpStatus = pickNumber(data?.httpStatus);
    const providedCode = typeof data?.code === "string" ? (data.code as string) : undefined;
    const retryAfterMs = pickNumber(data?.retryAfterMs);
    const canonicalCode = mapBrickOwlErrorCode({
      httpStatus,
      providerCode: providedCode,
    });

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
  const details = toRecord(normalized.error.details);
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

export const normalizeBrickOwlError = normalizeBoStoreError;

type ErrorMappingInput = {
  httpStatus?: number;
  providerCode?: string;
};

function mapBrickOwlErrorCode(input: ErrorMappingInput): StoreErrorCode {
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
    return typeof httpStatus === "number" && httpStatus >= 500;
  }

  return false;
}

function toFutureIsoTimestamp(offsetMs: number): string {
  return new Date(Date.now() + Math.max(0, offsetMs)).toISOString();
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
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
