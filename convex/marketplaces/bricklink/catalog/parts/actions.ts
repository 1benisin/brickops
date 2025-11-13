import type { PartColorRecord, UpsertPartData } from "@/convex/catalog/mutations";
import type { BLCatalogCtx } from "../../transport";
import { requestCatalogResource } from "../shared/request";
import {
  blCatalogItemResponseSchema,
  blCatalogPartColorResponseSchema,
  type BLCatalogItemResponse,
  type BLCatalogPartColorResponse,
  type BLPartExternalIds,
} from "./schema";
import { mapPart, mapPartColors } from "./transformers";

export interface FetchBlPartParams {
  itemNo: string;
  itemType?: "part" | "set" | "minifig";
  externalIds?: BLPartExternalIds;
}

export interface FetchBlPartColorsParams {
  itemNo: string;
}

export async function fetchBlPart(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPartParams,
): Promise<UpsertPartData> {
  const itemType = params.itemType ?? "part";
  const path = `/items/${itemType}/${params.itemNo}`;
  const { data } = await requestCatalogResource<BLCatalogItemResponse>(ctx, { path });
  const parsed = blCatalogItemResponseSchema.parse(data);
  return mapPart(parsed, params.externalIds);
}

export async function fetchBlPartColors(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPartColorsParams,
): Promise<PartColorRecord[]> {
  const path = `/items/part/${params.itemNo}/colors`;
  const { data } = await requestCatalogResource<BLCatalogPartColorResponse[]>(ctx, { path });
  const parsed = blCatalogPartColorResponseSchema.array().parse(data);
  return mapPartColors(params.itemNo, parsed);
}


