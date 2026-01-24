// Local UUID generator that prefers Web Crypto and avoids Node-only 'crypto'
function generateRequestId(): string {
  try {
    type MinimalCrypto = { getRandomValues?: (arr: Uint8Array) => void; randomUUID?: () => string };
    const c = (globalThis as { crypto?: MinimalCrypto }).crypto;
    if (typeof c?.randomUUID === "function") {
      return c.randomUUID();
    }
    if (typeof c?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
      return (
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10, 16).join("")
      );
    }
  } catch {
    // ignore
  }
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

export type ExternalProvider = "brickognize" | "bricklink" | "brickowl" | "rebrickable";

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId: string;
  };
}

export type HealthCheckResult = {
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
    requestId: generateRequestId(),
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
