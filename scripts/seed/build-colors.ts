#!/usr/bin/env ts-node

/**
 * Color Catalog Builder for Convex Import
 *
 * This script merges color data from Bricklink (XML) and Rebrickable (JSON) sources
 * and writes importable JSONL files under data/seed/ that match our Convex schema.
 *
 * It DOES NOT contact Convex or import data. Use `npx convex import --table colors <jsonl>`
 * separately to load the generated JSONL files.
 *
 * Schema Alignment:
 * - colorId: Bricklink color ID (primary)
 * - colorName: Bricklink color name
 * - colorCode: Bricklink RGB hex code
 * - colorType: Bricklink color type
 * - brickowlColorId: BrickOwl color ID (from Rebrickable mapping)
 *
 * Matching Strategy:
 * - Match by Bricklink ID from Rebrickable's external_ids.BrickLink.ext_ids array
 * - If no match found, brickowlColorId remains undefined
 *
 * Safety & Performance:
 * - Streaming SAX parser for XML (low memory)
 * - JSON file loaded into memory for lookup (acceptable for color data)
 */

import { createReadStream, createWriteStream, constants } from "node:fs";
import { mkdir, access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sax from "sax";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { decode } from "he";

// Types for Rebrickable color data
interface RebrickableColor {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
  external_ids?: {
    BrickLink?: {
      ext_ids: number[];
      ext_descrs: string[][];
    };
    BrickOwl?: {
      ext_ids: number[];
      ext_descrs: string[][];
    };
  };
}

interface RebrickableColorsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickableColor[];
}

const RAW_BRICKLINK_DIR = join(process.cwd(), "data", "raw", "bricklink");
const RAW_REBRICKABLE_DIR = join(process.cwd(), "data", "raw", "rebrickable");
const SEED_DIR = join(process.cwd(), "data", "seed");

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
  console.log(`${colors.cyan}${colors.bright}[colors]${colors.reset}`, ...args);

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

/**
 * Load Rebrickable colors and build a lookup map by Bricklink color ID
 * Returns a Map<bricklinkColorId, brickowlColorId>
 */
const buildRebrickableLookup = async (
  filePath: string,
): Promise<Map<number, number>> => {
  log(
    `${colors.blue}→${colors.reset} Loading Rebrickable colors ${colors.dim}→${colors.reset} ${colors.dim}${filePath}${colors.reset}`,
  );

  const fileContent = await readFile(filePath, "utf8");
  const data: RebrickableColorsResponse = JSON.parse(fileContent);

  const lookup = new Map<number, number>();

  for (const color of data.results) {
    // Check if this color has Bricklink IDs
    const bricklinkIds = color.external_ids?.BrickLink?.ext_ids;
    const brickowlIds = color.external_ids?.BrickOwl?.ext_ids;

    if (bricklinkIds && brickowlIds && brickowlIds.length > 0) {
      // Map each Bricklink ID to the first BrickOwl ID
      const brickowlId = brickowlIds[0];
      for (const bricklinkId of bricklinkIds) {
        if (bricklinkId !== null && brickowlId !== null) {
          lookup.set(bricklinkId, brickowlId);
        }
      }
    }
  }

  logProgress("Rebrickable lookup", lookup.size, "mappings");
  return lookup;
};

export const main = async () => {
  await yargs(hideBin(process.argv)).help().parse();

  // Set timestamp to one year ago so seeded data is treated as stale and triggers fresh API fetches
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  // Ensure output directory exists
  await mkdir(SEED_DIR, { recursive: true });

  // Load Rebrickable colors for BrickOwl ID lookup
  const rebrickablePath = join(RAW_REBRICKABLE_DIR, "colors.json");
  let rebrickableLookup: Map<number, number>;
  try {
    await access(rebrickablePath, constants.F_OK);
    rebrickableLookup = await buildRebrickableLookup(rebrickablePath);
  } catch {
    log(
      `${colors.yellow}⚠${colors.reset} Rebrickable colors not found, continuing without BrickOwl IDs ${colors.dim}→${colors.reset} ${colors.dim}${rebrickablePath}${colors.reset}`,
    );
    rebrickableLookup = new Map();
  }

  // Process Bricklink colors XML
  const bricklinkPath = join(RAW_BRICKLINK_DIR, "colors.xml");
  const outPath = join(SEED_DIR, "colors.jsonl");

  try {
    await access(bricklinkPath, constants.F_OK);
    log(
      `${colors.blue}→${colors.reset} Writing colors JSONL ${colors.dim}→${colors.reset} ${colors.dim}${outPath}${colors.reset}`,
    );
    const out = createWriteStream(outPath, { encoding: "utf8" });

    let colorCount = 0;
    let matchedCount = 0;

    await parseXmlStream(bricklinkPath, async (item) => {
      const colorId = Number(item.COLOR);
      const colorName = item.COLORNAME?.trim();
      if (!colorId || !colorName) return;

      const colorType = item.COLORTYPE?.trim();
      const colorCode = item.COLORRGB?.trim() || undefined;

      const doc: Record<string, unknown> = {
        colorId,
        colorName: decodeHtmlEntities(String(colorName)),
        lastFetched: oneYearAgo,
        createdAt: oneYearAgo,
      };

      if (colorCode) doc.colorCode = String(colorCode);
      if (colorType) doc.colorType = String(colorType);

      // Look up BrickOwl color ID from Rebrickable mapping
      const brickowlColorId = rebrickableLookup.get(colorId);
      if (brickowlColorId !== undefined) {
        doc.brickowlColorId = brickowlColorId;
        matchedCount++;
      }

      const line = `${JSON.stringify(doc)}\n`;
      if (!out.write(line)) await new Promise((r) => out.once("drain", r));
      colorCount++;
    });

    await new Promise<void>((resolve) => out.end(resolve));
    logProgress("Colors JSONL", colorCount, "complete");
    if (rebrickableLookup.size > 0) {
      log(
        `${colors.green}✓${colors.reset} Matched ${colors.yellow}${matchedCount}${colors.reset} colors with BrickOwl IDs`,
      );
    }
  } catch {
    log(
      `${colors.yellow}⚠${colors.reset} Skipping colors - ${colors.dim}colors.xml not found${colors.reset}`,
    );
  }

  console.log();
  log(`${colors.green}${colors.bright}✨ Color JSONL conversion complete!${colors.reset}`);
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
    console.error("Color seeding failed", error);
    process.exit(1);
  });
}

