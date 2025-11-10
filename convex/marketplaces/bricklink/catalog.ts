import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  blCatalogItemIdentifierSchema,
  blCatalogItemColorIdentifierSchema,
  blCatalogSupersetsOptionsSchema,
  blCatalogSubsetsOptionsSchema,
  blCatalogPriceGuideOptionsSchema,
  blCatalogItemResponseSchema,
  blCatalogSupersetsResponseSchema,
  blCatalogSubsetsResponseSchema,
  blCatalogPartColorsResponseSchema,
  blCatalogPriceGuideResponseSchema,
  type BLCatalogItemIdentifier,
  type BLCatalogItemColorIdentifier,
  type BLCatalogSupersetsOptions,
  type BLCatalogSubsetsOptions,
  type BLCatalogPriceGuideOptions,
  type BLCatalogItemResponse,
  type BLCatalogSupersetsResponse,
  type BLCatalogSubsetsResponse,
  type BLCatalogPartColorsResponse,
  type BLCatalogPriceGuideResponse,
} from "./schema";
import { type BricklinkApiResponse, withBricklinkClient } from "./storeClient";

export async function getCatalogItem(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BLCatalogItemIdentifier;
  },
): Promise<BLCatalogItemResponse> {
  const identifier = blCatalogItemIdentifierSchema.parse(params.identifier);

  return await withBricklinkClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const response = await client.request<BricklinkApiResponse<BLCatalogItemResponse>>({
        path: `/items/${identifier.type.toLowerCase()}/${identifier.no}`,
        method: "GET",
      });

      return blCatalogItemResponseSchema.parse(response.data.data);
    },
  });
}

export async function getCatalogItemColors(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; identifier: BLCatalogItemIdentifier },
): Promise<BLCatalogPartColorsResponse> {
  const identifier = blCatalogItemIdentifierSchema.parse(params.identifier);

  return await withBricklinkClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const response = await client.request<
        BricklinkApiResponse<BLCatalogPartColorsResponse>
      >({
        path: `/items/${identifier.type.toLowerCase()}/${identifier.no}/colors`,
        method: "GET",
      });

      return blCatalogPartColorsResponseSchema.parse(response.data.data ?? []);
    },
  });
}

export async function getCatalogSupersets(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BLCatalogItemIdentifier;
    options?: BLCatalogSupersetsOptions;
  },
): Promise<BLCatalogSupersetsResponse> {
  const identifier = blCatalogItemIdentifierSchema.parse(params.identifier);
  const options = params.options
    ? blCatalogSupersetsOptionsSchema.parse(params.options)
    : undefined;

  return await withBricklinkClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const query: Record<string, string> = {};
      if (options?.colorId !== undefined) {
        query.color_id = String(options.colorId);
      }

      const response = await client.request<
        BricklinkApiResponse<BLCatalogSupersetsResponse>
      >({
        path: `/items/${identifier.type.toLowerCase()}/${identifier.no}/supersets`,
        method: "GET",
        query,
      });

      return blCatalogSupersetsResponseSchema.parse(response.data.data ?? []);
    },
  });
}

export async function getCatalogSubsets(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BLCatalogItemIdentifier;
    options?: BLCatalogSubsetsOptions;
  },
): Promise<BLCatalogSubsetsResponse> {
  const identifier = blCatalogItemIdentifierSchema.parse(params.identifier);
  const options = params.options
    ? blCatalogSubsetsOptionsSchema.parse(params.options)
    : undefined;

  return await withBricklinkClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const query: Record<string, string> = {};
      if (options?.colorId !== undefined) {
        query.color_id = String(options.colorId);
      }
      if (options?.box !== undefined) {
        query.box = String(options.box);
      }
      if (options?.instruction !== undefined) {
        query.instruction = String(options.instruction);
      }
      if (options?.breakMinifigs !== undefined) {
        query.break_minifigs = String(options.breakMinifigs);
      }
      if (options?.breakSubsets !== undefined) {
        query.break_subsets = String(options.breakSubsets);
      }

      const response = await client.request<BricklinkApiResponse<BLCatalogSubsetsResponse>>({
        path: `/items/${identifier.type.toLowerCase()}/${identifier.no}/subsets`,
        method: "GET",
        query,
      });

      return blCatalogSubsetsResponseSchema.parse(response.data.data ?? []);
    },
  });
}

export async function getCatalogPriceGuide(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    identifier: BLCatalogItemIdentifier;
    colorId: number;
    options?: BLCatalogPriceGuideOptions;
  },
): Promise<BLCatalogPriceGuideResponse> {
  const identifier = blCatalogItemIdentifierSchema.parse(params.identifier);
  const options = params.options
    ? blCatalogPriceGuideOptionsSchema.parse(params.options)
    : undefined;

  return await withBricklinkClient(ctx, {
    businessAccountId: params.businessAccountId,
    fn: async (client) => {
      const query: Record<string, string> = {
        color_id: String(params.colorId),
      };

      if (options?.guideType) {
        query.guide_type = options.guideType;
      }
      if (options?.newOrUsed) {
        query.new_or_used = options.newOrUsed;
      }
      if (options?.countryCode) {
        query.country_code = options.countryCode;
      }
      if (options?.region) {
        query.region = options.region;
      }
      if (options?.currencyCode) {
        query.currency_code = options.currencyCode;
      }
      if (options?.vat) {
        query.vat = options.vat;
      }

      const response = await client.request<
        BricklinkApiResponse<BLCatalogPriceGuideResponse>
      >({
        path: `/items/${identifier.type.toLowerCase()}/${identifier.no}/price`,
        method: "GET",
        query,
      });

      return blCatalogPriceGuideResponseSchema.parse(response.data.data);
    },
  });
}
