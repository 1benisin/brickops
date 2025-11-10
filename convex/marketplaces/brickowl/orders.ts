import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { createBrickOwlHttpClient } from "./credentials";
import {
  boOrderListParamsSchema,
  boOrderResponseSchema,
  boOrderItemResponseSchema,
  type BOOrderListParams,
  type BOOrderResponse,
  type BOOrderItemResponse,
} from "./schema";

export async function listOrders(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; filters?: BOOrderListParams },
): Promise<BOOrderResponse[]> {
  const { businessAccountId } = params;
  const filters = params.filters ? boOrderListParamsSchema.parse(params.filters) : undefined;

  const client = await createBrickOwlHttpClient(ctx, businessAccountId);
  const queryParams = buildOrderListQuery(filters);

  const response = await client.requestWithRetry<BOOrderResponse[] | { orders?: BOOrderResponse[] }>(
    {
      path: "/order/list",
      method: "GET",
      queryParams,
      isIdempotent: true,
    },
  );
    path: "/order/list",
    method: "GET",
    queryParams,
    isIdempotent: true,
  });

  const ordersRaw = Array.isArray(response)
    ? response
    : response?.orders ?? [];

  return ordersRaw.map((order) => boOrderResponseSchema.parse(order));
}

export async function getOrder(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: string },
): Promise<BOOrderResponse> {
  const { businessAccountId, orderId } = params;
  const client = await createBrickOwlHttpClient(ctx, businessAccountId);

  const response = await client.requestWithRetry<BOOrderResponse | { order?: BOOrderResponse }>({
    path: "/order/view",
    method: "GET",
    queryParams: {
      order_id: orderId,
    },
    isIdempotent: true,
  });

  const order =
    (typeof response === "object" && response !== null && "order" in response
      ? (response as { order?: BOOrderResponse }).order
      : response) ?? null;

  if (!order) {
    throw new ConvexError(`BrickOwl order ${orderId} not found`);
  }

  return boOrderResponseSchema.parse(order);
}

export async function getOrderItems(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; orderId: string },
): Promise<BOOrderItemResponse[]> {
  const { businessAccountId, orderId } = params;
  const client = await createBrickOwlHttpClient(ctx, businessAccountId);

  const response = await client.requestWithRetry<
    BOOrderItemResponse[] | { items?: BOOrderItemResponse[] }
  >({
    path: "/order/items",
    method: "GET",
    queryParams: {
      order_id: orderId,
    },
    isIdempotent: true,
  });

  const items = Array.isArray(response) ? response : response?.items ?? [];

  return items.map((item) => boOrderItemResponseSchema.parse(item));
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

