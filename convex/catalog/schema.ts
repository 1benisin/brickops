import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  partTableFields,
  colorTableFields,
  categoryTableFields,
  partColorTableFields,
  partPriceTableFields,
} from "./validators";

export const catalogTables = {
  // Global LEGO parts catalog (shared across all tenants) - Bricklink-aligned
  parts: defineTable({
    ...partTableFields,
    // system fields
    updatedAt: v.optional(v.number()),
  })
    .index("by_no", ["no"])
    .index("by_brickowlId", ["brickowlId"])
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
  })
    .index("by_status_time", ["status", "nextAttemptAt"]) // NEW: For worker queries
    .index("by_table_primary", ["tableName", "primaryKey"])
    .index("by_table_primary_secondary", ["tableName", "primaryKey", "secondaryKey"]),

  // Global LEGO part pricing data from Bricklink (cached with refresh capability)
  // Each part+color can have 4 price records: new/used × sold/stock
  partPrices: defineTable({
    ...partPriceTableFields,
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_partNo_colorId", ["partNo", "colorId"])
    .index("by_partNo_colorId_newOrUsed", ["partNo", "colorId", "newOrUsed"])
    .index("by_lastFetched", ["lastFetched"]),

  // Multi-source color reference table (Bricklink-aligned with BrickOwl support)
  colors: defineTable({
    ...colorTableFields,
    updatedAt: v.optional(v.number()),
  })
    .index("by_colorId", ["colorId"])
    .index("by_brickowlColorId", ["brickowlColorId"])
    .searchIndex("search_color_name", {
      searchField: "colorName",
      filterFields: ["colorType"],
    }),

  // Bricklink-aligned category reference table
  categories: defineTable({
    ...categoryTableFields,
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
    ...partColorTableFields,
    updatedAt: v.optional(v.number()),
  })
    .index("by_partNo", ["partNo"])
    .index("by_colorId", ["colorId"])
    .index("by_partNo_colorId", ["partNo", "colorId"]),

  // (partColorImages removed - using direct BrickLink CDN URLs client-side)
};
