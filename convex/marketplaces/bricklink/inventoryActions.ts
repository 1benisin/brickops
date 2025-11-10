import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { recordMetric } from "../../lib/external/metrics";
import type { StoreOperationError, StoreOperationResult } from "../shared/types";
import {
  blInventoryCreatePayloadSchema,
  type BLInventoryCreatePayload,
  type BLInventoryUpdatePayload,
  type BLInventoryResponse,
} from "./schema";
import {
  type BricklinkApiResponse,
  type BricklinkRequestResult,
  normalizeBricklinkError,
  makeBricklinkRequest,
} from "./storeClient";
import { generateRequestId } from "./oauth";
import { z } from "zod";

// Mirrors BrickLink enum values so validation errors stay human readable.
const bricklinkItemTypeEnum = [
  "PART",
  "SET",
  "MINIFIG",
  "BOOK",
  "GEAR",
  "CATALOG",
  "INSTRUCTION",
  "UNSORTED_LOT",
  "ORIGINAL_BOX",
] as const;

const bricklinkConditionEnum = ["N", "U"] as const;

const bricklinkCompletenessEnum = ["C", "B", "S"] as const;

const bricklinkStockRoomIdEnum = ["A", "B", "C"] as const;

// BrickLink inventory payload as returned by the public API.
const bricklinkInventoryResponseSchema = z
  .object({
    inventory_id: z.number().int(),
    item: z
      .object({
        no: z.string(),
        name: z.string(),
        type: z.enum(bricklinkItemTypeEnum),
        category_id: z.number().int(),
      })
      .passthrough(),
    color_id: z.number().int(),
    color_name: z.string(),
    quantity: z.number().int(),
    new_or_used: z.enum(bricklinkConditionEnum),
    completeness: z.enum(bricklinkCompletenessEnum).optional(),
    unit_price: z.string(),
    bind_id: z.number().int().optional(),
    description: z.string().optional(),
    remarks: z.string().optional(),
    bulk: z.number().optional(),
    is_retain: z.boolean().optional(),
    is_stock_room: z.boolean().optional(),
    stock_room_id: z.enum(bricklinkStockRoomIdEnum).optional(),
    date_created: z.string(),
    my_cost: z.string().optional(),
    sale_rate: z.number().optional(),
    tier_quantity1: z.number().optional(),
    tier_price1: z.string().optional(),
    tier_quantity2: z.number().optional(),
    tier_price2: z.string().optional(),
    tier_quantity3: z.number().optional(),
    tier_price3: z.string().optional(),
  })
  .passthrough();

// Basic inventory listing used by UI tables and internal sync jobs.
export async function getBLInventories(ctx: ActionCtx): Promise<BLInventoryResponse[]> {
  const query = { status: "Y" }; // "Y" will only get available inventories

  const response = await makeBricklinkRequest<BricklinkApiResponse<BLInventoryResponse[]>>(ctx, {
    path: "/inventories",
    method: "GET",
    query,
  });
  const inventories = response.data.data ?? [];
  return inventories.map(
    (inventory) => bricklinkInventoryResponseSchema.parse(inventory) as BLInventoryResponse,
  );
}

