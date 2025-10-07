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
 * Safety & Performance:
 * - Streaming SAX parser (low memory)
 * - Record limit per file via --limit (default 100) to avoid huge outputs during testing
 * - Minimal required fields per table; complex fields (arrays/objects) are flattened/omitted
 */

import { createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sax from "sax";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Types intentionally minimal; conversion writes JSONL files directly

const DATA_DIR = join(process.cwd(), "docs", "external-documentation", "bricklink-data");

const DEFAULT_LIMIT = 100; // max rows to emit per JSONL file; configurable via --limit

const log = (...args: unknown[]) => console.log(`[seed]`, ...args);
const logProgress = (category: string, current: number, total: number | string) => {
  if (typeof total === "number" && total > 0) {
    const percent = ((current / total) * 100).toFixed(1);
    log(`${category}: ${current.toLocaleString()}/${total.toLocaleString()} (${percent}%)`);
  } else {
    log(`${category}: ${current.toLocaleString()} processed`);
  }
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
    .help()
    .parse();

  const limit = Math.max(0, argv.limit ?? DEFAULT_LIMIT);
  const now = Date.now();

  // 1) Colors → bricklinkColorReference.jsonl
  {
    const colorPath = join(DATA_DIR, "colors.xml");
    const outPath = join(DATA_DIR, "bricklinkColorReference.jsonl");
    log(`Writing colors JSONL → ${outPath}`);
    const out = createWriteStream(outPath, { encoding: "utf8" });

    let colorCount = 0;

    await parseXmlStream(colorPath, async (item) => {
      const id = Number(item.COLOR);
      const name = item.COLORNAME?.trim();
      if (!id || !name) return;

      const colorType = item.COLORTYPE?.trim();
      const rgb = item.COLORRGB?.trim() || undefined;

      const doc: Record<string, unknown> = {
        bricklinkColorId: id,
        name: String(name),
        syncedAt: now,
        createdAt: now,
      };
      if (rgb) doc.rgb = String(rgb);
      if (colorType) doc.colorType = String(colorType);
      // Optional: isTransparent derived
      if (colorType) doc.isTransparent = /trans/i.test(colorType);

      const line = `${JSON.stringify(doc)}\n`;
      if (!out.write(line)) await new Promise((r) => out.once("drain", r));
      colorCount++;
      if (limit && colorCount >= limit) return;
    });
    await new Promise<void>((resolve) => out.end(resolve));
    logProgress("Colors JSONL", colorCount, "complete");
  }

  // 2) Categories → bricklinkCategoryReference.jsonl (preserve string types)
  {
    const categoryXmlPath = join(DATA_DIR, "categories.xml");
    const categoryJsonlPath = join(DATA_DIR, "bricklinkCategoryReference.jsonl");
    log(`Writing categories JSONL → ${categoryJsonlPath}`);
    const out = createWriteStream(categoryJsonlPath, { encoding: "utf8" });

    let categoryCount = 0;
    await parseXmlStream(categoryXmlPath, async (item) => {
      const id = Number(item.CATEGORY);
      const name = item.CATEGORYNAME?.trim();
      if (!id || !name) return;
      const doc = {
        bricklinkCategoryId: id,
        name: String(name),
        syncedAt: now,
        createdAt: now,
      };
      const line = `${JSON.stringify(doc)}\n`;
      if (!out.write(line)) await new Promise((r) => out.once("drain", r));
      categoryCount++;
      if (limit && categoryCount >= limit) return;
    });
    await new Promise<void>((resolve) => out.end(resolve));
    logProgress("Categories JSONL", categoryCount, "complete");
  }

  // 3) Codes → element and availability JSONL files
  {
    const codesPath = join(DATA_DIR, "codes.xml");
    const availabilityJsonl = join(DATA_DIR, "bricklinkPartColorAvailability.jsonl");
    const elementJsonl = join(DATA_DIR, "bricklinkElementReference.jsonl");
    log(`Writing codes JSONL → ${availabilityJsonl}, ${elementJsonl}`);
    const outAvail = createWriteStream(availabilityJsonl, { encoding: "utf8" });
    const outElem = createWriteStream(elementJsonl, { encoding: "utf8" });

    // For mapping color names to IDs quickly, build a small map from colors.csv just written would be best,
    // but to avoid reading full large files, we will map "(Not Applicable)" → 0 and skip unknown names.
    // NOTE: For now we only map "(Not Applicable)" → 0. Unknown colors are skipped.

    let availCount = 0;
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

      const availDoc = {
        partNumber: String(partNumber),
        bricklinkPartId: String(partNumber),
        colorId,
        elementIds: [String(elementId)],
        isLegacy: false,
        syncedAt: now,
      };
      const elemDoc = {
        elementId: String(elementId),
        partNumber: String(partNumber),
        colorId,
        bricklinkPartId: String(partNumber),
        syncedAt: now,
      };
      if (!outAvail.write(`${JSON.stringify(availDoc)}\n`))
        await new Promise((r) => outAvail.once("drain", r));
      if (!outElem.write(`${JSON.stringify(elemDoc)}\n`))
        await new Promise((r) => outElem.once("drain", r));
      availCount++;
      elemCount++;
      if (limit && (availCount >= limit || elemCount >= limit)) return;
    });
    await new Promise<void>((resolve) => outAvail.end(resolve));
    await new Promise<void>((resolve) => outElem.end(resolve));
    logProgress("Part-color availability JSONL", availCount, "complete");
    logProgress("Element references JSONL", elemCount, "complete");
  }

  // 4) Parts → parts.jsonl (minimal required fields for schema alignment)
  {
    const partsPath = join(DATA_DIR, "Parts.xml");
    const partsJsonl = join(DATA_DIR, "parts.jsonl");
    log(`Writing parts JSONL → ${partsJsonl}`);
    const out = createWriteStream(partsJsonl, { encoding: "utf8" });

    let partCount = 0;
    await parseXmlStream(partsPath, async (item) => {
      const itemType = item.ITEMTYPE?.trim();
      const partNumber = item.ITEMID?.trim();
      const name = item.ITEMNAME?.trim();
      if (itemType !== "P" || !partNumber || !name) return;
      const categoryId = item.CATEGORY?.trim() ? Number(item.CATEGORY.trim()) : undefined;
      const keywords = `${partNumber} ${name}`.toLowerCase();
      const doc: Record<string, unknown> = {
        partNumber: String(partNumber),
        name: String(name),
        bricklinkPartId: String(partNumber),
        bricklinkCategoryId: categoryId,
        searchKeywords: String(keywords),
        dataSource: "manual",
        dataFreshness: "fresh",
        lastUpdated: now,
        createdAt: now,
      };
      const line = `${JSON.stringify(doc)}\n`;
      if (!out.write(line)) await new Promise((r) => out.once("drain", r));
      partCount++;
      if (limit && partCount >= limit) return;
    });
    await new Promise<void>((resolve) => out.end(resolve));
    logProgress("Parts JSONL", partCount, "complete");
  }

  log("JSONL conversion complete.");
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
