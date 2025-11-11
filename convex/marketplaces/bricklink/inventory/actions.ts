import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { recordMetric } from "../../../lib/external/metrics";
import type { StoreOperationError, StoreOperationResult } from "../../shared/storeTypes";
import {
  blInventoryCreatePayloadSchema,
  blInventoryResponseSchema,
  blInventoryUpdatePayloadSchema,
  type BLInventoryCreatePayload,
  type BLInventoryResponse,
  type BLInventoryUpdatePayload,
} from "./schema";
import { makeBlRequest, type BLRequestResult } from "../client";
import { normalizeBlStoreError } from "../errors";
import { generateCorrelationId } from "../shared/ids";

export async function getBLInventories(ctx: ActionCtx): Promise<BLInventoryResponse[]> {
  const query = { status: "Y" };

  const response = await makeBlRequest<BLInventoryResponse[]>(ctx, {
    path: "/inventories",
    method: "GET",
    query,
  });
  const inventories = response.data.data ?? [];
  return inventories.map((inventory) => blInventoryResponseSchema.parse(inventory));
}

export async function getBLInventory(
  ctx: ActionCtx,
  params: { inventoryId: number },
): Promise<BLInventoryResponse> {
  const { inventoryId } = params;

  const response = await makeBlRequest<BLInventoryResponse>(ctx, {
    path: `/inventories/${inventoryId}`,
    method: "GET",
  });

  return blInventoryResponseSchema.parse(response.data.data);
}

export async function createBLInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    payload: BLInventoryCreatePayload;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, payload } = params;

  const validation = validateCreatePayload(payload);
  if (!validation.ok) {
    const correlationId = generateCorrelationId();

    recordMetric("external.bricklink.inventory.create.validation_failure", {
      correlationId,
      businessAccountId,
      errorCode: validation.error.code,
    });

    return {
      success: false,
      correlationId,
      error: validation.error,
    } satisfies StoreOperationResult;
  }

  const normalizedPayload = validation.payload;
  const correlationId = generateCorrelationId();

  let requestResult: BLRequestResult<unknown>;
  try {
    requestResult = await makeBlRequest<unknown>(ctx, {
      path: "/inventories",
      method: "POST",
      body: normalizedPayload,
      correlationId,
      headers: {
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    const normalizedError = normalizeBlStoreError(error);

    recordMetric("external.bricklink.inventory.create.failure", {
      correlationId,
      businessAccountId,
      errorCode: normalizedError.code,
      retryable: normalizedError.retryable,
    });

    return {
      success: false,
      correlationId,
      error: normalizedError,
    } satisfies StoreOperationResult;
  }

  const envelope = requestResult.data;
  const inventoryData = envelope?.data;

  if (!inventoryData) {
    const error: StoreOperationError = {
      code: "INVALID_RESPONSE",
      message: "BrickLink API returned an empty inventory payload",
      retryable: true,
      details: {
        envelopePreview: sampleJson(envelope, 8192),
      },
    };

    recordMetric("external.bricklink.inventory.create.failure", {
      correlationId,
      businessAccountId,
      errorCode: error.code,
      retryable: error.retryable,
    });

    return {
      success: false,
      correlationId,
      error,
    } satisfies StoreOperationResult;
  }

  const parsedInventory = blInventoryResponseSchema.safeParse(inventoryData);
  if (!parsedInventory.success) {
    const error: StoreOperationError = {
      code: "INVALID_RESPONSE",
      message: "BrickLink API returned an unexpected inventory structure",
      retryable: false,
      details: {
        issues: parsedInventory.error.issues,
        sample: sampleJson(inventoryData, 8192),
      },
    };

    recordMetric("external.bricklink.inventory.create.failure", {
      correlationId,
      businessAccountId,
      errorCode: error.code,
      retryable: error.retryable,
    });

    return {
      success: false,
      correlationId,
      error,
    } satisfies StoreOperationResult;
  }

  const createdInventory = parsedInventory.data;

  recordMetric("external.bricklink.inventory.create.success", {
    correlationId,
    businessAccountId,
    marketplaceId: createdInventory.inventory_id,
  });

  return {
    success: true,
    marketplaceId: createdInventory.inventory_id,
    correlationId,
    rollbackData: {
      originalPayload: normalizedPayload,
    },
  } satisfies StoreOperationResult;
}

export async function updateBLInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    inventoryId: number;
    payload: BLInventoryUpdatePayload;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, inventoryId, payload } = params;

  const validation = validateUpdatePayload(payload);
  if (!validation.ok) {
    const correlationId = generateCorrelationId();

    recordMetric("external.bricklink.inventory.update.validation_failure", {
      correlationId,
      businessAccountId,
      errorCode: validation.error.code,
    });

    return {
      success: false,
      correlationId,
      error: validation.error,
    } satisfies StoreOperationResult;
  }

  const normalizedPayload = validation.payload;

  const correlationId = generateCorrelationId();

  let previousInventory: BLInventoryResponse | undefined;
  try {
    const previousResponse = await makeBlRequest<BLInventoryResponse>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "GET",
    });

    if (previousResponse.data.data) {
      previousInventory = blInventoryResponseSchema.parse(previousResponse.data.data);
    }
  } catch {
    // ignore snapshot failures
  }

  try {
    const response = await makeBlRequest<BLInventoryResponse>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "PUT",
      body: normalizedPayload,
      correlationId,
    });

    const inventoryData = response.data.data;
    if (!inventoryData) {
      throw new ConvexError({
        code: "INVALID_RESPONSE",
        message: "BrickLink API returned invalid response structure",
        responseData: JSON.stringify(response.data),
      });
    }

    const updatedInventory = blInventoryResponseSchema.parse(inventoryData);

    const hasQuantityChange = normalizedPayload.quantity !== undefined;
    const hasPriceChange = normalizedPayload.unit_price !== undefined;
    const hasLocationChange = normalizedPayload.remarks !== undefined;
    const hasNotesChange = normalizedPayload.description !== undefined;

    const rollbackData =
      previousInventory &&
      (hasQuantityChange || hasPriceChange || hasLocationChange || hasNotesChange)
        ? {
            previousQuantity: hasQuantityChange ? previousInventory.quantity : undefined,
            previousPrice: hasPriceChange ? previousInventory.unit_price : undefined,
            previousLocation: hasLocationChange
              ? previousInventory.remarks ?? undefined
              : undefined,
            previousNotes: hasNotesChange ? previousInventory.description ?? undefined : undefined,
            originalPayload: previousInventory,
          }
        : undefined;

    recordMetric("external.bricklink.inventory.update.success", {
      correlationId,
      businessAccountId,
      marketplaceId: updatedInventory.inventory_id,
    });

    return {
      success: true,
      marketplaceId: updatedInventory.inventory_id,
      correlationId,
      rollbackData,
    } satisfies StoreOperationResult;
  } catch (error) {
    const normalizedError = normalizeBlStoreError(error);

    recordMetric("external.bricklink.inventory.update.failure", {
      correlationId,
      businessAccountId,
      errorCode: normalizedError.code,
      retryable: normalizedError.retryable,
    });

    return {
      success: false,
      error: normalizedError,
      correlationId,
    } satisfies StoreOperationResult;
  }
}

