import { ExternalHttpClient, type RequestOptions, type RequestResult } from "./httpClient";
import { recordMetric } from "./metrics";
import { getBrickowlApiKey } from "./env";
import { normalizeApiError, type HealthCheckResult } from "./types";

const BASE_URL = "https://api.brickowl.com/v1";
const VERIFY_KEY_ENDPOINT = "/verify_key";
const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "BrickOps/1.0",
};

const DEFAULT_RATE_LIMIT = {
  capacity: 60,
  intervalMs: 60_000,
};

export class BrickowlClient {
  private readonly http: ExternalHttpClient;
  private readonly apiKey: string;

  constructor({ apiKey }: { apiKey?: string } = {}) {
    const resolvedKey = (apiKey ?? getBrickowlApiKey()).trim();
    if (!resolvedKey) {
      throw new Error("BrickOwl API key is required");
    }

    this.apiKey = resolvedKey;
    this.http = new ExternalHttpClient("brickowl", BASE_URL, DEFAULT_HEADERS);
  }

  async request<T>(
    options: Omit<RequestOptions, "query" | "identityKey" | "rateLimit"> & {
      query?: RequestOptions["query"];
      identityKey?: string;
      rateLimit?: RequestOptions["rateLimit"];
    },
  ): Promise<RequestResult<T>> {
    const query = {
      ...(options.query ?? {}),
      key: this.apiKey,
    };

    return this.http.request<T>({
      ...options,
      query,
      identityKey: options.identityKey ?? this.apiKey,
      rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const response = await this.request<{ user?: { username?: string } }>({
        path: VERIFY_KEY_ENDPOINT,
      });

      const duration = Date.now() - started;
      recordMetric("external.brickowl.health", {
        ok: true,
        status: response.status,
        durationMs: duration,
        hasUser: Boolean(response.data?.user),
      });

      return {
        provider: "brickowl",
        ok: true,
        status: response.status,
        durationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("brickowl", error, { endpoint: VERIFY_KEY_ENDPOINT });
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
      };
    }
  }
}
