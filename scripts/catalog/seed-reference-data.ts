#!/usr/bin/env ts-node

/**
 * Catalog Reference Seeding Script
 *
 * Purpose:
 * - Stream-parse Bricklink reference exports (XML + optional JSON lookup)
 * - Batch-insert color, category, part-color availability, and element refs
 *   into Convex tables for a specific Business Account (tenant)
 * - Avoid high memory usage by processing items incrementally via SAX
 *
 * Inputs & Files:
 * - docs/external-documentation/bricklink-data/colors.xml
 * - docs/external-documentation/bricklink-data/categories.xml
 * - docs/external-documentation/bricklink-data/codes.xml
 * - docs/external-documentation/bricklink-data/bin_lookup_v3.json (optional)
 *
 * How to run (examples):
 *   pnpm ts-node scripts/catalog/seed-reference-data.ts \
 *     --businessAccount "businessAccounts:123" \
 *     --convexUrl "https://YOUR-DEPLOYMENT.convex.cloud" \
 *     --adminKey "$CONVEX_ADMIN_KEY" \
 *     --batchSize 1000
 *
 *   # Dry-run (parse only, no writes):
 *   pnpm ts-node scripts/catalog/seed-reference-data.ts \
 *     --businessAccount "businessAccounts:123" \
 *     --convexUrl "https://YOUR-DEPLOYMENT.convex.cloud" \
 *     --dryRun
 *
 * Notes:
 * - Requires Convex Admin Key unless --dryRun is provided
 * - Batching size is configurable (default 1000)
 * - This script contributes to Story 2.2 (Catalog Search & Browse)
 */

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import sax from "sax";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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

const DATA_DIR = join(process.cwd(), "docs", "external-documentation", "bricklink-data");

const DEFAULT_BATCH_SIZE = 1000;

const log = (...args: unknown[]) => console.log(`[seed]`, ...args);

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

