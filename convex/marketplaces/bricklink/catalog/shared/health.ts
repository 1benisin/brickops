import { recordMetric } from "../../../../lib/external/metrics";
import { normalizeApiError, type HealthCheckResult } from "../../../../lib/external/types";
import { makeBlCatalogRequest, type BLCatalogCtx } from "../../transport";

const HEALTH_ENDPOINT = "/orders";

export async function checkBlCatalogHealth(ctx?: BLCatalogCtx): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    const response = await makeBlCatalogRequest<unknown>(ctx, {
      path: HEALTH_ENDPOINT,
      query: { direction: "in", limit: 1 },
    });

    const duration = Date.now() - started;

    recordMetric("external.bricklink.catalog.health", {
      ok: true,
      status: response.status,
      durationMs: duration,
      correlationId: response.correlationId,
    });

    return {
      provider: "bricklink",
      ok: true,
      status: response.status,
      durationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - started;
    const apiError = normalizeApiError("bricklink", error, { endpoint: HEALTH_ENDPOINT });
    const details = (apiError.error.details ?? {}) as { status?: number; correlationId?: string };

    recordMetric("external.bricklink.catalog.health", {
      ok: false,
      status: details.status,
      errorCode: apiError.error.code,
      durationMs: duration,
      correlationId: details.correlationId,
    });

    return {
      provider: "bricklink",
      ok: false,
      status: details.status,
      error: apiError,
      durationMs: duration,
    };
  }
}


