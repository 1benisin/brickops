import { randomUUID } from "crypto";

export type ExternalProvider = "brickognize" | "bricklink" | "brickowl";

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId: string;
  };
}

export type ValidationResult = {
  provider: ExternalProvider;
  ok: boolean;
  status?: number;
  durationMs?: number;
  error?: ApiError;
};

export type RequestContext = {
  provider: ExternalProvider;
  endpoint: string;
  identityKey?: string;
};

export const toApiError = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError => ({
  error: {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    requestId: randomUUID(),
  },
});

export const isApiError = (value: unknown): value is ApiError => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { error?: Record<string, unknown> };
  if (!candidate.error || typeof candidate.error !== "object") {
    return false;
  }

  const { code, message } = candidate.error as {
    code?: unknown;
    message?: unknown;
  };

  return typeof code === "string" && typeof message === "string";
};

export const normalizeApiError = (
  provider: ExternalProvider,
  error: unknown,
  context: Record<string, unknown> = {},
): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  const baseMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected error";

  const details: Record<string, unknown> = {
    provider,
    ...context,
  };

  if (error instanceof Error) {
    details.originalError = {
      name: error.name,
      message: error.message,
    };
  } else if (error !== undefined) {
    details.originalError = { value: error };
  }

  return toApiError("UNEXPECTED_ERROR", baseMessage, details);
};
