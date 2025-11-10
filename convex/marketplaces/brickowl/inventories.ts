import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { recordMetric } from "../../lib/external/metrics";
import type { StoreOperationResult } from "../shared/types";
import {
  withBrickOwlClient,
  createBrickOwlRequestState,
  type BrickOwlHttpClient,
} from "./credentials";
import {
  boInventoryListParamsSchema,
  boInventoryCreatePayloadSchema,
  boInventoryUpdatePayloadSchema,
  boInventoryDeletePayloadSchema,
  boInventoryResponseSchema,
  type BOInventoryListParams,
  type BOInventoryCreatePayload,
  type BOInventoryUpdatePayload,
  type BOInventoryResponse,
} from "./schema";
import { normalizeBrickOwlError } from "./storeClient";
import { generateRequestId } from "./auth";
import { executeBulkRequests, type BrickOwlBulkOptions } from "./bulk";

export interface ListInventoriesParams {
  businessAccountId: Id<"businessAccounts">;
  filters?: BOInventoryListParams;
}

export type BrickOwlInventoryIdentifierInput =
  | { lotId: string; externalId?: never }
  | { externalId: string; lotId?: never };

export interface BrickOwlInventoryOperationOptions {
  dryRun?: boolean;
  idempotencyKey?: string;
}

export async function listInventories(
  ctx: ActionCtx,
  params: ListInventoriesParams,
): Promise<BOInventoryResponse[]> {
  const filters = params.filters
    ? boInventoryListParamsSchema.parse(params.filters)
    : undefined;

  return await withBrickOwlClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const queryParams = buildInventoryQuery(filters);

      const response = await client.requestWithRetry<BOInventoryResponse[]>({
        path: "/inventory/list",
        method: "GET",
        queryParams,
        isIdempotent: true,
      });

      return response.map((item) => boInventoryResponseSchema.parse(item));
    },
  });
}

export async function getInventory(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; identifier: BrickOwlInventoryIdentifierInput },
): Promise<BOInventoryResponse> {
  const normalized = normalizeInventoryIdentifier(params.identifier);

  return await withBrickOwlClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const response = await client.requestWithRetry<BOInventoryResponse[]>({
        path: "/inventory/list",
        method: "GET",
        queryParams: {
          active_only: "1",
          [normalized.queryField]: normalized.value,
        },
        isIdempotent: true,
      });

      const items = response.map((item) => boInventoryResponseSchema.parse(item));

      if (items.length === 0) {
        throw new ConvexError(`Inventory lot ${normalized.value} not found on BrickOwl`);
      }

      return items[0];
    },
  });
}

export async function createInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    payload: BOInventoryCreatePayload;
    options?: BrickOwlInventoryOperationOptions;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, payload } = params;
  const options = params.options ?? {};

  boInventoryCreatePayloadSchema.parse(payload);
  validateCreatePayload(payload);

  const correlationId = generateRequestId();

  if (options.dryRun) {
    return {
      success: true,
      marketplaceId: "dry-run-lot-id",
      correlationId,
      rollbackData: {
        originalPayload: payload,
      },
    };
  }

  return await withBrickOwlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const requestState = options.idempotencyKey ? createBrickOwlRequestState() : undefined;

      try {
        const response = await client.requestWithRetry<BOInventoryResponse>(
          {
            path: "/inventory/create",
            method: "POST",
            body: payload,
            correlationId,
            idempotencyKey: options.idempotencyKey,
            isIdempotent: !!options.idempotencyKey,
          },
          requestState,
        );

        const inventory = boInventoryResponseSchema.parse(response);

        recordMetric("external.brickowl.inventory.create.success", {
          businessAccountId,
          correlationId,
        });

        return {
          success: true,
          marketplaceId: inventory.lot_id,
          correlationId,
          rollbackData: {
            originalPayload: payload,
          },
        };
      } catch (error) {
        const normalized = normalizeBrickOwlError(error);

        recordMetric("external.brickowl.inventory.create.failure", {
          businessAccountId,
          correlationId,
          errorCode: normalized.code,
        });

        return {
          success: false,
          correlationId,
          error: normalized,
        };
      }
    },
  });
}

export async function updateInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BrickOwlInventoryIdentifierInput;
    payload: BOInventoryUpdatePayload;
    options?: BrickOwlInventoryOperationOptions;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, identifier, payload } = params;
  const options = params.options ?? {};

  boInventoryUpdatePayloadSchema.parse(payload);
  validateUpdatePayload(payload);

  const normalized = normalizeInventoryIdentifier(identifier);
  const correlationId = generateRequestId();

  return await withBrickOwlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      if (options.dryRun) {
        return {
          success: true,
          marketplaceId: normalized.value,
          correlationId,
        };
      }

      const current = await fetchInventoryWithClient(client, normalized);
      const requestState = options.idempotencyKey ? createBrickOwlRequestState() : undefined;

      try {
        const body = buildInventoryMutationBody(normalized, payload);
        const response = await client.requestWithRetry<BOInventoryResponse>(
          {
            path: "/inventory/update",
            method: "POST",
            body,
            correlationId,
            idempotencyKey: options.idempotencyKey,
            isIdempotent: !!options.idempotencyKey,
          },
          requestState,
        );

        const inventory = boInventoryResponseSchema.parse(response);

        return {
          success: true,
          marketplaceId: inventory.lot_id,
          correlationId,
          rollbackData: {
            previousQuantity: toNumber(current.quantity ?? current.qty),
            previousPrice: extractPrice(current),
            previousNotes: current.personal_note ?? undefined,
          },
        };
      } catch (error) {
        return {
          success: false,
          correlationId,
          error: normalizeBrickOwlError(error),
        };
      }
    },
  });
}

