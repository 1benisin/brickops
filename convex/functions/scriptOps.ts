import { mutation, MutationCtx, QueryCtx } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import { BricklinkClient } from "../lib/external/bricklink";
import { sharedRateLimiter } from "../lib/external/inMemoryRateLimiter";
import { recordMetric } from "../lib/external/metrics";

function buildSearchKeywords(partNumber: string, name: string): string {
  const tokens = new Set<string>();
  const push = (value?: string | null) => {
    if (!value) return;
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  };
  push(partNumber);
  push(name);
  return Array.from(tokens).join(" ");
}

/**
 * Parse system admin emails from environment variable
 * Supports comma-separated list of admin emails
 */
function parseSystemAdminEmails(): Set<string> {
  const configured = process.env.BRICKOPS_SYSTEM_ADMIN_EMAILS ?? "";
  if (!configured.trim()) {
    return new Set();
  }
  return new Set(
    configured
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

type RequireUserReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

/**
 * Ensures user is authenticated, active, and linked to a business account
 */
async function requireActiveUser(ctx: QueryCtx | MutationCtx): Promise<RequireUserReturn> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("Authenticated user not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  return {
    userId,
    user,
    businessAccountId: user.businessAccountId as Id<"businessAccounts">,
  };
}

/**
 * Check if user has system admin privileges
 * Either configured via email list or has owner role
 */
function isSystemAdmin(user: Doc<"users">): boolean {
  const configuredEmails = parseSystemAdminEmails();
  const normalizedEmail = user.email?.trim().toLowerCase();

  if (configuredEmails.size > 0) {
    return normalizedEmail ? configuredEmails.has(normalizedEmail) : false;
  }

  return user.role === "owner";
}

async function requireSystemAdmin(ctx: QueryCtx | MutationCtx): Promise<RequireUserReturn> {
  const identity = await requireActiveUser(ctx);
  if (!isSystemAdmin(identity.user)) {
    throw new ConvexError("System administrator access required");
  }
  return identity;
}

/**
 * Special authentication function for seeding operations.
 * Allows admin-authenticated scripts to bypass user authentication.
 * Returns null for seeding operations, full user context for admin users.
 */
async function requireSystemAdminOrSeeding(
  ctx: QueryCtx | MutationCtx,
): Promise<RequireUserReturn | null> {
  // Try to get user authentication first
  const userId = await getAuthUserId(ctx);

  if (userId) {
    // Normal user authentication path
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("Authenticated user not found");
    }

    if (user.status !== "active") {
      throw new ConvexError("User account is not active");
    }

    if (!user.businessAccountId) {
      throw new ConvexError("User is not linked to a business account");
    }

    if (!isSystemAdmin(user)) {
      throw new ConvexError("System administrator access required");
    }

    return {
      userId,
      user,
      businessAccountId: user.businessAccountId as Id<"businessAccounts">,
    };
  }

  // If no user ID, this might be an admin-authenticated seeding operation
  // In this case, we'll return null and let the seeding operation proceed
  // This is safe because seeding operations are isolated and only used for bootstrapping
  return null;
}

// Data freshness tracking constants
const FRESH_THRESHOLD_HOURS = 7 * 24; // 7 days
const STALE_THRESHOLD_HOURS = 30 * 24; // 30 days
const FRESH_THRESHOLD_MS = FRESH_THRESHOLD_HOURS * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

// Rate limiting configuration for Bricklink API calls
const CATALOG_RATE_LIMIT = {
  capacity: 50,
  intervalMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Determine data freshness based on last update timestamp
 * @param lastUpdated - Timestamp of last update
 * @returns "fresh" (< 7 days), "stale" (7-30 days), or "expired" (> 30 days)
 */
function getDataFreshness(lastUpdated: number): "fresh" | "stale" | "expired" {
  const now = Date.now();
  const age = now - lastUpdated;

  if (age < FRESH_THRESHOLD_MS) return "fresh";
  if (age < STALE_THRESHOLD_MS) return "stale";
  return "expired";
}

/**
 * Convert category path array to string key for indexing
 * @param path - Array of category IDs representing hierarchy
 * @returns Joined string or undefined if empty
 */
function buildCategoryPathKey(path?: number[] | null): string | undefined {
  if (!path || path.length === 0) return undefined;
  return path.join("/");
}

// Removed filter count actions (seed/refresh) since filter counts are no longer used

export const backfillCatalogSearchKeywords = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    updated: number;
    cursor: string | null;
    isDone: boolean;
  }> => {
    const page = await ctx.db
      .query("legoPartCatalog")
      .paginate({ cursor: args.cursor ?? null, numItems: Math.min(args.limit ?? 200, 500) });

    let updated = 0;
    for (const part of page.page) {
      const expected = buildSearchKeywords(part.partNumber, part.name);
      if (part.searchKeywords !== expected) {
        await ctx.db.patch(part._id, { searchKeywords: expected });
        updated += 1;
      }
    }

    return { updated, cursor: page.continueCursor ?? null, isDone: page.isDone };
  },
});

