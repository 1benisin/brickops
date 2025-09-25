import { hmacSha1Base64, randomHex } from "../webcrypto";

import { getBricklinkCredentials } from "./env";
import { ExternalHttpClient, RequestOptions, RequestResult } from "./httpClient";
import { RateLimitConfig } from "./httpClient";
import { sharedRateLimiter } from "./inMemoryRateLimiter";
import { recordMetric } from "./metrics";
import { ValidationResult, normalizeApiError } from "./types";

const BASE_URL = "https://api.bricklink.com/api/store/v1";
const HEALTH_ENDPOINT = "/orders";

const PROVIDER_RATE_LIMIT: RateLimitConfig = {
  capacity: 5_000,
  intervalMs: 24 * 60 * 60 * 1_000,
};

const INTERNAL_RATE_LIMIT: RateLimitConfig = {
  capacity: 100,
  intervalMs: 60 * 60 * 1_000,
};

const ALERT_THRESHOLD = 0.8;

type NormalizedParams = Record<string, string | number | boolean | undefined>;

const percentEncode = (input: string) =>
  encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

const toParamEntries = (params: NormalizedParams) =>
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null);

const buildBaseString = (method: string, url: URL, params: [string, string][]) => {
  const normalizedParams = params
    .map(([key, value]) => ({ key: percentEncode(key), value: percentEncode(value) }))
    .sort((a, b) => {
      if (a.key === b.key) {
        return a.value.localeCompare(b.value);
      }
      return a.key.localeCompare(b.key);
    })
    .map(({ key, value }) => `${key}=${value}`)
    .join("&");

  const baseUrl = `${url.origin}${url.pathname}`;
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(normalizedParams)].join("&");
};

const buildSignature = async (
  method: string,
  url: URL,
  params: [string, string][],
  consumerSecret: string,
  tokenSecret: string,
) => {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const baseString = buildBaseString(method, url, params);
  return hmacSha1Base64(signingKey, baseString);
};

const toAuthHeader = (params: [string, string][]) =>
  `OAuth ${params
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;

type BricklinkClientOptions = {
  credentials?: ReturnType<typeof getBricklinkCredentials>;
  nonce?: () => string;
  timestamp?: () => number;
  fetchImpl?: typeof fetch;
};

export class BricklinkClient {
  private readonly http: ExternalHttpClient;
  private readonly credentials: ReturnType<typeof getBricklinkCredentials>;
  private readonly nonce: () => string;
  private readonly timestamp: () => number;

  private static quotaState = {
    count: 0,
    windowStart: 0,
    alertEmitted: false,
  };

  constructor(options: BricklinkClientOptions = {}) {
    this.credentials = options.credentials ?? getBricklinkCredentials();
    this.nonce = options.nonce ?? (() => randomHex(16));
    this.timestamp = options.timestamp ?? (() => Math.floor(Date.now() / 1000));
    this.http = new ExternalHttpClient(
      "bricklink",
      BASE_URL,
      {
        Accept: "application/json",
        "User-Agent": "BrickOps/1.0",
      },
      { fetchImpl: options.fetchImpl },
    );
  }

  static resetQuotaForTests() {
    BricklinkClient.quotaState = {
      count: 0,
      windowStart: 0,
      alertEmitted: false,
    };
  }

  private static recordQuotaUsage() {
    const now = Date.now();
    const windowElapsed = now - BricklinkClient.quotaState.windowStart;
    if (
      BricklinkClient.quotaState.windowStart === 0 ||
      windowElapsed >= PROVIDER_RATE_LIMIT.intervalMs
    ) {
      BricklinkClient.quotaState.windowStart = now;
      BricklinkClient.quotaState.count = 0;
      BricklinkClient.quotaState.alertEmitted = false;
    }

    const nextCount = BricklinkClient.quotaState.count + 1;
    const percentage = nextCount / PROVIDER_RATE_LIMIT.capacity;

    if (nextCount > PROVIDER_RATE_LIMIT.capacity) {
      recordMetric("external.bricklink.quota.blocked", {
        count: BricklinkClient.quotaState.count,
        capacity: PROVIDER_RATE_LIMIT.capacity,
        percentage: BricklinkClient.quotaState.count / PROVIDER_RATE_LIMIT.capacity,
      });
      throw new Error("Bricklink daily quota exceeded");
    }

    BricklinkClient.quotaState.count = nextCount;

    recordMetric("external.bricklink.quota", {
      count: nextCount,
      capacity: PROVIDER_RATE_LIMIT.capacity,
      percentage,
    });

    if (percentage >= ALERT_THRESHOLD && !BricklinkClient.quotaState.alertEmitted) {
      BricklinkClient.quotaState.alertEmitted = true;
      recordMetric("external.bricklink.quota.alert", {
        count: nextCount,
        capacity: PROVIDER_RATE_LIMIT.capacity,
        percentage,
      });
    }
  }

  async request<T>(options: RequestOptions & { identityKey?: string }): Promise<RequestResult<T>> {
    const method = (options.method ?? "GET").toUpperCase();
    const queryEntries = toParamEntries(options.query ?? {});
    const url = new URL(options.path.startsWith("/") ? options.path : `/${options.path}`, BASE_URL);

    const oauthParams: [string, string][] = [
      ["oauth_consumer_key", this.credentials.consumerKey],
      ["oauth_token", this.credentials.accessToken],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", this.timestamp().toString()],
      ["oauth_nonce", this.nonce()],
      ["oauth_version", "1.0"],
    ];

    const allParams: [string, string][] = [
      ...queryEntries.map(([key, value]): [string, string] => [key, String(value)]),
      ...oauthParams,
    ];

    const signature = await buildSignature(
      method,
      url,
      allParams,
      this.credentials.consumerSecret,
      this.credentials.tokenSecret,
    );

    const authorization = toAuthHeader([...oauthParams, ["oauth_signature", signature]]);

    BricklinkClient.recordQuotaUsage();

    // Provider quota (5,000 calls/day)
    sharedRateLimiter.consume({
      key: "bricklink:provider",
      capacity: PROVIDER_RATE_LIMIT.capacity,
      intervalMs: PROVIDER_RATE_LIMIT.intervalMs,
    });

    return this.http.request<T>({
      ...options,
      method,
      query: Object.fromEntries(queryEntries),
      headers: {
        ...(options.headers ?? {}),
        Authorization: authorization,
      },
      rateLimit: options.rateLimit ?? INTERNAL_RATE_LIMIT,
      identityKey: options.identityKey,
      retry: options.retry,
    });
  }

  async healthCheck(identityKey?: string): Promise<ValidationResult> {
    const started = Date.now();
    try {
      const result = await this.request<{ data: unknown }>({
        path: HEALTH_ENDPOINT,
        query: { direction: "in", limit: 1 },
        identityKey,
        rateLimit: INTERNAL_RATE_LIMIT,
      });

      const duration = Date.now() - started;
      recordMetric("external.bricklink.health", {
        ok: true,
        status: result.status,
        durationMs: duration,
      });

      return {
        provider: "bricklink",
        ok: true,
        status: result.status,
        durationMs: duration,
      } satisfies ValidationResult;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("bricklink", error, { endpoint: HEALTH_ENDPOINT });
      const details = apiError.error.details as { status?: number } | undefined;

      recordMetric("external.bricklink.health", {
        ok: false,
        status: details?.status,
        errorCode: apiError.error.code,
        durationMs: duration,
      });
      return {
        provider: "bricklink",
        ok: false,
        status: details?.status,
        error: apiError,
        durationMs: duration,
      } satisfies ValidationResult;
    }
  }
}
