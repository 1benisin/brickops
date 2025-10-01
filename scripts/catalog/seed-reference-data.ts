#!/usr/bin/env ts-node

/**
 * Catalog Reference Seeding Script
 *
 * ====================
 * WHAT THIS SCRIPT DOES
 * ====================
 *
 * This script populates the global Bricklink reference catalog in Convex by parsing
 * XML exports from Bricklink and upserting them into database tables. It handles:
 *
 * 1. **Colors** (bricklinkColorReference)
 *    - Upserts color definitions with RGB values, transparency flags
 *    - Adds special "(Not Applicable)" color with ID 0
 *    - Updates by bricklinkColorId if exists, inserts new colors otherwise
 *
 * 2. **Categories** (bricklinkCategoryReference)
 *    - Upserts part categories with hierarchical paths
 *    - Updates by bricklinkCategoryId if exists, inserts new categories otherwise
 *
 * 3. **Part-Color Availability** (bricklinkPartColorAvailability)
 *    - Maps which colors are available for each part number
 *    - Merges element IDs when updating existing records
 *    - Updates by partNumber+colorId composite key if exists, inserts otherwise
 *
 * 4. **Element References** (bricklinkElementReference)
 *    - Maps LEGO element IDs to part numbers and colors
 *    - Allows reverse lookup from element ID to part
 *    - Updates by elementId if exists, inserts new elements otherwise
 *
 * 5. **Catalog Parts** (legoPartCatalog)
 *    - Master part catalog with names, dimensions, weights
 *    - Converts dimensions from studs to millimeters (1 stud = 8mm)
 *    - Updates by partNumber if exists, inserts new parts otherwise
 *
 * 6. **Filter Counts** (catalogFilterCounts)
 *    - Pre-computed counts for efficient catalog filtering UI
 *    - CLEARS and rebuilds from scratch after all data is loaded
 *    - Aggregates color/category counts across all parts
 *
 * DATA BEHAVIOR (UPSERT-ONLY - SAFE & IDEMPOTENT):
 * - ✅ **All runs**: Updates existing records by ID match, inserts new ones
 * - ✅ **No data loss**: Existing data is preserved and updated, never deleted
 * - ✅ **Crash-safe**: Can be re-run at any time without data loss
 * - ✅ **Idempotent**: Running multiple times produces same end result
 * - **Matching logic**: Uses bricklinkColorId, bricklinkCategoryId, elementId, partNumber
 * - **No deletions**: Records not in XML remain in database (manual cleanup needed)
 * - **Dry-run mode**: Parses files without writing to database
 * - **Exception**: Filter counts are cleared and rebuilt (computed data only)
 *
 * WHAT THIS SCRIPT DOES NOT HANDLE:
 * - Detailed part images (populated separately via Bricklink API)
 * - Pricing data (populated separately via Bricklink Price Guide API)
 * - Part-specific attributes like "printed" or "patterned" flags
 * - Tenant-specific data (sort locations, custom names) - see catalogPartOverlay
 *
 * Performance Optimizations:
 * - Small batch size (100 records): Prevents exceeding Convex's 32k document read limit
 * - Indexed queries per record: Uses database indexes for O(log n) lookups
 * - Simple loop pattern: Follows Convex best practices, let Convex handle transactions
 * - Stream parsing: Uses SAX to avoid loading entire XML files into memory
 * - Progress reporting: Real-time progress updates during seeding
 * - No pre-loading: Query-as-you-go pattern recommended by Convex docs
 *
 * Input Files (Required):
 * - docs/external-documentation/bricklink-data/colors.xml
 * - docs/external-documentation/bricklink-data/categories.xml
 * - docs/external-documentation/bricklink-data/codes.xml
 * - docs/external-documentation/bricklink-data/Parts.xml
 *
 * How to Run:
 *
 *   # Full seeding to production:
 *   npx tsx scripts/catalog/seed-reference-data.ts \
 *     --convexUrl "https://YOUR-DEPLOYMENT.convex.cloud" \
 *     --adminKey "$CONVEX_ADMIN_KEY" \
 *     --batchSize 1000
 *
 *   # Dry-run (parse only, no database writes):
 *   npx tsx scripts/catalog/seed-reference-data.ts \
 *     --convexUrl "https://YOUR-DEPLOYMENT.convex.cloud" \
 *     --dryRun
 *
 *   # Use environment variables:
 *   CONVEX_URL="https://..." CONVEX_ADMIN_KEY="..." \
 *   npx tsx scripts/catalog/seed-reference-data.ts
 *
 * Environment Variables:
 * - CONVEX_URL or NEXT_PUBLIC_CONVEX_URL: Deployment URL
 * - CONVEX_ADMIN_KEY: Admin API key (required unless --dryRun)
 *
 * Options:
 * --convexUrl: Convex deployment URL
 * --adminKey: Convex admin key for authentication
 * --batchSize: Records per batch (default: 100, max recommended: 200)
 * --dryRun: Parse files without writing to database
 * --onlyParts: Seed only catalog parts (skip colors, categories, codes)
 * --onlyFilterCounts: Compute and seed only catalog filter counts
 *
 * Expected Output:
 * - Real-time progress updates showing records processed
 * - Final statistics: inserted, updated counts per data type
 * - Total processing time
 *
 * Typical Dataset Size:
 * - Colors: ~200 records
 * - Categories: ~100 records
 * - Part-color availability: ~50,000-100,000 records
 * - Element references: ~50,000-100,000 records
 * - Catalog parts: ~90,037 records
 * - Filter counts: ~500-1,000 aggregated records
 *
 * Performance Expectations (with batch size 100):
 * - Initial seed (empty database): 10-15 minutes for full dataset
 * - Re-seed (updating existing): 15-25 minutes (queries + updates slower than inserts)
 * - Dry-run: 1-2 minutes (parsing only, no database I/O)
 * - Larger batches (200) can reduce time but may hit Convex limits with existing data
 */