/**
 * Save or update a part in the local catalog
 * Used for manual part entry and Bricklink data import
 */
export const savePartToLocalCatalog = mutation({
  args: {
    partNumber: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    bricklinkPartId: v.optional(v.string()),
    bricklinkCategoryId: v.optional(v.number()),
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
    categoryPath: v.optional(v.array(v.number())),
    primaryColorId: v.optional(v.number()),
    availableColorIds: v.optional(v.array(v.number())),
    aliases: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSystemAdmin(ctx);
    const now = Date.now();
    const searchKeywords = buildSearchKeywords(args.partNumber, args.name);
    const categoryPathKey = buildCategoryPathKey(args.categoryPath);

    // Check if part already exists
    const existing = await ctx.db
      .query("legoPartCatalog")
      .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber))
      .first();

    const freshness = getDataFreshness(now);

    if (existing) {
      // Update existing part
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        category: args.category,
        categoryPath: args.categoryPath,
        categoryPathKey,
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
        primaryColorId: args.primaryColorId,
        availableColorIds: args.availableColorIds,
        searchKeywords,
        dataSource: args.dataSource,
        lastUpdated: now,
        lastFetchedFromBricklink:
          args.dataSource === "bricklink" ? now : existing.lastFetchedFromBricklink,
        dataFreshness: freshness,
        updatedAt: now,
      });

      recordMetric("catalog.savePartToLocalCatalog.updated", {
        partNumber: args.partNumber,
        dataSource: args.dataSource,
      });

      return existing._id;
    } else {
      // Create new part
      const partId = await ctx.db.insert("legoPartCatalog", {
        partNumber: args.partNumber,
        name: args.name,
        description: args.description,
        category: args.category,
        categoryPath: args.categoryPath,
        categoryPathKey,
        imageUrl: args.imageUrl,
        bricklinkPartId: args.bricklinkPartId,
        bricklinkCategoryId: args.bricklinkCategoryId,
        primaryColorId: args.primaryColorId,
        availableColorIds: args.availableColorIds,
        searchKeywords,
        dataSource: args.dataSource,
        lastUpdated: now,
        lastFetchedFromBricklink: args.dataSource === "bricklink" ? now : undefined,
        dataFreshness: freshness,
        createdBy: userId,
        createdAt: now,
      });

      recordMetric("catalog.savePartToLocalCatalog.created", {
        partNumber: args.partNumber,
        dataSource: args.dataSource,
      });

      return partId;
    }
  },
});

/**
 * Batch import parts for catalog maintenance
 * Processes up to 100 parts per request for efficient bulk operations
 */
