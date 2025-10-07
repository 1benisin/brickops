// ============================================================================
// LEGO Part Catalog Persistence Layer
// ============================================================================
//
// This file handles the storage and updating of LEGO part catalog data in the
// Convex database. It transforms external API data (from Bricklink) into
// normalized database records and manages the lifecycle of catalog entries.
//
// Key responsibilities:
// - Transform external API data into database schema
// - Handle upsert operations (insert or update)
// - Generate search keywords for full-text search
// - Preserve existing data when updates are partial
// - Track data freshness and update timestamps
// ============================================================================

import type { GenericMutationCtx } from "convex/server";

import type { DataModel, Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { ConvexError } from "convex/values";

import type { PartSnapshot } from "./bricklinkAggregator";
import { buildSearchKeywords } from "./search";

/**
 * Database context that can be used for catalog operations.
 * Supports both regular mutations and generic mutations with full data model access.
 */
export type CatalogDbCtx = MutationCtx | GenericMutationCtx<DataModel>;

/**
 * Options for upserting catalog snapshots.
 * Allows pre-loading existing records and custom timestamps for testing.
 */
export type UpsertSnapshotOptions = {
  existing?: Doc<"parts"> | null;
  now?: number;
};

/**
 * Transforms external API data (PartSnapshot) into database update format.
 *
 * This function maps the external API response structure to our internal
 * database schema, handling type conversions and providing sensible defaults.
 *
 * @param snapshot - Raw data from Bricklink API
 * @param now - Current timestamp for tracking updates
 * @returns Database update object with normalized field types
 */
function snapshotToUpdate(snapshot: PartSnapshot, now: number) {
  return {
    name: snapshot.canonicalName ?? snapshot.partNumber,
    description: snapshot.description,
    category: snapshot.categoryId ? String(snapshot.categoryId) : undefined,
    categoryPath: snapshot.categoryId ? [snapshot.categoryId] : undefined,
    categoryPathKey: snapshot.categoryId ? String(snapshot.categoryId) : undefined,
    imageUrl: snapshot.imageUrl,
    thumbnailUrl: snapshot.thumbnailUrl,
    bricklinkPartId: snapshot.partNumber,
    bricklinkCategoryId: snapshot.categoryId,
    weight: snapshot.weightGrams !== undefined ? { grams: snapshot.weightGrams } : undefined,
    dimensions: snapshot.dimensionsMm,
    isPrinted: snapshot.isPrinted,
    isObsolete: snapshot.isObsolete,
    availableColorIds: snapshot.availableColorIds ?? [],
    dataSource: "bricklink" as const,
    lastUpdated: now,
    lastFetchedFromBricklink: now,
    dataFreshness: "fresh" as const,
    freshnessUpdatedAt: now,
    updatedAt: now,
  };
}

/**
 * Inserts or updates a LEGO part catalog entry in the database.
 *
 * This function implements an "upsert" pattern - it either creates a new catalog
 * entry for a part number that doesn't exist, or updates an existing entry with
 * fresh data from external APIs. It preserves existing data when new data is
 * incomplete or missing.
 *
 * Key behaviors:
 * - Uses database index for efficient lookups by part number
 * - Preserves existing data when new snapshot is incomplete
 * - Generates search keywords for full-text search functionality
 * - Tracks data freshness and update timestamps
 * - Handles both insert and update operations atomically
 *
 * @param ctx - Database context for mutations
 * @param partNumber - The LEGO part number (e.g., "3001", "3020")
 * @param snapshot - Fresh data from external API (Bricklink)
 * @param options - Optional existing record and custom timestamp
 * @returns The updated catalog entry from database
 * @throws ConvexError if upsert operation fails
 */
export async function upsertCatalogSnapshot(
  ctx: CatalogDbCtx,
  partNumber: string,
  snapshot: PartSnapshot,
  options: UpsertSnapshotOptions = {},
): Promise<Doc<"parts">> {
  const now = options.now ?? Date.now();

  // Check if record already exists - use index for efficient lookup
  // Option to pass existing record directly to avoid database call
  const existing =
    options.existing ??
    (await ctx.db
      .query("parts")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", partNumber))
      .first());

  // Determine canonical name - prefer snapshot data, fallback to existing or part number
  const canonicalName = snapshot.canonicalName ?? existing?.name ?? partNumber;

  // Generate searchable keywords from part number and name
  const searchKeywords = buildSearchKeywords(partNumber, canonicalName);

  // Transform snapshot data into database update format
  const update = snapshotToUpdate({ ...snapshot, canonicalName, partNumber }, now);

  if (existing) {
    // UPDATE existing record - preserve existing data where new data is missing
    await ctx.db.patch(existing._id, {
      // Apply all transformed update data
      ...update,

      // Preserve existing values when new snapshot doesn't provide them
      description: update.description ?? existing.description,
      category: update.category ?? existing.category,
      categoryPath: update.categoryPath ?? existing.categoryPath,
      categoryPathKey: update.categoryPathKey ?? existing.categoryPathKey,
      imageUrl: update.imageUrl ?? existing.imageUrl,
      thumbnailUrl: update.thumbnailUrl ?? existing.thumbnailUrl,
      weight: update.weight ?? existing.weight,
      dimensions: update.dimensions ?? existing.dimensions,
      isPrinted: update.isPrinted ?? existing.isPrinted,
      isObsolete: update.isObsolete ?? existing.isObsolete,

      // Color IDs: use new data if provided and non-empty, otherwise keep existing
      availableColorIds: update.availableColorIds?.length
        ? update.availableColorIds
        : existing.availableColorIds ?? [],

      // Always update search keywords when record changes
      searchKeywords,
    });
  } else {
    // INSERT new record - all fields required for new entries

    await ctx.db.insert("parts", {
      // Primary identifiers
      partNumber,
      name: canonicalName,

      // Content fields from update transformation
      description: update.description,
      category: update.category,
      categoryPath: update.categoryPath,
      categoryPathKey: update.categoryPathKey,
      imageUrl: update.imageUrl,
      thumbnailUrl: update.thumbnailUrl,
      bricklinkPartId: partNumber, // Duplicate for cross-reference
      bricklinkCategoryId: update.bricklinkCategoryId,
      searchKeywords,

      // Physical properties
      weight: update.weight,
      dimensions: update.dimensions,
      isPrinted: update.isPrinted,
      isObsolete: update.isObsolete,
      availableColorIds: update.availableColorIds ?? [],
      primaryColorId: update.availableColorIds?.[0], // First available color

      // Metadata and tracking
      dataSource: update.dataSource,
      lastUpdated: update.lastUpdated,
      lastFetchedFromBricklink: update.lastFetchedFromBricklink,
      dataFreshness: update.dataFreshness,
      freshnessUpdatedAt: update.freshnessUpdatedAt,
      createdAt: now, // New records get creation timestamp
    });
  }

  // Verify the operation succeeded by fetching the updated record
  // This ensures consistency and provides the caller with the final state
  const updated = await ctx.db
    .query("parts")
    .withIndex("by_partNumber", (q) => q.eq("partNumber", partNumber))
    .first();

  if (!updated) {
    // This should never happen in normal operation, but provides safety
    throw new ConvexError("Failed to upsert catalog snapshot");
  }

  return updated;
}
