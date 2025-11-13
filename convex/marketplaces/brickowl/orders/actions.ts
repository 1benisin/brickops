import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { recordMetric } from "../../../lib/external/metrics";
import { withBoClient } from "../client";
import { normalizeBoStoreError } from "../errors";
import { generateCorrelationId } from "../ids";
import {
  boOrderListParamsSchema,
  boOrderResponseSchema,
  boOrderItemResponseSchema,
  type BOOrderListParams,
  type BOOrderResponse,
  type BOOrderItemResponse,
} from "./schema";

type OrdersMetricStatus = "success" | "failure";

function recordOrdersMetric(params: {
  businessAccountId: Id<"businessAccounts">;
  correlationId: string;
  endpoint: string;
  method: "GET" | "POST";
  status: OrdersMetricStatus;
  errorCode?: string;
}) {
  recordMetric("external.brickowl.orders", {
    businessAccountId: params.businessAccountId,
    correlationId: params.correlationId,
    endpoint: params.endpoint,
    method: params.method,
    status: params.status,
    ...(params.errorCode ? { errorCode: params.errorCode } : {}),
  });
}

export async function listOrders(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; filters?: BOOrderListParams },
): Promise<BOOrderResponse[]> {
  const { businessAccountId } = params;
  const filters = params.filters ? boOrderListParamsSchema.parse(params.filters) : undefined;

  return await withBoClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const correlationId = generateCorrelationId();
      const query = buildOrderListQuery(filters);
      try {
        const response = await client.requestWithRetry<
          BOOrderResponse[] | { orders?: BOOrderResponse[] }
        >({
          path: "/order/list",
          method: "GET",
          query,
          correlationId,
          isIdempotent: true,
        });

        const ordersRaw = Array.isArray(response) ? response : response?.orders ?? [];
        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/list",
          method: "GET",
          status: "success",
        });
        return ordersRaw.map((order) => boOrderResponseSchema.parse(order));
      } catch (error) {
        const normalized = normalizeBoStoreError(error);
        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/list",
          method: "GET",
          status: "failure",
          errorCode: normalized.code,
        });
        throw error;
      }
    },
  });
}

export async function getOrder(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: string },
): Promise<BOOrderResponse> {
  const { businessAccountId, orderId } = params;
  return await withBoClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const correlationId = generateCorrelationId();
      try {
        const response = await client.requestWithRetry<
          BOOrderResponse | { order?: BOOrderResponse }
        >({
          path: "/order/view",
          method: "GET",
          query: {
            order_id: orderId,
          },
          correlationId,
          isIdempotent: true,
        });

        const order =
          (typeof response === "object" && response !== null && "order" in response
            ? (response as { order?: BOOrderResponse }).order
            : response) ?? null;

        if (!order) {
          recordOrdersMetric({
            businessAccountId,
            correlationId,
            endpoint: "/order/view",
            method: "GET",
            status: "failure",
            errorCode: "NOT_FOUND",
          });
          throw new ConvexError(`BrickOwl order ${orderId} not found`);
        }

        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/view",
          method: "GET",
          status: "success",
        });

        return boOrderResponseSchema.parse(order);
      } catch (error) {
        if (error instanceof ConvexError && error.message.includes("not found")) {
          throw error;
        }
        const normalized = normalizeBoStoreError(error);
        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/view",
          method: "GET",
          status: "failure",
          errorCode: normalized.code,
        });
        throw error;
      }
    },
  });
}

export async function getOrderItems(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: string },
): Promise<BOOrderItemResponse[]> {
  const { businessAccountId, orderId } = params;
  return await withBoClient(ctx, {
    businessAccountId,
    fn: async (client) => {
      const correlationId = generateCorrelationId();
      try {
        const response = await client.requestWithRetry<
          BOOrderItemResponse[] | { items?: BOOrderItemResponse[] }
        >({
          path: "/order/items",
          method: "GET",
          query: {
            order_id: orderId,
          },
          correlationId,
          isIdempotent: true,
        });

        const items = Array.isArray(response) ? response : response?.items ?? [];
        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/items",
          method: "GET",
          status: "success",
        });
        return items.map((item) => boOrderItemResponseSchema.parse(item));
      } catch (error) {
        const normalized = normalizeBoStoreError(error);
        recordOrdersMetric({
          businessAccountId,
          correlationId,
          endpoint: "/order/items",
          method: "GET",
          status: "failure",
          errorCode: normalized.code,
        });
        throw error;
      }
    },
  });
}

function buildOrderListQuery(filters?: BOOrderListParams): Record<string, string> {
  if (!filters) {
    return {};
  }

  const query: Record<string, string> = {};

  if (filters.status !== undefined) {
    query.status = String(filters.status);
  }

  if (filters.order_time !== undefined) {
    query.order_time = String(filters.order_time);
  }

  if (filters.limit !== undefined) {
    query.limit = String(filters.limit);
  }

  if (filters.list_type !== undefined) {
    query.list_type = filters.list_type;
  }

  if (filters.sort_by !== undefined) {
    query.sort_by = filters.sort_by;
  }

  return query;
}
