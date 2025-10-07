import { v, type Infer } from "convex/values";

// Core part shape as returned by formatPartForResponse
export const PartResponse = v.object({
  _id: v.id("parts"),
  partNumber: v.string(),
  name: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  category: v.optional(v.union(v.string(), v.null())),
  categoryPath: v.array(v.number()),
  categoryPathKey: v.optional(v.string()),
  imageUrl: v.optional(v.union(v.string(), v.null())),
  thumbnailUrl: v.optional(v.union(v.string(), v.null())),
  dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  lastUpdated: v.number(),
  lastFetchedFromBricklink: v.union(v.number(), v.null()),
  dataFreshness: v.optional(
    v.union(v.literal("fresh"), v.literal("background"), v.literal("stale"), v.literal("expired")),
  ),
  freshnessUpdatedAt: v.number(),
  bricklinkPartId: v.optional(v.string()),
  bricklinkCategoryId: v.optional(v.number()),
  primaryColorId: v.optional(v.number()),
  availableColorIds: v.array(v.number()),
  weight: v.union(v.object({ grams: v.optional(v.number()) }), v.null()),
  dimensions: v.union(
    v.object({
      lengthMm: v.optional(v.number()),
      widthMm: v.optional(v.number()),
      heightMm: v.optional(v.number()),
    }),
    v.null(),
  ),
  isPrinted: v.optional(v.boolean()),
  isObsolete: v.optional(v.boolean()),
});

export const SearchPartsReturn = v.object({
  page: v.array(PartResponse),
  isDone: v.boolean(),
  continueCursor: v.string(),
});

export const OverlayResponse = v.object({
  _id: v.id("catalogPartOverlay"),
  businessAccountId: v.id("businessAccounts"),
  partNumber: v.string(),
  tags: v.array(v.string()),
  notes: v.union(v.string(), v.null()),
  sortGrid: v.union(v.string(), v.null()),
  sortBin: v.union(v.string(), v.null()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const RefreshPartReturn = v.object({
  _id: v.id("parts"),
  partNumber: v.string(),
  name: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  category: v.optional(v.union(v.string(), v.null())),
  categoryPath: v.array(v.number()),
  categoryPathKey: v.optional(v.string()),
  imageUrl: v.optional(v.union(v.string(), v.null())),
  thumbnailUrl: v.optional(v.union(v.string(), v.null())),
  dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  lastUpdated: v.number(),
  lastFetchedFromBricklink: v.union(v.number(), v.null()),
  dataFreshness: v.optional(
    v.union(v.literal("fresh"), v.literal("background"), v.literal("stale"), v.literal("expired")),
  ),
  freshnessUpdatedAt: v.number(),
  bricklinkPartId: v.optional(v.string()),
  bricklinkCategoryId: v.optional(v.number()),
  primaryColorId: v.optional(v.number()),
  availableColorIds: v.array(v.number()),
  weight: v.union(v.object({ grams: v.optional(v.number()) }), v.null()),
  dimensions: v.union(
    v.object({
      lengthMm: v.optional(v.number()),
      widthMm: v.optional(v.number()),
      heightMm: v.optional(v.number()),
    }),
    v.null(),
  ),
  isPrinted: v.optional(v.boolean()),
  isObsolete: v.optional(v.boolean()),
  bricklinkStatus: v.union(v.literal("refreshed"), v.literal("scheduled")),
  marketPricing: v.null(),
});

// Details response extensions
const ColorInfo = v.object({
  name: v.string(),
  rgb: v.optional(v.string()),
  colorType: v.optional(v.string()),
  isTransparent: v.boolean(),
});

const ColorAvailabilityEntry = v.object({
  colorId: v.number(),
  elementIds: v.array(v.string()),
  isLegacy: v.boolean(),
  color: v.union(ColorInfo, v.null()),
});

const ElementReferenceEntry = v.object({
  elementId: v.string(),
  colorId: v.number(),
  designId: v.optional(v.string()),
  bricklinkPartId: v.optional(v.string()),
});

const MarketPricing = v.object({
  amount: v.optional(v.number()),
  currency: v.string(),
  lastSyncedAt: v.number(),
});

export const PartDetailsReturn = v.object({
  _id: v.id("parts"),
  partNumber: v.string(),
  name: v.string(),
  description: v.optional(v.union(v.string(), v.null())),
  category: v.optional(v.union(v.string(), v.null())),
  categoryPath: v.array(v.number()),
  categoryPathKey: v.optional(v.string()),
  imageUrl: v.optional(v.union(v.string(), v.null())),
  thumbnailUrl: v.optional(v.union(v.string(), v.null())),
  dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  lastUpdated: v.number(),
  lastFetchedFromBricklink: v.union(v.number(), v.null()),
  dataFreshness: v.optional(
    v.union(v.literal("fresh"), v.literal("background"), v.literal("stale"), v.literal("expired")),
  ),
  freshnessUpdatedAt: v.number(),
  bricklinkPartId: v.optional(v.string()),
  bricklinkCategoryId: v.optional(v.number()),
  primaryColorId: v.optional(v.number()),
  availableColorIds: v.array(v.number()),
  weight: v.union(v.object({ grams: v.optional(v.number()) }), v.null()),
  dimensions: v.union(
    v.object({
      lengthMm: v.optional(v.number()),
      widthMm: v.optional(v.number()),
      heightMm: v.optional(v.number()),
    }),
    v.null(),
  ),
  isPrinted: v.optional(v.boolean()),
  isObsolete: v.optional(v.boolean()),
  colorAvailability: v.array(ColorAvailabilityEntry),
  elementReferences: v.array(ElementReferenceEntry),
  marketPricing: v.union(MarketPricing, v.null()),
  source: v.literal("local"),
  bricklinkStatus: v.literal("skipped"),
  refresh: v.any(),
});

// validateDataFreshness
const FreshnessState = v.union(
  v.literal("fresh"),
  v.literal("background"),
  v.literal("stale"),
  v.literal("expired"),
);

const ValidateEntryOk = v.object({
  partNumber: v.string(),
  status: v.literal("ok"),
  dataFreshness: v.union(FreshnessState, v.null()),
  pricingFreshness: v.union(FreshnessState, v.null()),
  shouldRefresh: v.union(v.boolean(), v.null()),
  scheduled: v.union(v.boolean(), v.null()),
  refreshWindow: v.union(v.any(), v.null()),
  lastFetchedFromBricklink: v.union(v.number(), v.null(), v.null()),
  marketPriceLastSyncedAt: v.union(v.number(), v.null(), v.null()),
});

const ValidateEntryMissing = v.object({
  partNumber: v.string(),
  status: v.literal("missing"),
});

export const ValidateFreshnessReturn = v.object({
  evaluated: v.number(),
  results: v.array(v.union(ValidateEntryOk, ValidateEntryMissing)),
});

export type Part = Infer<typeof PartResponse>;
export type SearchPartsResult = Infer<typeof SearchPartsReturn>;
export type Overlay = Infer<typeof OverlayResponse>;
export type RefreshPartResult = Infer<typeof RefreshPartReturn>;
export type PartDetailsResult = Infer<typeof PartDetailsReturn>;
export type ValidateFreshnessResult = Infer<typeof ValidateFreshnessReturn>;
