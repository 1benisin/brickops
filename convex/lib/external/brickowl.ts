import { getBrickowlApiKey } from "./env";
import { ExternalHttpClient, RequestOptions, RequestResult } from "./httpClient";
import { RateLimitConfig } from "./httpClient";
import { HealthCheckResult, normalizeApiError } from "./types";
import { recordMetric } from "./metrics";

const BASE_URL = "https://api.brickowl.com/v1";
const HEALTH_ENDPOINT = "/user/info";
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  capacity: 600,
  intervalMs: 60_000,
};

export class BrickowlClient {
  private readonly apiKey: string;
  private readonly http: ExternalHttpClient;

  constructor(options: { apiKey?: string } = {}) {
    this.apiKey = options.apiKey ?? getBrickowlApiKey();
    this.http = new ExternalHttpClient("brickowl", BASE_URL, {
      Accept: "application/json",
      "User-Agent": "BrickOps/1.0",
    });
  }

  async request<T>(
    options: Omit<RequestOptions, "rateLimit"> & { rateLimit?: RateLimitConfig },
  ): Promise<RequestResult<T>> {
    const query = { ...(options.query ?? {}), key: this.apiKey };
    let body = options.body;

    if (
      options.method &&
      options.method.toUpperCase() !== "GET" &&
      body &&
      typeof body === "object"
    ) {
      body = { ...(body as Record<string, unknown>), key: this.apiKey };
    }

    return this.http.request<T>({
      ...options,
      query,
      body,
      rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const result = await this.request<{ user: { username: string } }>({
        path: HEALTH_ENDPOINT,
      });

      const duration = Date.now() - started;
      recordMetric("external.brickowl.health", {
        ok: true,
        status: result.status,
        durationMs: duration,
      });

      return {
        provider: "brickowl",
        ok: true,
        status: result.status,
        durationMs: duration,
      } satisfies HealthCheckResult;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("brickowl", error, { endpoint: HEALTH_ENDPOINT });
      const details = apiError.error.details as { status?: number } | undefined;

      recordMetric("external.brickowl.health", {
        ok: false,
        status: details?.status,
        errorCode: apiError.error.code,
        durationMs: duration,
      });
      return {
        provider: "brickowl",
        ok: false,
        status: details?.status,
        error: apiError,
        durationMs: duration,
      } satisfies HealthCheckResult;
    }
  }
}