import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import sax from "sax";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { api } from "../../convex/_generated/api";

type SeedColorRecord = {
  bricklinkColorId: number;
  name: string;
  rgb?: string;
  colorType?: string;
  isTransparent?: boolean;
  syncedAt: number;
};

type SeedCategoryRecord = {
  bricklinkCategoryId: number;
  name: string;
  parentCategoryId?: number;
  path?: number[];
  syncedAt: number;
};

type SeedAvailabilityRecord = {
  partNumber: string;
  bricklinkPartId?: string;
  colorId: number;
  elementIds?: string[];
  isLegacy?: boolean;
  syncedAt: number;
};

type SeedElementRecord = {
  elementId: string;
  partNumber: string;
  colorId: number;
  bricklinkPartId?: string;
  designId?: string;
  syncedAt: number;
};

type SeedCatalogPartRecord = {
  partNumber: string;
  name: string;
  description?: string;
  bricklinkPartId?: string;
  bricklinkCategoryId?: number;
  weightGrams?: number;
  dimensionXMm?: number;
  dimensionYMm?: number;
  dimensionZMm?: number;
  dataSource: "manual";
  lastUpdated: number;
  dataFreshness: "fresh";
};

const DATA_DIR = join(process.cwd(), "docs", "external-documentation", "bricklink-data");

// Reduced batch size per Convex best practices to avoid 32k document read limit
// Large batches with lookups can exceed limits even with indexed queries
const DEFAULT_BATCH_SIZE = 100;

const log = (...args: unknown[]) => console.log(`[seed]`, ...args);
const logProgress = (category: string, current: number, total: number | string) => {
  if (typeof total === "number" && total > 0) {
    const percent = ((current / total) * 100).toFixed(1);
    log(`${category}: ${current.toLocaleString()}/${total.toLocaleString()} (${percent}%)`);
  } else {
    log(`${category}: ${current.toLocaleString()} processed`);
  }
};

type AdminCapableConvexClient = ConvexHttpClient & {
  setAdminAuth(token: string, actingAsIdentity?: unknown): void;
};

