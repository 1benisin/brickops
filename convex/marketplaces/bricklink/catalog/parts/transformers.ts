import type { PartColorRecord, UpsertPartData } from "@/convex/catalog/mutations";
import { decodeHtmlEntities } from "../shared/transformers";
import type { BLPartExternalIds } from "./schema";

export function mapPart(
  input: {
    no: string;
    name: string;
    type: string;
    category_id?: number;
    alternate_no?: string;
    image_url?: string;
    thumbnail_url?: string;
    weight?: string;
    dim_x?: string;
    dim_y?: string;
    dim_z?: string;
    year_released?: number;
    description?: string;
    is_obsolete?: boolean;
    language_code?: string;
  },
  externalIds?: BLPartExternalIds,
): UpsertPartData {
  const now = Date.now();

  return {
    no: input.no,
    name: decodeHtmlEntities(input.name),
    type: input.type as "PART" | "MINIFIG" | "SET",
    categoryId: input.category_id,
    alternateNo: input.alternate_no,
    imageUrl: input.image_url,
    thumbnailUrl: input.thumbnail_url,
    weight: input.weight ? parseFloat(input.weight) : undefined,
    dimX: input.dim_x,
    dimY: input.dim_y,
    dimZ: input.dim_z,
    yearReleased: input.year_released,
    description: input.description ? decodeHtmlEntities(input.description) : undefined,
    isObsolete: input.is_obsolete,
    brickowlId: externalIds?.brickowlId,
    ldrawId: externalIds?.ldrawId,
    legoId: externalIds?.legoId,
    lastFetched: now,
  };
}

export function mapPartColors(
  partNo: string,
  colors: Array<{ color_id: number; quantity: number }>,
): PartColorRecord[] {
  const now = Date.now();

  return colors.map((color) => ({
    partNo,
    colorId: color.color_id,
    quantity: color.quantity,
    lastFetched: now,
  }));
}