export async function deleteInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BrickOwlInventoryIdentifierInput;
    options?: BrickOwlInventoryOperationOptions;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, identifier } = params;
  const options = params.options ?? {};

  const normalized = normalizeInventoryIdentifier(identifier);
  const correlationId = generateRequestId();

  return await withBrickOwlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      if (options.dryRun) {
        return {
          success: true,
          marketplaceId: normalized.value,
          correlationId,
        };
      }

      const requestPayload = buildInventoryMutationBody(normalized);
      boInventoryDeletePayloadSchema.parse(requestPayload);

      const current = await fetchInventoryWithClient(client, normalized);
      const requestState = options.idempotencyKey ? createBrickOwlRequestState() : undefined;

      try {
        await client.requestWithRetry(
          {
            path: "/inventory/delete",
            method: "POST",
            body: requestPayload,
            correlationId,
            idempotencyKey: options.idempotencyKey,
            isIdempotent: !!options.idempotencyKey,
          },
          requestState,
        );

        return {
          success: true,
          marketplaceId: normalized.value,
          correlationId,
          rollbackData: {
            originalPayload: current,
          },
        };
      } catch (error) {
        return {
          success: false,
          correlationId,
          error: normalizeBrickOwlError(error),
        };
      }
    },
  });
}

export async function bulkCreateInventories(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    payloads: BOInventoryCreatePayload[];
    options?: BrickOwlBulkOptions;
  },
): Promise<StoreOperationResult[]> {
  const { businessAccountId, payloads } = params;
  const options = params.options ?? {};

  payloads.forEach((payload) => {
    boInventoryCreatePayloadSchema.parse(payload);
    validateCreatePayload(payload);
  });

  const requests = payloads.map((payload) => ({
    endpoint: "inventory/create",
    request_method: "POST" as const,
    params: [payload],
  }));

  const result = await executeBulkRequests(ctx, {
    businessAccountId,
    requests,
    options,
  });

  return result.results.map((entry, index) => {
    const correlationId = generateRequestId();

    if (!entry.success) {
      const error =
        entry.error ?? {
          code: "UNKNOWN",
          message: "Unknown error during BrickOwl bulk create",
        };
      return {
        success: false,
        correlationId,
        error,
      };
    }

    try {
      const inventory = boInventoryResponseSchema.parse(entry.data);
      return {
        success: true,
        marketplaceId: inventory.lot_id,
        correlationId,
        rollbackData: {
          originalPayload: payloads[index],
        },
      };
    } catch (error) {
      return {
        success: false,
        correlationId,
        error: {
          code: "INVALID_RESPONSE",
          message: "BrickOwl bulk create returned invalid inventory payload",
          retryable: false,
          details: error instanceof Error ? error.message : error,
        },
      };
    }
  });
}

export async function bulkUpdateInventories(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    updates: Array<{ identifier: BrickOwlInventoryIdentifierInput; payload: BOInventoryUpdatePayload }>;
    options?: BrickOwlBulkOptions;
  },
): Promise<StoreOperationResult[]> {
  const { businessAccountId, updates } = params;
  const options = params.options ?? {};

  updates.forEach(({ payload }) => {
    boInventoryUpdatePayloadSchema.parse(payload);
    validateUpdatePayload(payload);
  });

  const requests = updates.map(({ identifier, payload }) => {
    const normalized = normalizeInventoryIdentifier(identifier);
    const body = buildInventoryMutationBody(normalized, payload);

    return {
      endpoint: "inventory/update",
      request_method: "POST" as const,
      params: [body],
    };
  });

  const result = await executeBulkRequests(ctx, {
    businessAccountId,
    requests,
    options,
  });

  return result.results.map((entry, index) => {
    const correlationId = generateRequestId();

    if (!entry.success) {
      const error =
        entry.error ?? {
          code: "UNKNOWN",
          message: "Unknown error during BrickOwl bulk update",
        };
      return {
        success: false,
        correlationId,
        error,
      };
    }

    try {
      const inventory = boInventoryResponseSchema.parse(entry.data);
      return {
        success: true,
        marketplaceId: inventory.lot_id,
        correlationId,
      };
    } catch (error) {
      return {
        success: false,
        correlationId,
        error: {
          code: "INVALID_RESPONSE",
          message: "BrickOwl bulk update returned invalid inventory payload",
          retryable: false,
          details: error instanceof Error ? error.message : error,
        },
      };
    }
  });
}