export async function deleteBLInventory(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    inventoryId: number;
  },
): Promise<StoreOperationResult> {
  const { businessAccountId, inventoryId } = params;

  if (!inventoryId || inventoryId <= 0) {
    const correlationId = generateCorrelationId();

    recordMetric("external.bricklink.inventory.delete.validation_failure", {
      correlationId,
      businessAccountId,
      errorCode: "INVALID_INVENTORY_ID",
    });

    return {
      success: false,
      error: {
        code: "INVALID_INVENTORY_ID",
        message: "inventoryId must be a positive number",
        retryable: false,
      },
      correlationId,
    } satisfies StoreOperationResult;
  }

  const correlationId = generateCorrelationId();

  let existingInventory: BLInventoryResponse | undefined;
  try {
    const existingResponse = await makeBlRequest<BLInventoryResponse>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "GET",
    });

    if (existingResponse.data.data) {
      existingInventory = blInventoryResponseSchema.parse(existingResponse.data.data);
    }
  } catch {
    // ignore snapshot failures
  }

  try {
    await makeBlRequest<null>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "DELETE",
      correlationId,
    });

    recordMetric("external.bricklink.inventory.delete.success", {
      correlationId,
      businessAccountId,
      marketplaceId: inventoryId,
    });

    return {
      success: true,
      marketplaceId: inventoryId,
      correlationId,
      rollbackData: existingInventory
        ? {
            originalPayload: existingInventory,
          }
        : undefined,
    } satisfies StoreOperationResult;
  } catch (error) {
    const normalizedError = normalizeBlStoreError(error);

    recordMetric("external.bricklink.inventory.delete.failure", {
      correlationId,
      businessAccountId,
      errorCode: normalizedError.code,
      retryable: normalizedError.retryable,
    });

    return {
      success: false,
      error: normalizedError,
      correlationId,
    } satisfies StoreOperationResult;
  }
}

type CreatePayloadValidationResult =
  | { ok: true; payload: BLInventoryCreatePayload }
  | { ok: false; error: StoreOperationError };

function validateCreatePayload(payload: BLInventoryCreatePayload): CreatePayloadValidationResult {
  const parsedPayload = blInventoryCreatePayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid BrickLink inventory payload",
        retryable: false,
        details: {
          issues: parsedPayload.error.issues,
        },
      },
    };
  }

  const normalizedPayload: BLInventoryCreatePayload = {
    ...parsedPayload.data,
    item: {
      ...parsedPayload.data.item,
      no: parsedPayload.data.item.no.trim(),
    },
    unit_price: parsedPayload.data.unit_price.trim(),
  };

  if (!normalizedPayload.item.no) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "item.no (part number) is required",
        retryable: false,
        details: { field: "item.no" },
      },
    };
  }

  if (normalizedPayload.quantity < 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "quantity must be a non-negative number",
        retryable: false,
        details: { field: "quantity", value: normalizedPayload.quantity },
      },
    };
  }

  if (!normalizedPayload.unit_price) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "unit_price is required",
        retryable: false,
        details: { field: "unit_price" },
      },
    };
  }

  return {
    ok: true,
    payload: normalizedPayload,
  };
}

function sampleJson(value: unknown, limit = 8192): string {
  if (value === undefined) {
    return "undefined";
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return "";
    }
    if (serialized.length <= limit) {
      return serialized;
    }
    return `${serialized.slice(0, limit)}…[truncated]`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `[unserializable:${message}]`;
  }
}

type UpdatePayloadValidationResult =
  | { ok: true; payload: BLInventoryUpdatePayload }
  | { ok: false; error: StoreOperationError };

function validateUpdatePayload(payload: BLInventoryUpdatePayload): UpdatePayloadValidationResult {
  const parsedPayload = blInventoryUpdatePayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid BrickLink inventory update payload",
        retryable: false,
        details: parsedPayload.error.flatten(),
      },
    };
  }

  if (
    parsedPayload.data.unit_price !== undefined &&
    Number.isNaN(Number(parsedPayload.data.unit_price))
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "unit_price must be a valid fixed-point number string",
        retryable: false,
        details: { field: "unit_price", value: parsedPayload.data.unit_price },
      },
    };
  }

  return {
    ok: true,
    payload: parsedPayload.data,
  };
}
