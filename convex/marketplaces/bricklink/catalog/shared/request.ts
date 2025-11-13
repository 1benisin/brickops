import { normalizeApiError } from "../../../../lib/external/types";
import type {
  BLCatalogCtx,
  BLCatalogRequestOptions,
  BLCatalogRequestResult,
  CatalogRequestOverrides,
} from "../../transport";
import { makeBlCatalogRequest } from "../../transport";
import type { BLApiResponse, BLEnvelope } from "../../envelope";
import { parseBlEnvelope } from "../../envelope";

type EnvelopeContext = {
  endpoint: string;
  correlationId: string;
};

export type RequestCatalogResourceResult<T> = {
  response: BLCatalogRequestResult<T>;
  envelope: BLEnvelope;
  data: T;
};

export async function requestCatalogResource<T>(
  ctx: BLCatalogCtx | undefined,
  options: BLCatalogRequestOptions,
  overrides?: CatalogRequestOverrides,
): Promise<RequestCatalogResourceResult<T>> {
  const response = await makeBlCatalogRequest<T>(ctx, options, overrides);
  const { envelope, data } = parseCatalogEnvelope<T>(response.data, {
    endpoint: options.path,
    correlationId: response.correlationId,
  });

  return {
    response,
    envelope,
    data,
  };
}

export function parseCatalogEnvelope<T>(
  raw: BLApiResponse<unknown>,
  context: EnvelopeContext,
): { envelope: BLEnvelope; data: T } {
  try {
    const envelope = parseBlEnvelope(raw, context);
    return {
      envelope,
      data: envelope.data as T,
    };
  } catch (error) {
    throw normalizeApiError("bricklink", error, context);
  }
}