export async function getBLInventory(
  ctx: ActionCtx,
  params: { inventoryId: number },
): Promise<BLInventoryResponse> {
  const { inventoryId } = params;

  const response = await makeBricklinkRequest<BricklinkApiResponse<BLInventoryResponse>>(ctx, {
    path: `/inventories/${inventoryId}`,
    method: "GET",
  });

  return bricklinkInventoryResponseSchema.parse(response.data.data) as BLInventoryResponse;
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
    const correlationId = generateRequestId();

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
  const correlationId = generateRequestId();

  let requestResult: BricklinkRequestResult<BricklinkApiResponse<unknown>>;
  try {
    requestResult = await makeBricklinkRequest<BricklinkApiResponse<unknown>>(ctx, {
      path: "/inventories",
      method: "POST",
      body: normalizedPayload,
      correlationId,
      headers: {
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    const normalizedError = normalizeBricklinkError(error);

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

  const parsedInventory = bricklinkInventoryResponseSchema.safeParse(inventoryData);
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
  const { inventoryId, payload } = params;

  // Validate structured input before building the BrickLink delta payload.
  validateUpdatePayload(payload);

  const correlationId = generateRequestId();

  let previousInventory: BLInventoryResponse | undefined;
  // Capture the record prior to updates so compensating operations have the original state.
  try {
    const previousResponse = await makeBricklinkRequest<BricklinkApiResponse<BLInventoryResponse>>(
      ctx,
      {
        path: `/inventories/${inventoryId}`,
        method: "GET",
      },
    );

    if (previousResponse.data.data) {
      previousInventory = bricklinkInventoryResponseSchema.parse(
        previousResponse.data.data,
      ) as BLInventoryResponse;
    }
  } catch {
    // Ignore snapshot failures; rollback data will simply be omitted.
  }

  try {
    const response = await makeBricklinkRequest<BricklinkApiResponse<BLInventoryResponse>>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "PUT",
      body: payload,
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

    const updatedInventory = bricklinkInventoryResponseSchema.parse(
      inventoryData,
    ) as BLInventoryResponse;

    const hasQuantityChange = payload.quantity !== undefined;
    const hasPriceChange = payload.unit_price !== undefined;
    const hasLocationChange = payload.remarks !== undefined;
    const hasNotesChange = payload.description !== undefined;

    const rollbackData =
      previousInventory &&
      (hasQuantityChange || hasPriceChange || hasLocationChange || hasNotesChange)
        ? {
            previousQuantity: hasQuantityChange ? previousInventory.quantity : undefined,
            previousPrice: hasPriceChange ? previousInventory.unit_price : undefined,
            previousLocation: hasLocationChange ? previousInventory.remarks : undefined,
            previousNotes: hasNotesChange ? previousInventory.description : undefined,
            originalPayload: previousInventory,
          }
        : undefined;

    return {
      success: true,
      marketplaceId: updatedInventory.inventory_id,
      correlationId,
      rollbackData,
    } satisfies StoreOperationResult;
  } catch (error) {
    return {
      success: false,
      error: normalizeBricklinkError(error),
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
  const { inventoryId } = params;

  if (!inventoryId || inventoryId <= 0) {
    return {
      success: false,
      error: {
        code: "INVALID_INVENTORY_ID",
        message: "inventoryId must be a positive number",
        retryable: false,
      },
      correlationId: generateRequestId(),
    } satisfies StoreOperationResult;
  }

  const correlationId = generateRequestId();

  let existingInventory: BLInventoryResponse | undefined;
  // For deletes, we persist the original payload so compensating mutations can recreate it.
  try {
    const existingResponse = await makeBricklinkRequest<BricklinkApiResponse<BLInventoryResponse>>(
      ctx,
      {
        path: `/inventories/${inventoryId}`,
        method: "GET",
      },
    );

    if (existingResponse.data.data) {
      existingInventory = bricklinkInventoryResponseSchema.parse(existingResponse.data.data);
    }
  } catch {
    // Ignore snapshot failures; rollback data will be omitted.
  }

  try {
    await makeBricklinkRequest<BricklinkApiResponse<null>>(ctx, {
      path: `/inventories/${inventoryId}`,
      method: "DELETE",
      correlationId,
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
    return {
      success: false,
      error: normalizeBricklinkError(error),
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

function validateUpdatePayload(payload: BLInventoryUpdatePayload): void {
  if (payload.quantity !== undefined && !/^[+-]\d+$/.test(payload.quantity)) {
    throw new ConvexError({
      code: "INVALID_QUANTITY_FORMAT",
      message:
        'Quantity updates must use delta syntax with +/- prefix (e.g., "+5" or "-3"), not absolute values.',
      providedQuantity: payload.quantity,
    });
  }
  if (payload.unit_price !== undefined && Number.isNaN(Number(payload.unit_price))) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "unit_price must be a valid fixed-point number string",
    });
  }
}
