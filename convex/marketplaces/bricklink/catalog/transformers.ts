/**
 * Bricklink API Response Mappers
 *
 * Direct mapping from Bricklink API responses to our database schema.
 * Based on docs/external-documentation/api-bricklink/ for exact field mappings.
 *
 * Uses Convex generated types as single source of truth.
 */

import { decode } from "he";
import type { Doc } from "../../../../_generated/dataModel";

/**
 * Decodes HTML entities in a string using the 'he' library
 * Handles both named entities (&amp;) and numeric entities (&#40;)
 */
export function decodeHtmlEntities(input: string): string {
  // decode everything, including malformed & legacy numeric refs
  return decode(input, { isAttributeValue: false });
}

/**
 * Utility type: Strip Convex metadata fields to get insertable record type
 * This removes _id and _creationTime which are added by Convex on insertion
 */
type InsertRecord<TableName extends keyof DataModel> = Omit<
  Doc<TableName>,
  "_id" | "_creationTime"
>;

// Import DataModel type for the utility
import type { DataModel } from "../../../../_generated/dataModel";

// Type definitions for Bricklink API responses
export interface BLColorResponse {
  color_id: number;
  color_name: string;
  color_code?: string;
  color_type?: string;
}

export interface BLCategoryResponse {
  category_id: number;
  category_name: string;
  parent_id: number; // 0 if root
}

export interface BLItemResponse {
  no: string;
  name: string;
  type: string;
  category_id?: number;
  alternate_no?: string;
  image_url?: string;
  thumbnail_url?: string;
  weight?: string; // Fixed point number with 2 decimal places
  dim_x?: string; // String with 2 decimal places
  dim_y?: string; // String with 2 decimal places
  dim_z?: string; // String with 2 decimal places
  year_released?: number;
  description?: string;
  is_obsolete?: boolean;
  language_code?: string;
}

export interface BLPartColorResponse {
  color_id: number;
  quantity: number;
}

export interface BLPriceDetailResponse {
  quantity: number;
  qunatity?: number;
  unit_price: string;
  shipping_available?: string | boolean;
  seller_country_code?: string;
  buyer_country_code?: string;
  date_ordered?: string;
}

export interface BLPriceGuideResponse {
  item: {
    no: string;
    type: string;
  };
  color_id?: number;
  new_or_used: string; // "N" or "U"
  currency_code: string;
  min_price?: string; // Fixed point number with 4 decimal places
  max_price?: string; // Fixed point number with 4 decimal places
  avg_price?: string; // Fixed point number with 4 decimal places
  qty_avg_price?: string; // Fixed point number with 4 decimal places
  unit_quantity?: number;
  total_quantity?: number;
  guide_type?: string; // "sold" or "stock"
  price_detail?: BLPriceDetailResponse[];
}

// (BricklinkItemImageResponse no longer needed - images loaded directly from CDN)

/**
 * Maps Bricklink color API response to local database record
 */
export const mapColor = (blColor: BLColorResponse): InsertRecord<"colors"> => {
  const now = Date.now();

  return {
    colorId: blColor.color_id,
    // if color_id is 0, set colorName to "(Not Applicable)"
    colorName: blColor.color_id === 0 ? "(Not Applicable)" : decodeHtmlEntities(blColor.color_name),
    colorCode: blColor.color_code,
    colorType: blColor.color_type,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink category API response to local database record
 */
export const mapCategory = (blCategory: BLCategoryResponse): InsertRecord<"categories"> => {
  const now = Date.now();

  return {
    categoryId: blCategory.category_id,
    categoryName: decodeHtmlEntities(blCategory.category_name),
    parentId: blCategory.parent_id === 0 ? undefined : blCategory.parent_id,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink item API response to local database record
 */
export const mapPart = (
  blItem: BLItemResponse,
  externalIds?: { brickowlId?: string; ldrawId?: string; legoId?: string },
): InsertRecord<"parts"> => {
  const now = Date.now();

  return {
    no: blItem.no,
    name: decodeHtmlEntities(blItem.name),
    type: blItem.type as "PART" | "MINIFIG" | "SET",
    categoryId: blItem.category_id,
    alternateNo: blItem.alternate_no,
    imageUrl: blItem.image_url,
    thumbnailUrl: blItem.thumbnail_url,
    weight: blItem.weight ? parseFloat(blItem.weight) : undefined,
    dimX: blItem.dim_x,
    dimY: blItem.dim_y,
    dimZ: blItem.dim_z,
    yearReleased: blItem.year_released,
    description: blItem.description ? decodeHtmlEntities(blItem.description) : undefined,
    isObsolete: blItem.is_obsolete,
    brickowlId: externalIds?.brickowlId,
    ldrawId: externalIds?.ldrawId,
    legoId: externalIds?.legoId,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink part colors API response to local database records
 */
export const mapPartColors = (
  partNo: string,
  blColors: BLPartColorResponse[],
): InsertRecord<"partColors">[] => {
  const now = Date.now();

  return blColors.map((color) => ({
    partNo,
    colorId: color.color_id,
    quantity: color.quantity,
    lastFetched: now,
    createdAt: now,
  }));
};

/**
 * Maps Bricklink price guide API response to local database record
 */
export const mapPriceGuide = (
  blPriceGuide: BLPriceGuideResponse,
  guideType: "sold" | "stock",
  colorId: number,
): InsertRecord<"partPrices"> => {
  const now = Date.now();

  return {
    partNo: blPriceGuide.item.no,
    partType: blPriceGuide.item.type as "PART" | "MINIFIG" | "SET",
    colorId, // Use the colorId we requested, not from API response (Bricklink doesn't echo it back)
    newOrUsed: blPriceGuide.new_or_used as "N" | "U",
    currencyCode: blPriceGuide.currency_code,
    minPrice: blPriceGuide.min_price ? parseFloat(blPriceGuide.min_price) : undefined,
    maxPrice: blPriceGuide.max_price ? parseFloat(blPriceGuide.max_price) : undefined,
    avgPrice: blPriceGuide.avg_price ? parseFloat(blPriceGuide.avg_price) : undefined,
    qtyAvgPrice: blPriceGuide.qty_avg_price ? parseFloat(blPriceGuide.qty_avg_price) : undefined,
    unitQuantity: blPriceGuide.unit_quantity,
    totalQuantity: blPriceGuide.total_quantity,
    guideType,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink item image API response to local database record
 */
// (mapPartColorImage removed)

export { isStale } from "./freshness";