export const batchImportParts = mutation({
  args: {
    parts: v.array(
      v.object({
        partNumber: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        bricklinkPartId: v.optional(v.string()),
        bricklinkCategoryId: v.optional(v.number()),
        categoryPath: v.optional(v.array(v.number())),
        primaryColorId: v.optional(v.number()),
        availableColorIds: v.optional(v.array(v.number())),
        aliases: v.optional(v.array(v.string())),
      }),
    ),
    dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSystemAdmin(ctx);

    if (args.parts.length === 0) {
      throw new ConvexError("No parts provided for import");
    }

    if (args.parts.length > 100) {
      throw new ConvexError("Batch size limited to 100 parts per request");
    }

    const now = Date.now();
    const freshness = getDataFreshness(now);
    const results = { created: 0, updated: 0, errors: [] as string[] };

    for (const part of args.parts) {
      try {
        // Check if part exists
        const existing = await ctx.db
          .query("legoPartCatalog")
          .withIndex("by_partNumber", (q) => q.eq("partNumber", part.partNumber))
          .first();

        if (existing) {
          // Update existing
          await ctx.db.patch(existing._id, {
            name: part.name,
            description: part.description,
            category: part.category,
            imageUrl: part.imageUrl,
            bricklinkPartId: part.bricklinkPartId,
            bricklinkCategoryId: part.bricklinkCategoryId,
            categoryPath: part.categoryPath,
            categoryPathKey: buildCategoryPathKey(part.categoryPath),
            primaryColorId: part.primaryColorId,
            availableColorIds: part.availableColorIds,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name),
            dataSource: args.dataSource,
            lastUpdated: now,
            lastFetchedFromBricklink:
              args.dataSource === "bricklink" ? now : existing.lastFetchedFromBricklink,
            dataFreshness: freshness,
            updatedAt: now,
          });
          results.updated++;
        } else {
          // Create new
          await ctx.db.insert("legoPartCatalog", {
            partNumber: part.partNumber,
            name: part.name,
            description: part.description,
            category: part.category,
            imageUrl: part.imageUrl,
            bricklinkPartId: part.bricklinkPartId,
            bricklinkCategoryId: part.bricklinkCategoryId,
            categoryPath: part.categoryPath,
            categoryPathKey: buildCategoryPathKey(part.categoryPath),
            primaryColorId: part.primaryColorId,
            availableColorIds: part.availableColorIds,
            searchKeywords: buildSearchKeywords(part.partNumber, part.name),
            dataSource: args.dataSource,
            lastUpdated: now,
            lastFetchedFromBricklink: args.dataSource === "bricklink" ? now : undefined,
            dataFreshness: freshness,
            createdBy: userId,
            createdAt: now,
          });
          results.created++;
        }
      } catch (error) {
        const errorMsg = `Failed to import part ${part.partNumber}: ${error instanceof Error ? error.message : "Unknown error"}`;
        results.errors.push(errorMsg);
      }
    }

    recordMetric("catalog.batchImportParts", {
      totalParts: args.parts.length,
      created: results.created,
      updated: results.updated,
      errors: results.errors.length,
      dataSource: args.dataSource,
    });

    return results;
  },
});

// Reference data seeding mutations - used for initial catalog setup

/**
 * Seed Bricklink color reference data
 * Optimized for bulk operations with parallel processing
 */
