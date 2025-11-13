import type { PriceGuideRecord } from "@/convex/catalog/mutations";
import type { OAuthCredentials } from "../../oauth";
import type { BLCatalogCtx } from "../../transport";
import { loadBlCatalogCredentials } from "../../transport";
import { requestCatalogResource } from "../shared/request";
import {
  blCatalogPriceGuideResponseSchema,
  type BLCatalogPriceGuideResponse,
} from "./schema";
import { mapPriceGuide } from "./transformers";

export interface FetchBlPriceGuideParams {
  itemNo: string;
  colorId: number;
  itemType?: "part" | "set" | "minifig";
  currencyCode?: string;
}

type GuideType = "stock" | "sold";
type ConditionFlag = "N" | "U";

interface PriceGuideVariantOptions {
  itemType: "part" | "set" | "minifig";
  itemNo: string;
  colorId: number;
  guideType: GuideType;
  newOrUsed: ConditionFlag;
  currencyCode: string;
}

async function fetchPriceGuideVariant(
  ctx: BLCatalogCtx | undefined,
  credentials: OAuthCredentials | undefined,
  options: PriceGuideVariantOptions,
): Promise<PriceGuideRecord> {
  const path = `/items/${options.itemType}/${options.itemNo}/price`;
  const { data } = await requestCatalogResource<BLCatalogPriceGuideResponse>(
    ctx,
    {
      path,
      query: {
        color_id: options.colorId,
        guide_type: options.guideType,
        new_or_used: options.newOrUsed,
        currency_code: options.currencyCode,
      },
    },
    credentials ? { credentials } : undefined,
  );

  const parsed = blCatalogPriceGuideResponseSchema.parse(data);
  return mapPriceGuide(parsed, options.guideType, options.colorId);
}

export async function fetchBlPriceGuide(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPriceGuideParams,
): Promise<{
  usedStock: PriceGuideRecord;
  newStock: PriceGuideRecord;
  usedSold: PriceGuideRecord;
  newSold: PriceGuideRecord;
}> {
  const itemType = params.itemType ?? "part";
  const currencyCode = params.currencyCode ?? "USD";
  const credentials = await loadBlCatalogCredentials(ctx);

  const [usedStock, newStock, usedSold, newSold] = await Promise.all([
    fetchPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "N",
      currencyCode,
    }),
    fetchPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "sold",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "sold",
      newOrUsed: "N",
      currencyCode,
    }),
  ]);

  return {
    usedStock,
    newStock,
    usedSold,
    newSold,
  };
}


