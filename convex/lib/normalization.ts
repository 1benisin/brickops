import { createNormalizationError, NORMALIZATION_ERROR_CODES } from "../orders/normalizers/shared/errors";
import type { ProviderId } from "../orders/normalizers/types";

const UNIX_SECOND_THRESHOLD = 1e11;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coerceNumberFromString(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Convert timestamps represented as numbers or strings into epoch milliseconds.
 * - Accepts ISO strings, numeric strings, or raw numbers.
 * - Values between 0 and 1e11 are assumed to be seconds and multiplied by 1000.
 */
export function parseTimestampLike(value: unknown): number | undefined {
  if (isFiniteNumber(value)) {
    if (value > 0 && value < UNIX_SECOND_THRESHOLD) {
      return value * 1000;
    }
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    const numeric = coerceNumberFromString(value);
    if (numeric !== undefined) {
      return parseTimestampLike(numeric);
    }
  }

  return undefined;
}

/**
 * Convert string/number inputs into finite numbers. Returns undefined for invalid input.
 */
export function parseNumberLike(value: unknown): number | undefined {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (typeof value === "string") {
    return coerceNumberFromString(value);
  }
  return undefined;
}

/**
 * Return the first non-empty string (trimmed) from the provided values. Numbers are stringified.
 */
export function pickFirstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
      continue;
    }

    if (isFiniteNumber(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

/**
 * Ensure a raw identifier value resolves to a non-empty string.
 */
export interface RequireOrderIdContext {
  provider?: ProviderId;
  field?: string;
}

export function requireOrderId(raw: unknown, context: RequireOrderIdContext = {}): string {
  const candidate = pickFirstString(raw);
  if (!candidate) {
    throw createNormalizationError(NORMALIZATION_ERROR_CODES.MissingField, {
      provider: context.provider,
      field: context.field ?? "orderId",
      value: raw,
    });
  }
  return candidate;
}

/**
 * Safely stringify address-like objects.
 */
export function stringifyAddress(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