export const seedBricklinkColors = mutation({
  args: {
    records: v.array(
      v.object({
        bricklinkColorId: v.number(),
        name: v.string(),
        rgb: v.optional(v.string()),
        colorType: v.optional(v.string()),
        isTransparent: v.optional(v.boolean()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Bulk query: Fetch all existing records once instead of per-record queries
    const allExisting = await ctx.db.query("bricklinkColorReference").collect();
    const existingById = new Map(allExisting.map((entry) => [entry.bricklinkColorId, entry]));

    // Separate inserts from updates
    const insertOperations = [];
    const updateOperations = [];

    for (const record of args.records) {
      const existing = existingById.get(record.bricklinkColorId);

      if (existing) {
        updateOperations.push(
          ctx.db.patch(existing._id, {
            name: record.name,
            rgb: record.rgb,
            colorType: record.colorType,
            isTransparent: record.isTransparent,
            syncedAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      } else {
        insertOperations.push(
          ctx.db.insert("bricklinkColorReference", {
            bricklinkColorId: record.bricklinkColorId,
            name: record.name,
            rgb: record.rgb,
            colorType: record.colorType,
            isTransparent: record.isTransparent,
            syncedAt: record.syncedAt,
            createdAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      }
    }

    // Execute all operations in parallel
    await Promise.all([...insertOperations, ...updateOperations]);

    const inserted = insertOperations.length;
    const updated = updateOperations.length;

    recordMetric("catalog.seedBricklinkColors", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed Bricklink category reference data with hierarchical paths
 */
export const seedBricklinkCategories = mutation({
  args: {
    records: v.array(
      v.object({
        bricklinkCategoryId: v.number(),
        name: v.string(),
        parentCategoryId: v.optional(v.number()),
        path: v.optional(v.array(v.number())),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Bulk query: Fetch all existing records once instead of per-record queries
    const allExisting = await ctx.db.query("bricklinkCategoryReference").collect();
    const existingById = new Map(allExisting.map((entry) => [entry.bricklinkCategoryId, entry]));

    // Separate inserts from updates
    const insertOperations = [];
    const updateOperations = [];

    for (const record of args.records) {
      const existing = existingById.get(record.bricklinkCategoryId);
      const pathKey = buildCategoryPathKey(record.path);

      if (existing) {
        updateOperations.push(
          ctx.db.patch(existing._id, {
            name: record.name,
            parentCategoryId: record.parentCategoryId,
            path: record.path,
            pathKey,
            syncedAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      } else {
        insertOperations.push(
          ctx.db.insert("bricklinkCategoryReference", {
            bricklinkCategoryId: record.bricklinkCategoryId,
            name: record.name,
            parentCategoryId: record.parentCategoryId,
            path: record.path,
            pathKey,
            syncedAt: record.syncedAt,
            createdAt: record.syncedAt,
            updatedAt: record.syncedAt,
          }),
        );
      }
    }

    // Execute all operations in parallel
    await Promise.all([...insertOperations, ...updateOperations]);

    const inserted = insertOperations.length;
    const updated = updateOperations.length;

    recordMetric("catalog.seedBricklinkCategories", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed part-color availability data from Bricklink
 * Maps which colors are available for each part
 */
export const seedPartColorAvailability = mutation({
  args: {
    records: v.array(
      v.object({
        partNumber: v.string(),
        bricklinkPartId: v.optional(v.string()),
        colorId: v.number(),
        elementIds: v.optional(v.array(v.string())),
        isLegacy: v.optional(v.boolean()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      // Indexed query for this specific part+color combination
      const candidates = await ctx.db
        .query("bricklinkPartColorAvailability")
        .withIndex("by_part", (q) => q.eq("partNumber", record.partNumber))
        .collect();

      const existing = candidates.find((entry) => entry.colorId === record.colorId);

      if (existing) {
        // Update existing record, merging element IDs
        const elementIds = Array.from(
          new Set([...(existing.elementIds ?? []), ...(record.elementIds ?? [])]),
        );
        await ctx.db.patch(existing._id, {
          bricklinkPartId: record.bricklinkPartId ?? existing.bricklinkPartId,
          elementIds,
          isLegacy: record.isLegacy ?? existing.isLegacy,
          syncedAt: record.syncedAt,
        });
        updated++;
      } else {
        // Insert new record
        await ctx.db.insert("bricklinkPartColorAvailability", {
          partNumber: record.partNumber,
          bricklinkPartId: record.bricklinkPartId,
          colorId: record.colorId,
          elementIds: record.elementIds,
          isLegacy: record.isLegacy,
          syncedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedPartColorAvailability", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed element reference data linking LEGO element IDs to parts and colors
 */
export const seedElementReferences = mutation({
  args: {
    records: v.array(
      v.object({
        elementId: v.string(),
        partNumber: v.string(),
        colorId: v.number(),
        bricklinkPartId: v.optional(v.string()),
        designId: v.optional(v.string()),
        syncedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;

    for (const record of args.records) {
      // Indexed query for this specific element ID
      const existing = await ctx.db
        .query("bricklinkElementReference")
        .withIndex("by_element", (q) => q.eq("elementId", record.elementId))
        .first();

      if (existing) {
        // Update existing record
        await ctx.db.patch(existing._id, {
          partNumber: record.partNumber,
          colorId: record.colorId,
          bricklinkPartId: record.bricklinkPartId ?? existing.bricklinkPartId,
          designId: record.designId ?? existing.designId,
          syncedAt: record.syncedAt,
        });
        updated++;
      } else {
        // Insert new record
        await ctx.db.insert("bricklinkElementReference", {
          elementId: record.elementId,
          partNumber: record.partNumber,
          colorId: record.colorId,
          bricklinkPartId: record.bricklinkPartId,
          designId: record.designId,
          syncedAt: record.syncedAt,
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedElementReferences", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Seed manual LEGO part catalog entries
 * Used for parts not available through Bricklink API
 */
export const seedLegoPartCatalog = mutation({
  args: {
    records: v.array(
      v.object({
        partNumber: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        bricklinkPartId: v.optional(v.string()),
        bricklinkCategoryId: v.optional(v.number()),
        weightGrams: v.optional(v.number()),
        dimensionXMm: v.optional(v.number()),
        dimensionYMm: v.optional(v.number()),
        dimensionZMm: v.optional(v.number()),
        dataSource: v.literal("manual"),
        lastUpdated: v.number(),
        dataFreshness: v.literal("fresh"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const auth = await requireSystemAdminOrSeeding(ctx);

    // Per Convex best practices: just loop and let Convex handle the transaction
    // Query each record individually using indexed queries
    let inserted = 0;
    let updated = 0;
    const now = Date.now();

    for (const record of args.records) {
      // Indexed query for this specific part number
      const existing = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", record.partNumber))
        .first();

      if (existing) {
        // Update existing part
        await ctx.db.patch(existing._id, {
          name: record.name,
          description: record.description,
          bricklinkPartId: record.bricklinkPartId,
          bricklinkCategoryId: record.bricklinkCategoryId,
          searchKeywords: record.name.toLowerCase(),
          weightGrams: record.weightGrams,
          dimensionXMm: record.dimensionXMm,
          dimensionYMm: record.dimensionYMm,
          dimensionZMm: record.dimensionZMm,
          dataSource: record.dataSource,
          lastUpdated: record.lastUpdated,
          dataFreshness: record.dataFreshness,
          updatedAt: now,
        });
        updated++;
      } else {
        // Insert new part
        await ctx.db.insert("legoPartCatalog", {
          partNumber: record.partNumber,
          name: record.name,
          description: record.description,
          bricklinkPartId: record.bricklinkPartId,
          bricklinkCategoryId: record.bricklinkCategoryId,
          searchKeywords: record.name.toLowerCase(),
          weightGrams: record.weightGrams,
          dimensionXMm: record.dimensionXMm,
          dimensionYMm: record.dimensionYMm,
          dimensionZMm: record.dimensionZMm,
          dataSource: record.dataSource,
          lastUpdated: record.lastUpdated,
          dataFreshness: record.dataFreshness,
          createdAt: now,
          ...(auth?.userId ? { createdBy: auth.userId } : {}),
        });
        inserted++;
      }
    }

    recordMetric("catalog.seedLegoPartCatalog", {
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/**
 * Refresh stale catalog entries from Bricklink API
 * Processes up to 25 parts per request to respect rate limits
 */
export const refreshCatalogEntries = mutation({
  args: {
    limit: v.optional(v.number()),
    partNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSystemAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);

    const targetParts: Doc<"legoPartCatalog">[] = [];

    if (args.partNumber) {
      const specific = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_partNumber", (q) => q.eq("partNumber", args.partNumber!))
        .first();
      if (specific) {
        targetParts.push(specific);
      }
    }

    if (targetParts.length < limit) {
      const staleParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) => q.eq("dataFreshness", "stale"))
        .take(limit);

      const expiredParts = await ctx.db
        .query("legoPartCatalog")
        .withIndex("by_dataFreshness", (q) => q.eq("dataFreshness", "expired"))
        .take(limit);

      [...staleParts, ...expiredParts].forEach((part) => {
        if (!targetParts.find((existing) => existing._id === part._id)) {
          targetParts.push(part);
        }
      });
    }

    const toRefresh = targetParts.slice(0, limit);
    if (toRefresh.length === 0) {
      return { refreshed: 0, errors: [] as string[] };
    }

    const client = new BricklinkClient();
    const errors: string[] = [];
    let refreshed = 0;

    for (const part of toRefresh) {
      const requestStartedAt = Date.now();
      try {
        sharedRateLimiter.consume({
          key: "catalog:bricklink-refresh",
          capacity: CATALOG_RATE_LIMIT.capacity,
          intervalMs: CATALOG_RATE_LIMIT.intervalMs,
        });

        const [detailResponse, priceResponse] = await Promise.all([
          client.request<{
            data: {
              no: string;
              name: string;
              category_id: number;
              image_url?: string;
            };
          }>({
            path: `/items/part/${part.partNumber}`,
            identityKey: "global-catalog",
          }),
          client.request<{
            data: {
              avg_price?: number;
              currency_code?: string;
            };
          }>({
            path: `/items/part/${part.partNumber}/price`,
            identityKey: "global-catalog",
          }),
        ]);

        const completedAt = Date.now();
        const durationMs = completedAt - requestStartedAt;
        const detail = detailResponse.data?.data;
        const price = priceResponse.data?.data;

        await ctx.db.patch(part._id, {
          name: detail?.name ?? part.name,
          description: detail ? `Bricklink part: ${detail.name}` : part.description,
          bricklinkPartId: detail?.no ?? part.bricklinkPartId ?? part.partNumber,
          bricklinkCategoryId: detail?.category_id ?? part.bricklinkCategoryId,
          imageUrl: detail?.image_url ?? part.imageUrl,
          lastUpdated: completedAt,
          lastFetchedFromBricklink: completedAt,
          dataFreshness: "fresh",
          searchKeywords: buildSearchKeywords(part.partNumber, detail?.name ?? part.name),
          updatedAt: completedAt,
        });

        recordMetric("catalog.refresh.success", {
          partNumber: part.partNumber,
          durationMs,
          priceUpdated: Boolean(price?.avg_price),
        });

        refreshed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${part.partNumber}: ${message}`);
        recordMetric("catalog.refresh.error", {
          partNumber: part.partNumber,
          error: message,
          durationMs: Date.now() - requestStartedAt,
        });
      }
    }

    return { refreshed, errors };
  },
});