export async function bulkDeleteInventories(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifiers: BrickOwlInventoryIdentifierInput[];
    options?: BrickOwlBulkOptions;
  },
): Promise<StoreOperationResult[]> {
  const { businessAccountId, identifiers } = params;
  const options = params.options ?? {};

  const requests = identifiers.map((identifier) => {
    const normalized = normalizeInventoryIdentifier(identifier);
    const body = buildInventoryMutationBody(normalized);

    boInventoryDeletePayloadSchema.parse(body);

    return {
      endpoint: "inventory/delete",
      request_method: "POST" as const,
      params: [body],
    };
  });

  const result = await executeBulkRequests(ctx, {
    businessAccountId,
    requests,
    options,
  });

  return result.results.map((entry, index) => {
    const correlationId = generateRequestId();
    const normalized = normalizeInventoryIdentifier(identifiers[index]);

    if (!entry.success) {
      const error =
        entry.error ?? {
          code: "UNKNOWN",
          message: "Unknown error during BrickOwl bulk delete",
        };
      return {
        success: false,
        correlationId,
        error,
      };
    }

    if (entry.data) {
      try {
        const inventory = boInventoryResponseSchema.parse(entry.data);
        return {
          success: true,
          marketplaceId: inventory.lot_id,
          correlationId,
        };
      } catch {
        // fall through to using identifier value
      }
    }

    return {
      success: true,
      marketplaceId: normalized.value,
      correlationId,
    };
  });
}

function buildInventoryQuery(filters?: BOInventoryListParams): Record<string, string> {
  const query: Record<string, string> = {};

  const activeOnly = filters?.active_only ?? true;
  query.active_only = formatBooleanish(activeOnly);

  if (filters?.type) {
    query.type = filters.type;
  }

  if (filters?.external_id_1) {
    query.external_id_1 = filters.external_id_1;
  }

  if (filters?.lot_id) {
    query.lot_id = filters.lot_id;
  }

  return query;
}

interface NormalizedInventoryIdentifier {
  type: "lot_id" | "external_id";
  value: string;
  queryField: "lot_id" | "external_id_1";
}

function normalizeInventoryIdentifier(
  identifier: BrickOwlInventoryIdentifierInput,
): NormalizedInventoryIdentifier {
  const lotId = "lotId" in identifier ? identifier.lotId : undefined;
  const externalId = "externalId" in identifier ? identifier.externalId : undefined;

  if (lotId && externalId) {
    throw new ConvexError("Specify only one of lotId or externalId for BrickOwl inventory identifier");
  }

  if (!lotId && !externalId) {
    throw new ConvexError("BrickOwl inventory identifier requires lotId or externalId");
  }

  if (lotId) {
    return {
      type: "lot_id",
      value: lotId,
      queryField: "lot_id",
    };
  }

  return {
    type: "external_id",
    value: externalId!,
    queryField: "external_id_1",
  };
}

async function fetchInventoryWithClient(
  client: BrickOwlHttpClient,
  identifier: NormalizedInventoryIdentifier,
): Promise<BOInventoryResponse> {
  const response = await client.requestWithRetry<BOInventoryResponse[]>({
    path: "/inventory/list",
    method: "GET",
    queryParams: {
      active_only: "1",
      [identifier.queryField]: identifier.value,
    },
    isIdempotent: true,
  });

  const items = response.map((item) => boInventoryResponseSchema.parse(item));

  if (items.length === 0) {
    throw new ConvexError(`Inventory lot ${identifier.value} not found on BrickOwl`);
  }

  return items[0];
}

function buildInventoryMutationBody(
  identifier: NormalizedInventoryIdentifier,
  payload?: BOInventoryUpdatePayload,
): Record<string, unknown> {
  return {
    ...(identifier.type === "lot_id" ? { lot_id: identifier.value } : { external_id: identifier.value }),
    ...(payload ?? {}),
  };
}

function validateCreatePayload(payload: BOInventoryCreatePayload): void {
  if (!payload.boid) {
    throw new ConvexError("boid is required");
  }
  if (!payload.quantity || payload.quantity < 1) {
    throw new ConvexError("quantity must be >= 1");
  }
  if (!payload.price || payload.price < 0) {
    throw new ConvexError("price must be positive");
  }
  if (!payload.condition) {
    throw new ConvexError("condition is required");
  }
}

function validateUpdatePayload(payload: BOInventoryUpdatePayload): void {
  if (payload.absolute_quantity !== undefined && payload.relative_quantity !== undefined) {
    throw new ConvexError("Cannot use both absolute_quantity and relative_quantity");
  }
  if (payload.price !== undefined && payload.price < 0) {
    throw new ConvexError("price must be positive");
  }
}

function formatBooleanish(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "number") {
    return value === 0 ? "0" : "1";
  }
  if (typeof value === "string") {
    return value === "0" ? "0" : "1";
  }
  return "1";
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return undefined;
}

function extractPrice(inventory: BOInventoryResponse): string | undefined {
  return (
    toOptionalString(inventory.price) ??
    toOptionalString(inventory.final_price) ??
    toOptionalString(inventory.base_price)
  );
}