export const createConvexAdminClient = (
  url: string,
  options: { adminKey?: string; dryRun: boolean },
): AdminCapableConvexClient => {
  const client = new ConvexHttpClient(url) as AdminCapableConvexClient;

  if (!options.dryRun) {
    if (!options.adminKey) {
      throw new Error("adminKey is required when seeding without --dryRun");
    }
    client.setAdminAuth(options.adminKey);
  }

  return client;
};

/**
 * Stream-parse an XML file using SAX.
 * - Invokes onItem for each <ITEM> block with a flat key/value map of tags
 * - Processes incrementally to keep memory usage low
 */
const parseXmlStream = async (
  filePath: string,
  onItem: (item: Record<string, string>) => Promise<void>,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    const parser = sax.createStream(true, { trim: true, normalize: true });
    const current: Record<string, string> = {};
    let pending = Promise.resolve();
    let openTag: string | null = null;

    parser.on("opentag", (tag: { name: string }) => {
      if (tag.name === "ITEM") {
        Object.keys(current).forEach((key) => delete current[key]);
      }
      openTag = tag.name;
    });

    parser.on("text", (text: string) => {
      if (!openTag || openTag === "ITEM") return;
      current[openTag] = current[openTag] ? `${current[openTag]}${text}` : text;
    });

    parser.on("closetag", (name: string) => {
      if (name === "ITEM") {
        const copy = { ...current };
        pending = pending.then(() => onItem(copy));
        Object.keys(current).forEach((key) => delete current[key]);
      }
      openTag = null;
    });

    parser.on("error", (error: unknown) => {
      stream.destroy();
      reject(error);
    });

    parser.on("end", () => {
      pending.then(resolve).catch(reject);
    });

    stream.pipe(parser);
  });
};

