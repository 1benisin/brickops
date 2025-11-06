#!/usr/bin/env ts-node

/**
 * XML → JSONL Converter for Convex Import
 *
 * This script reads Bricklink XML datasets and writes importable JSONL files under
 * docs/external-documentation/bricklink-data/ that match our Convex schema in convex/schema.ts.
 *
 * It DOES NOT contact Convex or import data. Use `npx convex import --table <table> <jsonl>`
 * separately to load the generated JSONL files.
 *
 * Schema Alignment:
 * - parts: no, name, type (PART/MINIFIG/SET), categoryId, alternateNo, imageUrl, etc.
 * - categories: categoryId, categoryName, parentId
 * - bricklinkElementReference: elementId, partNumber, colorId, bricklinkPartId
 *
 * Note: Colors are now handled by scripts/seed/build-colors.ts
 *
 * Safety & Performance:
 * - Streaming SAX parser (low memory)
 * - Record limit per file via --limit (default 100) to avoid huge outputs during testing
 * - Minimal required fields per table; complex fields (arrays/objects) are flattened/omitted
 */

import { createReadStream, createWriteStream, constants } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sax from "sax";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { decode } from "he";

// Types intentionally minimal; conversion writes JSONL files directly

const DATA_DIR = join(
  process.cwd(),
  "docs",
  "external-documentation",
  "api-bricklink",
  "seed-data",
);

const DEFAULT_LIMIT = 100; // max rows to emit per JSONL file; configurable via --limit

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

const log = (...args: unknown[]) =>
  console.log(`${colors.cyan}${colors.bright}[catalog]${colors.reset}`, ...args);

const logProgress = (category: string, current: number, total: number | string) => {
  if (typeof total === "number" && total > 0) {
    const percent = ((current / total) * 100).toFixed(1);
    log(
      `${colors.green}✓${colors.reset} ${colors.bright}${category}${colors.reset}: ${colors.yellow}${current.toLocaleString()}${colors.reset}/${colors.dim}${total.toLocaleString()}${colors.reset} ${colors.magenta}(${percent}%)${colors.reset}`,
    );
  } else {
    log(
      `${colors.green}✓${colors.reset} ${colors.bright}${category}${colors.reset}: ${colors.yellow}${current.toLocaleString()}${colors.reset} ${colors.dim}processed${colors.reset}`,
    );
  }
};

/**
 * Decodes HTML entities in a string using the 'he' library
 * Handles both named entities (&amp;) and numeric entities (&#40;)
 */
