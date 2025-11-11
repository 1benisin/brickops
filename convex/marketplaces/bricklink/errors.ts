// BrickLink error normalization helpers
import { ConvexError } from "convex/values";
import { z } from "zod";
import { blResponseMetaSchema } from "./schema";
import { normalizeApiError } from "../../lib/external/types";
import type { StoreErrorCode, StoreOperationError } from "../shared/storeTypes";

// The raw BL response envelope has { meta: { code, message, description }, data: ... }
export const blErrorEnvelope = z.object({
  meta: blResponseMetaSchema,
  data: z.unknown().optional(),
});

export type BLResponseMeta = z.infer<typeof blResponseMetaSchema>;

export type NormalizedBlError = {
  service: "bricklink";
  httpStatus?: number; // if you pass it from the fetch layer
  code: string; // app-level code
  blCode?: number; // meta.code from BL
  message: string; // human-readable
  details?: Record<string, unknown>;
};

// Simple mapping from BL `meta.code` + headers/status to app-level codes
export function normalizeBlError(
  meta: BLResponseMeta,
  httpStatus?: number,
  details?: Record<string, unknown>,
): NormalizedBlError {
  // Prefer HTTP status when present, fall back to BL meta.code
  const status = httpStatus ?? meta.code;

  // Buckets you can branch on in UI/logic
  if (status === 401) {
    return {
      service: "bricklink",
      httpStatus: status,
      code: "AUTHENTICATION_ERROR",
      blCode: meta.code,
      message: meta.message || "Authentication failed with BrickLink",
      details: { description: meta.description, ...details },
    };
  }
  if (status === 429) {
    return {
      service: "bricklink",
      httpStatus: status,
      code: "RATE_LIMITED",
      blCode: meta.code,
      message: meta.message || "Rate limit reached for BrickLink API",
      details: { description: meta.description, retryAfter: details?.retryAfter },
    };
  }
  if (status >= 400 && status < 500) {
    return {
      service: "bricklink",
      httpStatus: status,
      code: "BAD_REQUEST",
      blCode: meta.code,
      message: meta.message || "Invalid request to BrickLink",
      details: { description: meta.description, ...details },
    };
  }
  if (status >= 500) {
    return {
      service: "bricklink",
      httpStatus: status,
      code: "UPSTREAM_FAILURE",
      blCode: meta.code,
      message: meta.message || "BrickLink is unavailable or errored",
      details: { description: meta.description, ...details },
    };
  }

  // Unknown (non-standard) meta.code
  return {
    service: "bricklink",
    httpStatus: status,
    code: "UNKNOWN_ERROR",
    blCode: meta.code,
    message: meta.message || "Unknown BrickLink error",
    details: { description: meta.description, ...details },
  };
}

export function normalizeBlStoreError(error: unknown): StoreOperationError {
  if (error instanceof ConvexError) {
    const data = toRecord(error.data);
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
  const details = toRecord(normalized.error.details);
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
    return typeof httpStatus !== "number" || httpStatus >= 500;
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