export const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .option("convexUrl", {
      type: "string",
      default: process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
      describe: "Convex deployment URL",
    })
    .option("adminKey", {
      type: "string",
      default: process.env.CONVEX_ADMIN_KEY,
      describe: "Convex admin key for authenticated seeding",
    })
    .option("batchSize", {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Number of records to upload per mutation batch",
    })
    .option("dryRun", {
      type: "boolean",
      default: false,
      describe: "Parse input files without writing to Convex",
    })
    .option("onlyParts", {
      type: "boolean",
      default: false,
      describe: "Seed only catalog parts (skip colors, categories, codes)",
    })
    .option("onlyFilterCounts", {
      type: "boolean",
      default: false,
      describe: "Compute and seed only catalog filter counts",
    })
    .help()
    .parse();

  if (!argv.convexUrl) {
    throw new Error("convexUrl is required. Pass --convexUrl or set NEXT_PUBLIC_CONVEX_URL.");
  }
  if (!argv.adminKey && !argv.dryRun) {
    throw new Error("adminKey is required unless running with --dryRun");
  }

  // Initialize Convex client and elevate with admin token when run against a real deployment.
  const convex = createConvexAdminClient(argv.convexUrl, {
    adminKey: argv.adminKey,
    dryRun: argv.dryRun,
  });

  const batchSize = Math.max(1, argv.batchSize ?? DEFAULT_BATCH_SIZE);
  const now = Date.now();

  const stats = {
    colors: { inserted: 0, updated: 0 },
    categories: { inserted: 0, updated: 0 },
    partColors: { inserted: 0, updated: 0 },
    elements: { inserted: 0, updated: 0 },
    catalogParts: { inserted: 0, updated: 0 },
    filterCounts: null as {
      inserted: number;
      colorCount: number;
      categoryCount: number;
      processedColorAvailability: number;
      processedCatalogParts: number;
    } | null,
  };

  // Early exit mode: compute only filter counts
  if (argv.onlyFilterCounts) {
    if (!argv.dryRun) {
      log(`Computing and seeding catalog filter counts (only)...`);
      const filterCountsResult = await convex.action(
        api.functions.catalog.seedCatalogFilterCounts,
        {
          clearExisting: true,
        },
      );
      log(
        `Filter counts seeded: +${filterCountsResult.inserted} records (${filterCountsResult.colorCount} colors, ${filterCountsResult.categoryCount} categories from ${filterCountsResult.processedColorAvailability} color availabilities, ${filterCountsResult.processedCatalogParts} catalog parts).`,
      );
      stats.filterCounts = filterCountsResult;
    } else {
      log(`Dry run: would compute and seed catalog filter counts`);
    }
    log(`Completed seeding${argv.dryRun ? " (dry run)" : ""}.`);
    if (stats.filterCounts) {
      log(
        `Filter counts: +${stats.filterCounts.inserted} records (${stats.filterCounts.colorCount} colors, ${stats.filterCounts.categoryCount} categories from ${stats.filterCounts.processedColorAvailability} color availabilities, ${stats.filterCounts.processedCatalogParts} catalog parts).`,
      );
    }
    return;
  }

  // Map human color names (lowercased) to Bricklink color IDs discovered during color seeding
  const colorNameToId = new Map<string, number>();
  if (!argv.onlyParts) {
    const colorPath = join(DATA_DIR, "colors.xml");
    log(`Seeding colors from ${colorPath}`);

    const colorBatch: SeedColorRecord[] = [];
    let colorCount = 0;

    // Add special "Not Applicable" color entry
    colorBatch.push({
      bricklinkColorId: 0,
      name: "(Not Applicable)",
      rgb: undefined,
      colorType: "Special",
      isTransparent: false,
      syncedAt: now,
    });
    colorNameToId.set("(not applicable)", 0);

    await parseXmlStream(colorPath, async (item) => {
      const id = Number(item.COLOR);
      const name = item.COLORNAME?.trim();
      if (!id || !name) return;

      const colorType = item.COLORTYPE?.trim();
      const rgb = item.COLORRGB?.trim() || undefined;

      colorNameToId.set(name.toLowerCase(), id);

      colorBatch.push({
        bricklinkColorId: id,
        name,
        rgb,
        colorType,
        isTransparent: Boolean(colorType && /trans/i.test(colorType)),
        syncedAt: now,
      });

      if (colorBatch.length >= batchSize) {
        colorCount += colorBatch.length;
        logProgress("Colors", colorCount, "in progress");
        if (!argv.dryRun) {
          const result = await convex.mutation(api.functions.catalog.seedBricklinkColors, {
            records: colorBatch,
          });
          stats.colors.inserted += result.inserted;
          stats.colors.updated += result.updated;
        }
        colorBatch.length = 0;
      }
    });
    if (colorBatch.length > 0) {
      colorCount += colorBatch.length;
      logProgress("Colors", colorCount, "complete");
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedBricklinkColors, {
          records: colorBatch,
        });
        stats.colors.inserted += result.inserted;
        stats.colors.updated += result.updated;
      }
      colorBatch.length = 0;
    }
  }

  if (!argv.onlyParts) {
    const categoryPath = join(DATA_DIR, "categories.xml");
    log(`Seeding categories from ${categoryPath}`);

    const categoryBatch: SeedCategoryRecord[] = [];
    let categoryCount = 0;

    await parseXmlStream(categoryPath, async (item) => {
      const id = Number(item.CATEGORY);
      const name = item.CATEGORYNAME?.trim();
      if (!id || !name) return;

      categoryBatch.push({
        bricklinkCategoryId: id,
        name,
        parentCategoryId: undefined,
        path: [id],
        syncedAt: now,
      });

      if (categoryBatch.length >= batchSize) {
        categoryCount += categoryBatch.length;
        logProgress("Categories", categoryCount, "in progress");
        if (!argv.dryRun) {
          const result = await convex.mutation(api.functions.catalog.seedBricklinkCategories, {
            records: categoryBatch,
          });
          stats.categories.inserted += result.inserted;
          stats.categories.updated += result.updated;
        }
        categoryBatch.length = 0;
      }
    });
    if (categoryBatch.length > 0) {
      categoryCount += categoryBatch.length;
      logProgress("Categories", categoryCount, "complete");
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedBricklinkCategories, {
          records: categoryBatch,
        });
        stats.categories.inserted += result.inserted;
        stats.categories.updated += result.updated;
      }
      categoryBatch.length = 0;
    }
  }

  if (!argv.onlyParts) {
    const codesPath = join(DATA_DIR, "codes.xml");
    log(`Seeding part color availability & element references from ${codesPath}`);

    const availabilityBatch: SeedAvailabilityRecord[] = [];
    const elementBatch: SeedElementRecord[] = [];
    let partColorCount = 0;
    let elementCount = 0;

    await parseXmlStream(codesPath, async (item) => {
      const partNumber = item.ITEMID?.trim();
      const colorName = item.COLOR?.trim();
      const elementId = item.CODENAME?.trim();

      if (!partNumber || !colorName || !elementId) return;

      // Handle "Not Applicable" colors by using a special color ID
      let colorId: number;
      if (colorName.toLowerCase() === "(not applicable)") {
        // Use a special color ID for "Not Applicable" - using 9999 as a placeholder
        colorId = 0;
        log(`Using special color ID 0 for "Not Applicable" color`);
      } else {
        const foundColorId = colorNameToId.get(colorName.toLowerCase());
        if (!foundColorId) {
          log(`Skipping code entry with unknown color: ${colorName}`);
          return;
        }
        colorId = foundColorId;
      }

      availabilityBatch.push({
        partNumber,
        bricklinkPartId: partNumber,
        colorId,
        elementIds: [elementId],
        isLegacy: false,
        syncedAt: now,
      });

      elementBatch.push({
        elementId,
        partNumber,
        colorId,
        bricklinkPartId: partNumber,
        designId: undefined,
        syncedAt: now,
      });

      if (availabilityBatch.length >= batchSize) {
        partColorCount += availabilityBatch.length;
        logProgress("Part-color availability", partColorCount, "in progress");
        if (!argv.dryRun) {
          const result = await convex.mutation(api.functions.catalog.seedPartColorAvailability, {
            records: availabilityBatch,
          });
          stats.partColors.inserted += result.inserted;
          stats.partColors.updated += result.updated;
        }
        availabilityBatch.length = 0;
      }

      if (elementBatch.length >= batchSize) {
        elementCount += elementBatch.length;
        logProgress("Element references", elementCount, "in progress");
        if (!argv.dryRun) {
          const result = await convex.mutation(api.functions.catalog.seedElementReferences, {
            records: elementBatch,
          });
          stats.elements.inserted += result.inserted;
          stats.elements.updated += result.updated;
        }
        elementBatch.length = 0;
      }
    });

    if (availabilityBatch.length > 0) {
      partColorCount += availabilityBatch.length;
      logProgress("Part-color availability", partColorCount, "complete");
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedPartColorAvailability, {
          records: availabilityBatch,
        });
        stats.partColors.inserted += result.inserted;
        stats.partColors.updated += result.updated;
      }
    }

    if (elementBatch.length > 0) {
      elementCount += elementBatch.length;
      logProgress("Element references", elementCount, "complete");
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedElementReferences, {
          records: elementBatch,
        });
        stats.elements.inserted += result.inserted;
        stats.elements.updated += result.updated;
      }
    }
  }

  // Seed parts catalog from Parts.xml
  const partsPath = join(DATA_DIR, "Parts.xml");
  log(`Seeding parts catalog from ${partsPath}`);

  const partBatch: SeedCatalogPartRecord[] = [];
  let partCount = 0;

  await parseXmlStream(partsPath, async (item) => {
    const itemType = item.ITEMTYPE?.trim();
    const partNumber = item.ITEMID?.trim();
    const name = item.ITEMNAME?.trim();

    // Only process Part items (ITEMTYPE=P)
    if (itemType !== "P" || !partNumber || !name) return;

    const categoryId = item.CATEGORY?.trim() ? Number(item.CATEGORY.trim()) : undefined;
    const weightStr = item.ITEMWEIGHT?.trim();
    const dimXStr = item.ITEMDIMX?.trim();
    const dimYStr = item.ITEMDIMY?.trim();
    const dimZStr = item.ITEMDIMZ?.trim();

    // Parse dimensions and convert from studs to millimeters (1 stud = 8mm)
    const weightGrams = weightStr ? Number(weightStr) : undefined;
    const dimensionXMm = dimXStr ? Number(dimXStr) * 8 : undefined;
    const dimensionYMm = dimYStr ? Number(dimYStr) * 8 : undefined;
    const dimensionZMm = dimZStr ? Number(dimZStr) * 8 : undefined;

    partBatch.push({
      partNumber,
      name,
      bricklinkPartId: partNumber,
      bricklinkCategoryId: categoryId,
      weightGrams,
      dimensionXMm,
      dimensionYMm,
      dimensionZMm,
      dataSource: "manual",
      lastUpdated: now,
      dataFreshness: "fresh",
    });

    if (partBatch.length >= batchSize) {
      partCount += partBatch.length;
      logProgress("Catalog parts", partCount, "in progress");
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedLegoPartCatalog, {
          records: partBatch,
        });
        stats.catalogParts.inserted += result.inserted;
        stats.catalogParts.updated += result.updated;
      }
      partBatch.length = 0;
    }
  });

  if (partBatch.length > 0) {
    partCount += partBatch.length;
    logProgress("Catalog parts", partCount, "complete");
    if (!argv.dryRun) {
      const result = await convex.mutation(api.functions.catalog.seedLegoPartCatalog, {
        records: partBatch,
      });
      stats.catalogParts.inserted += result.inserted;
      stats.catalogParts.updated += result.updated;
    }
  }

  // Note: Sort location data (if available) should be loaded into tenant-specific
  // catalogPartOverlay records, not the global catalog. This is handled separately
  // per business account via overlay management functions.

  // Seed filter counts for efficient catalog filtering
  if (!argv.dryRun) {
    log(`Computing and seeding catalog filter counts...`);
    const filterCountsResult = await convex.action(api.functions.catalog.seedCatalogFilterCounts, {
      clearExisting: true,
    });
    log(
      `Filter counts seeded: +${filterCountsResult.inserted} records (${filterCountsResult.colorCount} colors, ${filterCountsResult.categoryCount} categories from ${filterCountsResult.processedColorAvailability} color availabilities, ${filterCountsResult.processedCatalogParts} catalog parts).`,
    );
    stats.filterCounts = filterCountsResult;
  }

  log(`Completed seeding${argv.dryRun ? " (dry run)" : ""}.`);
  log(`Color references: +${stats.colors.inserted} / ~${stats.colors.updated} updates.`);
  log(`Category references: +${stats.categories.inserted} / ~${stats.categories.updated} updates.`);
  log(
    `Part-color availability: +${stats.partColors.inserted} / ~${stats.partColors.updated} updates.`,
  );
  log(`Element references: +${stats.elements.inserted} / ~${stats.elements.updated} updates.`);
  log(`Catalog parts: +${stats.catalogParts.inserted} / ~${stats.catalogParts.updated} updates.`);
  if (stats.filterCounts) {
    log(
      `Filter counts: +${stats.filterCounts.inserted} records (${stats.filterCounts.colorCount} colors, ${stats.filterCounts.categoryCount} categories from ${stats.filterCounts.processedColorAvailability} color availabilities, ${stats.filterCounts.processedCatalogParts} catalog parts).`,
    );
  }
};

const isDirectExecution = (() => {
  if (typeof process === "undefined" || !process.argv?.[1]) {
    return false;
  }

  try {
    const entryUrl = pathToFileURL(resolve(process.argv[1])).href;
    return entryUrl === import.meta.url;
  } catch (_error) {
    return false;
  }
})();

if (isDirectExecution) {
  main().catch((error) => {
    console.error("Seeding failed", error);
    process.exit(1);
  });
}
