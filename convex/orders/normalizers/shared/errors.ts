import { ConvexError } from "convex/values";

import type { ProviderId } from "../types";

export const NORMALIZATION_ERROR_CODES = {
  MissingField: "MissingField",
  UnsupportedStatus: "UnsupportedStatus",
  InvalidCurrency: "InvalidCurrency",
  InvalidValue: "InvalidValue",
} as const;

export type NormalizationErrorCode =
  (typeof NORMALIZATION_ERROR_CODES)[keyof typeof NORMALIZATION_ERROR_CODES];

const DEFAULT_MESSAGES: Record<NormalizationErrorCode, string> = {
  MissingField: "Normalization failed: required field is missing or empty.",
  UnsupportedStatus: "Normalization failed: status value is not supported.",
  InvalidCurrency: "Normalization failed: currency value could not be normalized.",
  InvalidValue: "Normalization failed due to an invalid field value.",
};

export interface NormalizationErrorPayload {
  code: NormalizationErrorCode;
  message: string;
  provider?: ProviderId;
  field?: string;
  value?: unknown;
  meta?: Record<string, unknown>;
}

export interface NormalizationErrorDetails {
  message?: string;
  provider?: ProviderId;
  field?: string;
  value?: unknown;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

export type NormalizationError = ConvexError & {
  data: NormalizationErrorPayload;
  cause?: unknown;
};

export function createNormalizationError(
  code: NormalizationErrorCode,
  details: NormalizationErrorDetails = {},
): NormalizationError {
  const { message, provider, field, value, meta, cause } = details;

  const payload: NormalizationErrorPayload = {
    code,
    message: message ?? DEFAULT_MESSAGES[code],
    ...(provider ? { provider } : {}),
    ...(field ? { field } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(meta ? { meta } : {}),
  };

  const error = new ConvexError(payload) as NormalizationError;

  if (cause !== undefined) {
    Object.defineProperty(error, "cause", {
      value: cause,
      enumerable: false,
      configurable: true,
    });
  }

  return error;
}

export function isNormalizationError(error: unknown): error is NormalizationError {
  if (!(error instanceof ConvexError)) {
    return false;
  }

  const payload = (error as Partial<NormalizationError>).data;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return (
    typeof (payload as NormalizationErrorPayload).code === "string" &&
    typeof (payload as NormalizationErrorPayload).message === "string"
  );
}

