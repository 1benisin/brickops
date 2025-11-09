import { defineTable } from "convex/server";
import { v } from "convex/values";

export const catalogTables = {
  // Global LEGO parts catalog (shared across all tenants) - Bricklink-aligned
  parts: defineTable({
    no: v.string(), // Bricklink's no (part number)
    name: v.string(), // Bricklink's name
    type: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")), // Bricklink's type
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
    brickowlId: v.optional(v.string()), // BrickOwl part ID from Rebrickable
    ldrawId: v.optional(v.string()), // LDraw part ID from Rebrickable
    legoId: v.optional(v.string()), // LEGO part ID from Rebrickable
    lastFetched: v.number(), // Universal freshness timestamp
    // system fields
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_no", ["no"])
    .index("by_categoryId", ["categoryId"])
    .index("by_type", ["type"])
    .index("by_name", ["name"])
    .index("by_lastFetched", ["lastFetched"])
    .searchIndex("search_parts_by_name", {
      searchField: "name",
      filterFields: ["type", "categoryId", "isObsolete"],
    })
    .searchIndex("search_parts_by_no", {
      searchField: "no",
      filterFields: ["type", "categoryId", "isObsolete"],
    }),

  // Tenant-specific catalog overlays (tags, notes, sort locations per business)
  catalogPartOverlay: defineTable({
    businessAccountId: v.id("businessAccounts"),
    partNo: v.string(), // Updated to match new schema
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    sortLocation: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_business_part", ["businessAccountId", "partNo"])
    .index("by_businessAccount", ["businessAccountId"])
    .index("by_business_sortLocation", ["businessAccountId", "sortLocation"])
    .searchIndex("search_overlay", {
      searchField: "notes",
      filterFields: ["businessAccountId", "sortLocation"],
    }),

  // Refresh outbox for background data updates from Bricklink
  catalogRefreshOutbox: defineTable({
    tableName: v.union(
      v.literal("parts"),
      v.literal("partColors"),
      v.literal("partPrices"),
      v.literal("colors"),
      v.literal("categories"),
    ),
    primaryKey: v.string(), // Always present: partNo, colorId, categoryId
    secondaryKey: v.optional(v.string()), // For composite keys: colorId (for partColors, partPrices)
    recordId: v.string(), // Display string for logging (e.g., "3001:1" or "3001")
    priority: v.number(), // 1 (high) to 3 (low)
    lastFetched: v.optional(v.number()), // When data was last refreshed (if known)
    status: v.union(
      v.literal("pending"),
      v.literal("inflight"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    attempt: v.number(), // Retry attempt number (starts at 0)
    nextAttemptAt: v.number(), // Timestamp for next retry attempt
    lastError: v.optional(v.string()), // Last error message (renamed from errorMessage)
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status_time", ["status", "nextAttemptAt"]) // NEW: For worker queries
    .index("by_table_primary", ["tableName", "primaryKey"])
    .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"]),

  // Global LEGO part pricing data from Bricklink (cached with refresh capability)
  // Each part+color can have 4 price records: new/used × sold/stock
  partPrices: defineTable({
    partNo: v.string(), // Bricklink's item.no
    partType: v.union(v.literal("PART"), v.literal("MINIFIG"), v.literal("SET")), // Bricklink's item.type
    colorId: v.number(), // Bricklink's color_id (required - every price is for a specific color)
    newOrUsed: v.union(v.literal("N"), v.literal("U")), // Bricklink's new_or_used (N=new, U=used)
    currencyCode: v.string(), // Bricklink's currency_code
    minPrice: v.optional(v.number()), // Bricklink's min_price
    maxPrice: v.optional(v.number()), // Bricklink's max_price
    avgPrice: v.optional(v.number()), // Bricklink's avg_price
    qtyAvgPrice: v.optional(v.number()), // Bricklink's qty_avg_price
    unitQuantity: v.optional(v.number()), // Bricklink's unit_quantity
    totalQuantity: v.optional(v.number()), // Bricklink's total_quantity
    guideType: v.union(v.literal("sold"), v.literal("stock")), // Bricklink's guide_type (sold/stock)
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_partNo_colorId", ["partNo", "colorId"])
    .index("by_partNo_colorId_newOrUsed", ["partNo", "colorId", "newOrUsed"])
    .index("by_lastFetched", ["lastFetched"]),

  // Multi-source color reference table (Bricklink-aligned with BrickOwl support)
  colors: defineTable({
    colorId: v.number(), // Bricklink's color_id (primary)
    colorName: v.string(), // Bricklink's color_name
    colorCode: v.optional(v.string()), // Bricklink's color_code (hex)
    colorType: v.optional(
      v.union(
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
      ),
    ), // Bricklink's color_type
    brickowlColorId: v.optional(v.number()), // BrickOwl's color_id (from Rebrickable mapping)
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_colorId", ["colorId"])
    .searchIndex("search_color_name", {
      searchField: "colorName",
      filterFields: ["colorType"],
    }),

  // Bricklink-aligned category reference table
  categories: defineTable({
    categoryId: v.number(), // Bricklink's category_id
    categoryName: v.string(), // Bricklink's category_name
    parentId: v.optional(v.number()), // Bricklink's parent_id (0 if root)
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_categoryId", ["categoryId"])
    .index("by_parentId", ["parentId"])
    .searchIndex("search_category_name", {
      searchField: "categoryName",
      filterFields: ["parentId"],
    }),

  // Part-color relationships from Bricklink
  partColors: defineTable({
    partNo: v.string(), // Bricklink's part no
    colorId: v.number(), // Bricklink's color_id
    quantity: v.number(), // Bricklink's quantity
    lastFetched: v.number(), // Universal freshness timestamp
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_colorId", ["colorId"])
    .index("by_partNo_colorId", ["partNo", "colorId"]),

  // (partColorImages removed - using direct BrickLink CDN URLs client-side)
};
