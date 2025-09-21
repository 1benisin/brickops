import { CircuitBreaker } from "./circuitBreaker";
import { sharedRateLimiter } from "./rateLimiter";
import { RateLimiter } from "./rateLimiter";
import { RetryOptions, withRetry } from "./retry";
import { ApiError, ExternalProvider, RequestContext, toApiError } from "./types";

type FetchLike = typeof fetch;

export type RateLimitConfig = {
  capacity: number;
  intervalMs: number;
};

export type RequestOptions = {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  identityKey?: string;
  rateLimit?: RateLimitConfig;
  retry?: RetryOptions;
  expectJson?: boolean;
};

export type RequestResult<T> = {
  data: T;
  status: number;
  headers: Headers;
};

const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  initialDelayMs: 250,
  backoffFactor: 2,
  jitterRatio: 0.2,
};

const identitySegment = (identityKey?: string) => identityKey ?? "system";

const toSearchParams = (query?: Record<string, string | number | boolean | undefined>) => {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params.append(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

const serializeBody = (body: unknown) => {
  if (!body) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    (typeof Blob !== "undefined" && body instanceof Blob)
  ) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
};

export class ExternalHttpClient {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly provider: ExternalProvider,
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string> = {},
    options: {
      circuitBreaker?: CircuitBreaker;
      rateLimiter?: RateLimiter;
      fetchImpl?: FetchLike;
    } = {},
  ) {
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreaker();
    this.rateLimiter = options.rateLimiter ?? sharedRateLimiter;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T = unknown>(options: RequestOptions): Promise<RequestResult<T>> {
    const {
      method = "GET",
      query,
      headers,
      body,
      identityKey,
      rateLimit,
      retry,
      expectJson = true,
    } = options;
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const url = `${this.baseUrl}${path}${toSearchParams(query)}`;

    this.applyRateLimit({ endpoint: path, identityKey, rateLimit });

    const finalHeaders = this.buildHeaders(headers, body);

    const execute = async () => {
      const response = await this.fetchImpl(url, {
        method,
        headers: finalHeaders,
        body: serializeBody(body),
      });

      if (!response.ok) {
        throw await this.toError(response, {
          endpoint: path,
          identityKey,
          provider: this.provider,
        });
      }

      const data = expectJson
        ? ((await response.json()) as T)
        : ((await response.text()) as unknown as T);
      return {
        data,
        status: response.status,
        headers: response.headers,
      } satisfies RequestResult<T>;
    };

    const withCircuitBreaker = () => this.circuitBreaker.exec(execute);

    return withRetry(withCircuitBreaker, retry ?? DEFAULT_RETRY);
  }

  private applyRateLimit(context: {
    endpoint: string;
    identityKey?: string;
    rateLimit?: RateLimitConfig;
  }) {
    const { endpoint, identityKey, rateLimit } = context;
    if (!rateLimit) {
      return;
    }

    const key = `${this.provider}:${endpoint}:${identitySegment(identityKey)}`;
    this.rateLimiter.consume({
      key,
      capacity: rateLimit.capacity,
      intervalMs: rateLimit.intervalMs,
    });
  }

  private buildHeaders(headers?: Record<string, string>, body?: unknown) {
    const merged: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    const lowercaseKeys = Object.keys(merged).reduce<Record<string, string>>((acc, key) => {
      acc[key.toLowerCase()] = key;
      return acc;
    }, {});

    const hasJsonBody =
      body &&
      typeof body === "object" &&
      !(body instanceof ArrayBuffer) &&
      !(typeof Blob !== "undefined" && body instanceof Blob);

    if (hasJsonBody && !lowercaseKeys["content-type"]) {
      merged["Content-Type"] = "application/json";
    }

    return merged;
  }

  private async toError(response: Response, context: RequestContext): Promise<ApiError> {
    const { status } = response;
    let body: unknown = undefined;
    const contentType = response.headers.get("content-type") ?? "";

    try {
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }
    } catch (error) {
      body = { parseError: (error as Error).message };
    }

    const code = `HTTP_${status}`;
    const message = `External request failed with status ${status}`;
    return toApiError(code, message, {
      provider: this.provider,
      endpoint: context.endpoint,
      identityKey: context.identityKey,
      status,
      body,
    });
  }
}
