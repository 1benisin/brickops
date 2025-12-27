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

  if (typeof body === "string") {
    return body as BodyInit;
  }

  if (body instanceof ArrayBuffer) {
    return body as BodyInit;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body as BodyInit;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
};

export class ExternalHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly provider: ExternalProvider,
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string> = {},
    options: {
      fetchImpl?: FetchLike;
    } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T = unknown>(options: RequestOptions): Promise<RequestResult<T>> {
    const {
      method = "GET",
      query,
      headers,
      body,
      identityKey,
      // rateLimit is kept in RequestOptions for backwards compatibility but is now a no-op.
      // Rate limiting should be handled externally via consumeToken mutation.
      retry,
      expectJson = true,
    } = options;
    // Handle both baseUrl with/without trailing slash and path with/without leading slash
    const baseEndsWithSlash = this.baseUrl.endsWith("/");
    const pathStartsWithSlash = options.path.startsWith("/");

    let path: string;
    if (baseEndsWithSlash && pathStartsWithSlash) {
      // Remove leading slash from path to avoid double slash
      path = options.path.substring(1);
    } else if (!baseEndsWithSlash && !pathStartsWithSlash) {
      // Add slash between base and path
      path = `/${options.path}`;
    } else {
      // One has slash, one doesn't - use as is
      path = options.path;
    }

    const url = `${this.baseUrl}${path}${toSearchParams(query)}`;
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

    return withRetry(execute, retry ?? DEFAULT_RETRY);
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
      !(typeof Blob !== "undefined" && body instanceof Blob) &&
      !(typeof FormData !== "undefined" && body instanceof FormData);

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