const decodeHtmlEntities = (input: string): string => {
  return decode(input, { isAttributeValue: false });
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
    .option("limit", {
      type: "number",
      default: DEFAULT_LIMIT,
      describe: "Max number of records to emit per CSV (0 = no limit)",
    })
    .option("parts-only", {
      type: "boolean",
      default: false,
      describe: "Only build parts JSONL files (skip categories, elements)",
    })
    .help()
    .parse();

  const limit = Math.max(0, argv.limit ?? DEFAULT_LIMIT);
  // Set timestamp to one year ago so seeded data is treated as stale and triggers fresh API fetches
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  // Ensure output directory exists
  await mkdir(DATA_DIR, { recursive: true });

  // 1) Categories → categories.jsonl (schema: categoryId, categoryName, parentId)
  if (!argv["parts-only"]) {
    const categoryXmlPath = join(DATA_DIR, "categories.xml");
    const categoryJsonlPath = join(DATA_DIR, "categories.jsonl");

    try {
      await access(categoryXmlPath, constants.F_OK);
      log(
        `${colors.blue}→${colors.reset} Writing categories JSONL ${colors.dim}→${colors.reset} ${colors.dim}${categoryJsonlPath}${colors.reset}`,
      );
      const out = createWriteStream(categoryJsonlPath, { encoding: "utf8" });

      let categoryCount = 0;
      await parseXmlStream(categoryXmlPath, async (item) => {
        const categoryId = Number(item.CATEGORY);
        const categoryName = item.CATEGORYNAME?.trim();
        if (!categoryId || !categoryName) return;

        const doc: Record<string, unknown> = {
          categoryId,
          categoryName: decodeHtmlEntities(String(categoryName)),
          lastFetched: oneYearAgo,
          createdAt: oneYearAgo,
        };

        // Note: parentId would come from XML if available, currently not in the data
        // If PARENT field exists in XML, add: if (item.PARENT) doc.parentId = Number(item.PARENT);

        const line = `${JSON.stringify(doc)}\n`;
        if (!out.write(line)) await new Promise((r) => out.once("drain", r));
        categoryCount++;
        if (limit && categoryCount >= limit) return;
      });
      await new Promise<void>((resolve) => out.end(resolve));
      logProgress("Categories JSONL", categoryCount, "complete");
    } catch {
      log(
        `${colors.yellow}⚠${colors.reset} Skipping categories - ${colors.dim}categories.xml not found${colors.reset}`,
      );
    }
  }

  // 2) Codes → bricklinkElementReference.jsonl (schema: elementId, partNumber, colorId, bricklinkPartId, designId, syncedAt)
  if (!argv["parts-only"]) {
    const codesPath = join(DATA_DIR, "codes.xml");
    const elementJsonl = join(DATA_DIR, "bricklinkElementReference.jsonl");

    try {
      await access(codesPath, constants.F_OK);
      log(
        `${colors.blue}→${colors.reset} Writing element reference JSONL ${colors.dim}→${colors.reset} ${colors.dim}${elementJsonl}${colors.reset}`,
      );
      const outElem = createWriteStream(elementJsonl, { encoding: "utf8" });

      // For mapping color names to IDs quickly, we map "(Not Applicable)" → 0 and skip unknown names.
      // In production, you may want to build a full colorName→colorId map from colors.xml first.

      let elemCount = 0;
      await parseXmlStream(codesPath, async (item) => {
        const partNumber = item.ITEMID?.trim();
        const colorName = item.COLOR?.trim();
        const elementId = item.CODENAME?.trim();
        if (!partNumber || !colorName || !elementId) return;

        let colorId: number | undefined;
        if (colorName.toLowerCase() === "(not applicable)") colorId = 0;
        // Unknown color names are skipped to avoid mismatches without a full colorName→ID map
        if (colorId === undefined) return;

        const elemDoc: Record<string, unknown> = {
          elementId: String(elementId),
          partNumber: String(partNumber),
          colorId,
          bricklinkPartId: String(partNumber),
          syncedAt: oneYearAgo,
        };
        // designId not available in this XML, would come from another source

        if (!outElem.write(`${JSON.stringify(elemDoc)}\n`))
          await new Promise((r) => outElem.once("drain", r));
        elemCount++;
        if (limit && elemCount >= limit) return;
      });
      await new Promise<void>((resolve) => outElem.end(resolve));
      logProgress("Element references JSONL", elemCount, "complete");
    } catch {
      log(
        `${colors.yellow}⚠${colors.reset} Skipping element references - ${colors.dim}codes.xml not found${colors.reset}`,
      );
    }
  }

  // 3) Parts → parts.jsonl (schema: no, name, type, categoryId, alternateNo, imageUrl, etc.)
  {
    const partsPath = join(DATA_DIR, "Parts.xml");
    const partsJsonl = join(DATA_DIR, "parts.jsonl");

    try {
      await access(partsPath, constants.F_OK);
      log(
        `${colors.blue}→${colors.reset} Writing parts JSONL ${colors.dim}→${colors.reset} ${colors.dim}${partsJsonl}${colors.reset}`,
      );
      const out = createWriteStream(partsJsonl, { encoding: "utf8" });

      // Map Bricklink item type codes to schema type enum
      const typeMap: Record<string, "PART" | "MINIFIG" | "SET"> = {
        P: "PART",
        M: "MINIFIG",
        S: "SET",
      };

      let partCount = 0;
      await parseXmlStream(partsPath, async (item) => {
        const itemTypeCode = item.ITEMTYPE?.trim();
        const partNumber = item.ITEMID?.trim();
        const name = item.ITEMNAME?.trim();

        // Only process PART, MINIFIG, SET types
        if (!itemTypeCode || !typeMap[itemTypeCode] || !partNumber || !name) return;

        const type = typeMap[itemTypeCode];
        const categoryId = item.CATEGORY?.trim() ? Number(item.CATEGORY.trim()) : undefined;

        const doc: Record<string, unknown> = {
          no: String(partNumber),
          name: decodeHtmlEntities(String(name)),
          type,
          lastFetched: oneYearAgo,
          createdAt: oneYearAgo,
        };

        // Add optional fields if present
        if (categoryId) doc.categoryId = categoryId;
        if (item.ALTERNATE) doc.alternateNo = String(item.ALTERNATE.trim());
        if (item.IMAGEURL) doc.imageUrl = String(item.IMAGEURL.trim());
        if (item.THUMBNAILURL) doc.thumbnailUrl = String(item.THUMBNAILURL.trim());
        if (item.WEIGHT) doc.weight = Number(item.WEIGHT.trim());
        if (item.DIMX) doc.dimX = String(item.DIMX.trim());
        if (item.DIMY) doc.dimY = String(item.DIMY.trim());
        if (item.DIMZ) doc.dimZ = String(item.DIMZ.trim());
        if (item.YEAR) doc.yearReleased = Number(item.YEAR.trim());
        if (item.DESCRIPTION) doc.description = decodeHtmlEntities(String(item.DESCRIPTION.trim()));
        if (item.ISOBSOLETE) doc.isObsolete = item.ISOBSOLETE.trim().toLowerCase() === "true";

        const line = `${JSON.stringify(doc)}\n`;
        if (!out.write(line)) await new Promise((r) => out.once("drain", r));
        partCount++;
        if (limit && partCount >= limit) return;
      });
      await new Promise<void>((resolve) => out.end(resolve));
      logProgress("Parts JSONL", partCount, "complete");
    } catch {
      log(
        `${colors.yellow}⚠${colors.reset} Skipping parts - ${colors.dim}Parts.xml not found${colors.reset}`,
      );
    }
  }

  // 4) Parts Sample → parts-sample.jsonl (250 records for quick testing)
  {
    const partsPath = join(DATA_DIR, "Parts.xml");
    const partsSampleJsonl = join(DATA_DIR, "parts-sample.jsonl");

    try {
      await access(partsPath, constants.F_OK);
      log(
        `${colors.blue}→${colors.reset} Writing parts sample JSONL ${colors.dim}→${colors.reset} ${colors.dim}${partsSampleJsonl}${colors.reset}`,
      );
      const out = createWriteStream(partsSampleJsonl, { encoding: "utf8" });

      // Map Bricklink item type codes to schema type enum
      const typeMap: Record<string, "PART" | "MINIFIG" | "SET"> = {
        P: "PART",
        M: "MINIFIG",
        S: "SET",
      };

      const sampleLimit = 250; // Fixed sample size for testing
      let sampleCount = 0;

      await parseXmlStream(partsPath, async (item) => {
        if (sampleCount >= sampleLimit) return;

        const itemTypeCode = item.ITEMTYPE?.trim();
        const partNumber = item.ITEMID?.trim();
        const name = item.ITEMNAME?.trim();

        // Only process PART, MINIFIG, SET types
        if (!itemTypeCode || !typeMap[itemTypeCode] || !partNumber || !name) return;

        const type = typeMap[itemTypeCode];
        const categoryId = item.CATEGORY?.trim() ? Number(item.CATEGORY.trim()) : undefined;

        const doc: Record<string, unknown> = {
          no: String(partNumber),
          name: decodeHtmlEntities(String(name)),
          type,

          lastFetched: oneYearAgo,
          createdAt: oneYearAgo,
        };

        // Add optional fields if present
        if (categoryId) doc.categoryId = categoryId;
        if (item.ALTERNATE) doc.alternateNo = String(item.ALTERNATE.trim());
        if (item.IMAGEURL) doc.imageUrl = String(item.IMAGEURL.trim());
        if (item.THUMBNAILURL) doc.thumbnailUrl = String(item.THUMBNAILURL.trim());
        if (item.WEIGHT) doc.weight = Number(item.WEIGHT.trim());
        if (item.DIMX) doc.dimX = String(item.DIMX.trim());
        if (item.DIMY) doc.dimY = String(item.DIMY.trim());
        if (item.DIMZ) doc.dimZ = String(item.DIMZ.trim());
        if (item.YEAR) doc.yearReleased = Number(item.YEAR.trim());
        if (item.DESCRIPTION) doc.description = decodeHtmlEntities(String(item.DESCRIPTION.trim()));
        if (item.ISOBSOLETE) doc.isObsolete = item.ISOBSOLETE.trim().toLowerCase() === "true";

        const line = `${JSON.stringify(doc)}\n`;
        if (!out.write(line)) await new Promise((r) => out.once("drain", r));
        sampleCount++;
      });
      await new Promise<void>((resolve) => out.end(resolve));
      logProgress("Parts sample JSONL", sampleCount, "complete");
    } catch {
      log(
        `${colors.yellow}⚠${colors.reset} Skipping parts sample - ${colors.dim}Parts.xml not found${colors.reset}`,
      );
    }
  }

  console.log();
  log(`${colors.green}${colors.bright}✨ JSONL conversion complete!${colors.reset}`);
  console.log();
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
