import type { BLCatalogCtx } from "../../transport";
import { requestCatalogResource } from "../shared/request";
import {
  blCatalogColorResponseSchema,
  type BLCatalogColorResponse,
  type ColorRecord,
} from "./schema";
import { mapColor } from "./transformers";

export interface FetchBlColorParams {
  colorId: number;
}

export async function fetchBlColor(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlColorParams,
): Promise<ColorRecord> {
  const path = `/colors/${params.colorId}`;
  const { data } = await requestCatalogResource<BLCatalogColorResponse>(ctx, { path });
  const parsed = blCatalogColorResponseSchema.parse(data);
  return mapColor(parsed);
}

export async function fetchAllBlColors(
  ctx: BLCatalogCtx | undefined,
): Promise<ColorRecord[]> {
  const path = "/colors";
  const { data } = await requestCatalogResource<BLCatalogColorResponse[]>(ctx, { path });
  return blCatalogColorResponseSchema.array().parse(data).map(mapColor);
}

