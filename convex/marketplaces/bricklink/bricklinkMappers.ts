/**
 * Bricklink API Response Mappers
 *
 * Direct mapping from Bricklink API responses to our database schema.
 * Based on docs/external-documentation/api-bricklink/ for exact field mappings.
 *
 * Uses Convex generated types as single source of truth.
 */

import { decode } from "he";
import type { Doc } from "../../_generated/dataModel";

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
import type { DataModel } from "../../_generated/dataModel";

// Type definitions for Bricklink API responses
export interface BricklinkColorResponse {
  color_id: number;
  color_name: string;
  color_code?: string;
  color_type?: string;
}

export interface BricklinkCategoryResponse {
  category_id: number;
  category_name: string;
  parent_id: number; // 0 if root
}

export interface BricklinkItemResponse {
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

export interface BricklinkPartColorResponse {
  color_id: number;
  quantity: number;
}

export interface BricklinkPriceGuideResponse {
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
}

// (BricklinkItemImageResponse no longer needed - images loaded directly from CDN)

/**
 * Maps Bricklink color API response to local database record
 */
export const mapColor = (bricklinkColor: BricklinkColorResponse): InsertRecord<"colors"> => {
  const now = Date.now();

  return {
    colorId: bricklinkColor.color_id,
    // if color_id is 0, set colorName to "(Not Applicable)"
    colorName:
      bricklinkColor.color_id === 0
        ? "(Not Applicable)"
        : decodeHtmlEntities(bricklinkColor.color_name),
    colorCode: bricklinkColor.color_code,
    colorType: bricklinkColor.color_type,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink category API response to local database record
 */
export const mapCategory = (
  bricklinkCategory: BricklinkCategoryResponse,
): InsertRecord<"categories"> => {
  const now = Date.now();

  return {
    categoryId: bricklinkCategory.category_id,
    categoryName: decodeHtmlEntities(bricklinkCategory.category_name),
    parentId: bricklinkCategory.parent_id === 0 ? undefined : bricklinkCategory.parent_id,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Maps Bricklink item API response to local database record
 */
export const mapPart = (
  bricklinkItem: BricklinkItemResponse,
  externalIds?: { brickowlId?: string; ldrawId?: string; legoId?: string },
): InsertRecord<"parts"> => {
  const now = Date.now();

  return {
    no: bricklinkItem.no,
    name: decodeHtmlEntities(bricklinkItem.name),
    type: bricklinkItem.type as "PART" | "MINIFIG" | "SET",
    categoryId: bricklinkItem.category_id,
    alternateNo: bricklinkItem.alternate_no,
    imageUrl: bricklinkItem.image_url,
    thumbnailUrl: bricklinkItem.thumbnail_url,
    weight: bricklinkItem.weight ? parseFloat(bricklinkItem.weight) : undefined,
    dimX: bricklinkItem.dim_x,
    dimY: bricklinkItem.dim_y,
    dimZ: bricklinkItem.dim_z,
    yearReleased: bricklinkItem.year_released,
    description: bricklinkItem.description
      ? decodeHtmlEntities(bricklinkItem.description)
      : undefined,
    isObsolete: bricklinkItem.is_obsolete,
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
  bricklinkColors: BricklinkPartColorResponse[],
): InsertRecord<"partColors">[] => {
  const now = Date.now();

  return bricklinkColors.map((color) => ({
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
  bricklinkPriceGuide: BricklinkPriceGuideResponse,
  guideType: "sold" | "stock",
  colorId: number,
): InsertRecord<"partPrices"> => {
  const now = Date.now();

  return {
    partNo: bricklinkPriceGuide.item.no,
    partType: bricklinkPriceGuide.item.type as "PART" | "MINIFIG" | "SET",
    colorId, // Use the colorId we requested, not from API response (Bricklink doesn't echo it back)
    newOrUsed: bricklinkPriceGuide.new_or_used as "N" | "U",
    currencyCode: bricklinkPriceGuide.currency_code,
    minPrice: bricklinkPriceGuide.min_price ? parseFloat(bricklinkPriceGuide.min_price) : undefined,
    maxPrice: bricklinkPriceGuide.max_price ? parseFloat(bricklinkPriceGuide.max_price) : undefined,
    avgPrice: bricklinkPriceGuide.avg_price ? parseFloat(bricklinkPriceGuide.avg_price) : undefined,
    qtyAvgPrice: bricklinkPriceGuide.qty_avg_price
      ? parseFloat(bricklinkPriceGuide.qty_avg_price)
      : undefined,
    unitQuantity: bricklinkPriceGuide.unit_quantity,
    totalQuantity: bricklinkPriceGuide.total_quantity,
    guideType,
    lastFetched: now,
    createdAt: now,
  };
};

/**
 * Utility function to check if a record is stale based on lastFetched timestamp
 */
export const isStale = (lastFetched: number, maxAgeMs: number): boolean => {
  return Date.now() - lastFetched > maxAgeMs;
};

/**
 * Maps Bricklink item image API response to local database record
 */
// (mapPartColorImage removed)
