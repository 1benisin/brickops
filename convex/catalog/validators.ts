/**
 * Catalog Function Validators
 *
 * IMPORTANT FOR FUTURE DEVELOPERS:
 * ================================
 * These validators serve as the SINGLE SOURCE OF TRUTH for catalog API contracts.
 *
 * - Backend functions use these validators to validate return values at runtime
 * - Frontend uses FunctionReturnType<> to derive TypeScript types from these validators
 * - This prevents type drift between frontend and backend
 *
 * When adding/modifying catalog functions:
 * 1. Define the return validator here
 * 2. Use it in the function definition (returns: catalogPartValidator)
 * 3. Frontend types automatically stay in sync via src/types/catalog.ts
 *
 * DO NOT duplicate these type definitions manually on the frontend!
 */

import { v } from "convex/values";

// ============================================================================
// SHARED COMPONENT VALIDATORS
// ============================================================================

/**
 * Part type literal (PART, MINIFIG, or SET)
 */
export const partTypeValidator = v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET"));

/**
 * Individual catalog part (used in search results)
 */
export const catalogPartValidator = v.object({
  partNumber: v.string(),
  name: v.string(),
  type: partTypeValidator,
  categoryId: v.optional(v.number()),
  alternateNo: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  weight: v.optional(v.number()),
  dimX: v.optional(v.string()),
  dimY: v.optional(v.string()),
  dimZ: v.optional(v.string()),
  yearReleased: v.optional(v.number()),
  description: v.optional(v.string()),
  isObsolete: v.optional(v.boolean()),
  lastFetched: v.number(),
});

/**
 * Part color image information
 */
export const partColorImageValidator = v.object({
  imageUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  lastFetched: v.number(),
});

/**
 * Color information (enriched with name and RGB)
 */
export const catalogColorInfoValidator = v.object({
  colorId: v.number(),
  color: v.union(
    v.object({
      name: v.string(),
      rgb: v.optional(v.string()),
    }),
    v.null(),
  ),
  // Optional color-specific image
  image: v.optional(partColorImageValidator),
});

// ============================================================================
// FUNCTION RETURN VALIDATORS
// ============================================================================

/**
 * Return validator for searchParts query
 * Returns paginated list of parts
 */
export const searchPartsReturnValidator = v.object({
  page: v.array(catalogPartValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

/**
 * Return validator for getPartDetails mutation
 * Returns detailed part information with colors and pricing, or a fetching state
 */
export const partDetailsReturnValidator = v.union(
  // Success case - part found
  v.object({
    status: v.literal("found"),
    partNumber: v.string(),
    name: v.string(),
    type: partTypeValidator,
    categoryId: v.optional(v.number()),
    category: v.union(v.string(), v.null()),
    bricklinkPartId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    weight: v.optional(v.number()),
    dimX: v.optional(v.string()),
    dimY: v.optional(v.string()),
    dimZ: v.optional(v.string()),
    yearReleased: v.optional(v.number()),
    description: v.optional(v.string()),
    isObsolete: v.optional(v.boolean()),
    lastFetched: v.number(),
    colorAvailability: v.array(catalogColorInfoValidator),
  }),
  // Fetching case - part not found, scheduled for fetch
  v.object({
    status: v.literal("fetching"),
    partNumber: v.string(),
    message: v.string(),
  }),
);

/**
 * Return validator for getPartOverlay query
 * Returns overlay data (tags, notes, sort location) or null
 */
export const partOverlayReturnValidator = v.union(
  v.object({
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortLocation: v.optional(v.string()),
  }),
  v.null(),
);

/**
 * Return validator for getColors query
 * Returns array of all available colors
 */
export const colorsReturnValidator = v.array(
  v.object({
    colorId: v.number(),
    colorName: v.string(),
    colorCode: v.optional(v.string()),
    colorType: v.optional(v.string()),
    lastFetched: v.number(),
  }),
);

/**
 * Return validator for getCategories query
 * Returns array of all available categories
 */
export const categoriesReturnValidator = v.array(
  v.object({
    categoryId: v.number(),
    categoryName: v.string(),
    parentId: v.optional(v.number()),
    lastFetched: v.number(),
  }),
);

/**
 * Individual price record structure for price guide
 */
const priceRecordValidator = v.union(
  v.object({
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    avgPrice: v.optional(v.number()),
    qtyAvgPrice: v.optional(v.number()),
    unitQuantity: v.optional(v.number()),
    totalQuantity: v.optional(v.number()),
    currencyCode: v.string(),
    lastFetched: v.number(),
  }),
  v.null(),
);

/**
 * Return validator for getPriceGuide mutation
 * Returns complete price guide with all 4 price types
 */
export const priceGuideReturnValidator = v.object({
  partNumber: v.string(),
  colorId: v.number(),
  colorName: v.optional(v.string()),
  colorCode: v.optional(v.string()),
  prices: v.object({
    newStock: priceRecordValidator,
    newSold: priceRecordValidator,
    usedStock: priceRecordValidator,
    usedSold: priceRecordValidator,
  }),
});
