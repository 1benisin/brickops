import { getBrickognizeApiKey } from "./env";
import { ExternalHttpClient, RequestOptions, RequestResult } from "./httpClient";
import { RateLimitConfig } from "./httpClient";
import { recordMetric } from "./metrics";
import { ValidationResult, normalizeApiError } from "./types";

const BASE_URL = "https://api.brickognize.com";
const HEALTH_ENDPOINT = "/health";
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  capacity: 100,
  intervalMs: 60_000,
};

export class BrickognizeClient {
  private readonly apiKey: string | null;
  private readonly http: ExternalHttpClient;

  constructor(options: { apiKey?: string } = {}) {
    this.apiKey = options.apiKey ?? getBrickognizeApiKey();
    this.http = new ExternalHttpClient("brickognize", BASE_URL, {
      Accept: "application/json",
      "User-Agent": "BrickOps/1.0",
    });
  }

  async request<T>(
    options: Omit<RequestOptions, "rateLimit"> & { rateLimit?: RateLimitConfig },
  ): Promise<RequestResult<T>> {
    const headers = {
      ...(options.headers ?? {}),
    } as Record<string, string>;

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return this.http.request<T>({
      ...options,
      headers,
      rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async healthCheck(): Promise<ValidationResult> {
    const started = Date.now();
    try {
      const result = await this.request<{ status: string }>({
        path: HEALTH_ENDPOINT,
      });

      const duration = Date.now() - started;
      recordMetric("external.brickognize.health", {
        ok: true,
        status: result.status,
        durationMs: duration,
      });

      return {
        provider: "brickognize",
        ok: true,
        status: result.status,
        durationMs: duration,
      } satisfies ValidationResult;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("brickognize", error, { endpoint: HEALTH_ENDPOINT });
      const details = apiError.error.details as { status?: number } | undefined;

      recordMetric("external.brickognize.health", {
        ok: false,
        status: details?.status,
        errorCode: apiError.error.code,
        durationMs: duration,
      });
      return {
        provider: "brickognize",
        ok: false,
        status: details?.status,
        error: apiError,
        durationMs: duration,
      } satisfies ValidationResult;
    }
  }
}
