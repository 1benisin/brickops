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
 * Color type literal
 */
export const colorTypeValidator = v.union(
  v.literal("Modulex"),
  v.literal("Speckle"),
  v.literal("Glitter"),
  v.literal("Milky"),
  v.literal("Metallic"),
  v.literal("Satin"),
  v.literal("Pearl"),
  v.literal("Chrome"),
  v.literal("Transparent"),
  v.literal("Solid"),
);

/**
 * New or used condition literal (for price guides)
 */
export const newOrUsedValidator = v.union(v.literal("N"), v.literal("U"));

/**
 * Guide type literal (sold or stock)
 */
export const guideTypeValidator = v.union(v.literal("sold"), v.literal("stock"));

// ============================================================================
// TABLE FIELD DEFINITIONS (Schema source of truth)
// ============================================================================

/**
 * Parts table field definitions
 * These match the database schema exactly and are used both in schema.ts and mutation validators
 */
export const partTableFields = {
  no: v.string(), // Bricklink's no (part number)
  name: v.string(), // Bricklink's name
  type: partTypeValidator, // Bricklink's type
  categoryId: v.optional(v.number()), // Bricklink's category_id
  alternateNo: v.optional(v.string()), // Bricklink's alternate_no
  imageUrl: v.optional(v.string()), // Bricklink's image_url
  thumbnailUrl: v.optional(v.string()), // Bricklink's thumbnail_url
  weight: v.optional(v.number()), // Bricklink's weight (grams, 2 decimal places)
  dimX: v.optional(v.string()), // Bricklink's dim_x (string with 2 decimal places)
  dimY: v.optional(v.string()), // Bricklink's dim_y (string with 2 decimal places)
  dimZ: v.optional(v.string()), // Bricklink's dim_z (string with 2 decimal places)
  yearReleased: v.optional(v.number()), // Bricklink's year_released
  description: v.optional(v.string()), // Bricklink's description
  isObsolete: v.optional(v.boolean()), // Bricklink's is_obsolete
  brickowlId: v.optional(v.string()), // BrickOwl part ID
  ldrawId: v.optional(v.string()), // LDraw part ID from Rebrickable
  legoId: v.optional(v.string()), // LEGO part ID from Rebrickable
  lastFetched: v.number(), // Universal freshness timestamp
};

/**
 * Colors table field definitions
 */
export const colorTableFields = {
  colorId: v.number(), // Bricklink's color_id (primary)
  colorName: v.string(), // Bricklink's color_name
  colorCode: v.optional(v.string()), // Bricklink's color_code (hex)
  colorType: v.optional(colorTypeValidator), // Bricklink's color_type
  brickowlColorId: v.optional(v.union(v.number(), v.null())), // BrickOwl's color_id (from Rebrickable mapping)
  lastFetched: v.number(), // Universal freshness timestamp
};

/**
 * Categories table field definitions
 */
export const categoryTableFields = {
  categoryId: v.number(), // Bricklink's category_id
  categoryName: v.string(), // Bricklink's category_name
  parentId: v.optional(v.number()), // Bricklink's parent_id (0 if root)
  lastFetched: v.number(), // Universal freshness timestamp
};

/**
 * Part colors table field definitions
 */
export const partColorTableFields = {
  partNo: v.string(), // Bricklink's part no
  colorId: v.number(), // Bricklink's color_id
  quantity: v.number(), // Bricklink's quantity
  lastFetched: v.number(), // Universal freshness timestamp
};

/**
 * Part prices table field definitions
 */
export const partPriceTableFields = {
  partNo: v.string(), // Bricklink's item.no
  partType: partTypeValidator, // Bricklink's item.type
  colorId: v.number(), // Bricklink's color_id (required - every price is for a specific color)
  newOrUsed: newOrUsedValidator, // Bricklink's new_or_used (N=new, U=used)
  currencyCode: v.string(), // Bricklink's currency_code
  minPrice: v.optional(v.number()), // Bricklink's min_price
  maxPrice: v.optional(v.number()), // Bricklink's max_price
  avgPrice: v.optional(v.number()), // Bricklink's avg_price
  qtyAvgPrice: v.optional(v.number()), // Bricklink's qty_avg_price
  unitQuantity: v.optional(v.number()), // Bricklink's unit_quantity
  totalQuantity: v.optional(v.number()), // Bricklink's total_quantity
  guideType: guideTypeValidator, // Bricklink's guide_type (sold/stock)
  lastFetched: v.number(), // Universal freshness timestamp
};

// ============================================================================
// SHARED COMPONENT VALIDATORS (API Return Types)
// ============================================================================

/**

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
    colorType: v.optional(colorTypeValidator),
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
