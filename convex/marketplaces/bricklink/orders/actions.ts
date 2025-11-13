import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import {
  blOrdersListFiltersSchema,
  blOrderSummaryResponseSchema,
  blOrderResponseSchema,
  blOrderItemResponseSchema,
  blOrderStatusUpdatePayloadSchema,
  blOrderPaymentStatusUpdatePayloadSchema,
  blDriveThruOptionsSchema,
  type BLOrdersListFilters,
  type BLOrderSummaryResponse,
  type BLOrderResponse,
  type BLOrderItemResponse,
  type BLOrderStatusUpdatePayload,
  type BLOrderPaymentStatusUpdatePayload,
  type BLDriveThruOptions,
} from "./schema";
import { withBlClient, type BLApiResponse, generateCorrelationId } from "../transport";

export interface OrderListParams {
  businessAccountId: Id<"businessAccounts">;
  filters?: BLOrdersListFilters;
}

export async function listOrders(
  ctx: ActionCtx,
  params: OrderListParams,
): Promise<BLOrderSummaryResponse[]> {
  const filters = params.filters ? blOrdersListFiltersSchema.parse(params.filters) : undefined;
  const { businessAccountId } = params;

  return await withBlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const query = buildOrderQuery(filters);

      const response = await client.request<BLApiResponse<BLOrderSummaryResponse[]>>({
        path: "/orders",
        method: "GET",
        query,
      });

      const data = response.data.data ?? [];
      return blOrderSummaryResponseSchema.array().parse(data);
    },
  });
}

export async function getOrder(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: number },
): Promise<BLOrderResponse> {
  const { businessAccountId, orderId } = params;

  return await withBlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const response = await client.request<BLApiResponse<BLOrderResponse>>({
        path: `/orders/${orderId}`,
        method: "GET",
      });

      return blOrderResponseSchema.parse(response.data.data);
    },
  });
}

export async function getOrderItems(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: number },
): Promise<BLOrderItemResponse[][]> {
  const { businessAccountId, orderId } = params;

  return await withBlClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const response = await client.request<BLApiResponse<BLOrderItemResponse[][]>>({
        path: `/orders/${orderId}/items`,
        method: "GET",
      });

      const data = response.data.data ?? [];
      return blOrderItemResponseSchema.array().array().parse(data);
    },
  });
}

export async function updateOrderStatus(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    orderId: number;
    payload: BLOrderStatusUpdatePayload;
  },
): Promise<void> {
  const payload = blOrderStatusUpdatePayloadSchema.parse(params.payload);

  await withBlClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      await client.request<BLApiResponse<null>>({
        path: `/orders/${params.orderId}/status`,
        method: "PUT",
        body: payload,
        correlationId: generateCorrelationId(),
      });
    },
  });
}

export async function updateOrderPaymentStatus(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    orderId: number;
    payload: BLOrderPaymentStatusUpdatePayload;
  },
): Promise<void> {
  const payload = blOrderPaymentStatusUpdatePayloadSchema.parse(params.payload);

  await withBlClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      await client.request<BLApiResponse<null>>({
        path: `/orders/${params.orderId}/payment_status`,
        method: "PUT",
        body: payload,
        correlationId: generateCorrelationId(),
      });
    },
  });
}

export async function sendDriveThruEmail(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    orderId: number;
    options?: BLDriveThruOptions;
  },
): Promise<void> {
  const options = params.options ? blDriveThruOptionsSchema.parse(params.options) : undefined;

  await withBlClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const query: Record<string, string> = {};
      if (options?.mailMe !== undefined) {
        query.mail_me = String(options.mailMe);
      }

      await client.request<BLApiResponse<null>>({
        path: `/orders/${params.orderId}/drive_thru`,
        method: "POST",
        query,
        correlationId: generateCorrelationId(),
      });
    },
  });
}

function buildOrderQuery(filters?: BLOrdersListFilters): Record<string, string | boolean> {
  const query: Record<string, string | boolean> = {};
  if (!filters) {
    return query;
  }

  if (filters.direction) {
    query.direction = filters.direction;
  }

  if (filters.status) {
    const value = serializeIncludeExclude(filters.status, (status) => status);
    if (value) {
      query.status = value;
    }
  }

  if (filters.filed !== undefined) {
    query.filed = filters.filed;
  }

  return query;
}

function serializeIncludeExclude<T>(
  input: { include?: T[]; exclude?: T[] } | undefined,
  map: (value: T) => string,
): string | undefined {
  if (!input) {
    return undefined;
  }

  const values: string[] = [];
  if (input.include?.length) {
    values.push(...input.include.map((value) => map(value)));
  }
  if (input.exclude?.length) {
    values.push(...input.exclude.map((value) => `-${map(value)}`));
  }

  return values.length > 0 ? values.join(",") : undefined;
}