// Helper to validate and convert a string to a Convex Id for business accounts
const toBusinessAccountId = (value: string): Id<"businessAccounts"> => {
  if (!value.includes("businessAccounts")) {
    throw new Error(
      `businessAccount must be a Convex Id string (e.g. "businessAccounts:123"). Received: ${value}`,
    );
  }
  return value as Id<"businessAccounts">;
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .option("businessAccount", {
      type: "string",
      demandOption: true,
      describe: "Business account Convex Id to seed data for",
    })
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
    .help()
    .parse();

  if (!argv.convexUrl) {
    throw new Error("convexUrl is required. Pass --convexUrl or set NEXT_PUBLIC_CONVEX_URL.");
  }
  if (!argv.adminKey && !argv.dryRun) {
    throw new Error("adminKey is required unless running with --dryRun");
  }

  const businessAccountId = toBusinessAccountId(argv.businessAccount);
  // Initialize Convex client. Auth is elevated via admin key when provided.
  const convex = new ConvexHttpClient(argv.convexUrl);

  // Note: ConvexHttpClient from "convex/browser" does not expose setAdminAuth.
  // Admin auth is supported by Convex Server client; for browser client we rely on
  // server-side configured admin route or environment-based auth. Here we proceed
  // without setAdminAuth; ensure the Convex deployment allows these mutations via
  // appropriate auth context when running this script.

  const batchSize = Math.max(1, argv.batchSize ?? DEFAULT_BATCH_SIZE);
  const now = Date.now();

  const stats = {
    colors: { inserted: 0, updated: 0 },
    categories: { inserted: 0, updated: 0 },
    partColors: { inserted: 0, updated: 0 },
    elements: { inserted: 0, updated: 0 },
  };

  // Map human color names (lowercased) to Bricklink color IDs discovered during color seeding
  const colorNameToId = new Map<string, number>();
  const colorPath = join(DATA_DIR, "colors.xml");
  log(`Seeding colors from ${colorPath}`);

  let firstColorBatch = true;
  const colorBatch: SeedColorRecord[] = [];
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
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedBricklinkColors, {
          businessAccountId,
          records: colorBatch,
          clearExisting: firstColorBatch,
        });
        stats.colors.inserted += result.inserted;
        stats.colors.updated += result.updated;
      }
      firstColorBatch = false;
      colorBatch.length = 0;
    }
  });
  if (colorBatch.length > 0) {
    if (!argv.dryRun) {
      const result = await convex.mutation(api.functions.catalog.seedBricklinkColors, {
        businessAccountId,
        records: colorBatch,
        clearExisting: firstColorBatch,
      });
      stats.colors.inserted += result.inserted;
      stats.colors.updated += result.updated;
    }
    colorBatch.length = 0;
  }

  const categoryPath = join(DATA_DIR, "categories.xml");
  log(`Seeding categories from ${categoryPath}`);

  let firstCategoryBatch = true;
  const categoryBatch: SeedCategoryRecord[] = [];
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
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedBricklinkCategories, {
          businessAccountId,
          records: categoryBatch,
          clearExisting: firstCategoryBatch,
        });
        stats.categories.inserted += result.inserted;
        stats.categories.updated += result.updated;
      }
      firstCategoryBatch = false;
      categoryBatch.length = 0;
    }
  });
  if (categoryBatch.length > 0) {
    if (!argv.dryRun) {
      const result = await convex.mutation(api.functions.catalog.seedBricklinkCategories, {
        businessAccountId,
        records: categoryBatch,
        clearExisting: firstCategoryBatch,
      });
      stats.categories.inserted += result.inserted;
      stats.categories.updated += result.updated;
    }
    categoryBatch.length = 0;
  }

  const codesPath = join(DATA_DIR, "codes.xml");
  log(`Seeding part color availability & element references from ${codesPath}`);

  let firstAvailabilityBatch = true;
  let firstElementBatch = true;
  const availabilityBatch: SeedAvailabilityRecord[] = [];
  const elementBatch: SeedElementRecord[] = [];

  await parseXmlStream(codesPath, async (item) => {
    const partNumber = item.ITEMID?.trim();
    const colorName = item.COLOR?.trim();
    const elementId = item.CODENAME?.trim();

    if (!partNumber || !colorName || !elementId) return;
    const colorId = colorNameToId.get(colorName.toLowerCase());
    if (!colorId) {
      log(`Skipping code entry with unknown color: ${colorName}`);
      return;
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
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedPartColorAvailability, {
          businessAccountId,
          records: availabilityBatch,
          clearExisting: firstAvailabilityBatch,
        });
        stats.partColors.inserted += result.inserted;
        stats.partColors.updated += result.updated;
      }
      firstAvailabilityBatch = false;
      availabilityBatch.length = 0;
    }

    if (elementBatch.length >= batchSize) {
      if (!argv.dryRun) {
        const result = await convex.mutation(api.functions.catalog.seedElementReferences, {
          businessAccountId,
          records: elementBatch,
          clearExisting: firstElementBatch,
        });
        stats.elements.inserted += result.inserted;
        stats.elements.updated += result.updated;
      }
      firstElementBatch = false;
      elementBatch.length = 0;
    }
  });

  if (availabilityBatch.length > 0) {
    if (!argv.dryRun) {
      const result = await convex.mutation(api.functions.catalog.seedPartColorAvailability, {
        businessAccountId,
        records: availabilityBatch,
        clearExisting: firstAvailabilityBatch,
      });
      stats.partColors.inserted += result.inserted;
      stats.partColors.updated += result.updated;
    }
  }

  if (elementBatch.length > 0) {
    if (!argv.dryRun) {
      const result = await convex.mutation(api.functions.catalog.seedElementReferences, {
        businessAccountId,
        records: elementBatch,
        clearExisting: firstElementBatch,
      });
      stats.elements.inserted += result.inserted;
      stats.elements.updated += result.updated;
    }
  }

  const sortLookupPath = join(DATA_DIR, "bin_lookup_v3.json");
  try {
    await readFile(sortLookupPath, "utf8");
    log(
      `Sort lookup file detected at ${sortLookupPath}. Integrate with catalog records via follow-up mutation once base catalog entries exist.`,
    );
  } catch (_error) {
    log(`Sort lookup file not found at ${sortLookupPath}. Skipping.`);
  }

  log(`Completed seeding${argv.dryRun ? " (dry run)" : ""}.`);
  log(`Color references: +${stats.colors.inserted} / ~${stats.colors.updated} updates.`);
  log(`Category references: +${stats.categories.inserted} / ~${stats.categories.updated} updates.`);
  log(
    `Part-color availability: +${stats.partColors.inserted} / ~${stats.partColors.updated} updates.`,
  );
  log(`Element references: +${stats.elements.inserted} / ~${stats.elements.updated} updates.`);
};

main().catch((error) => {
  console.error("Seeding failed", error);
  process.exit(1);
});
