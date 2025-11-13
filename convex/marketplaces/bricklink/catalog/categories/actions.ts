import type { BLCatalogCtx } from "../../transport";
import { requestCatalogResource } from "../shared/request";
import {
  blCatalogCategoryResponseSchema,
  type BLCatalogCategoryResponse,
} from "./schema";
import { mapCategory, type CategoryRecord } from "./transformers";

export interface FetchBlCategoryParams {
  categoryId: number;
}

export async function fetchBlCategory(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlCategoryParams,
): Promise<CategoryRecord> {
  const path = `/categories/${params.categoryId}`;
  const { data } = await requestCatalogResource<BLCatalogCategoryResponse>(ctx, { path });
  const parsed = blCatalogCategoryResponseSchema.parse(data);
  return mapCategory(parsed);
}

export async function fetchAllBlCategories(
  ctx: BLCatalogCtx | undefined,
): Promise<CategoryRecord[]> {
  const path = "/categories";
  const { data } = await requestCatalogResource<BLCatalogCategoryResponse[]>(ctx, { path });
  return blCatalogCategoryResponseSchema.array().parse(data).map(mapCategory);
}


