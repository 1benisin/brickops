#!/usr/bin/env ts-node

import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DATA_DIR = join(process.cwd(), "docs", "external-documentation", "bricklink-data");
const SOURCE = join(DATA_DIR, "parts.jsonl");
const DEST = join(DATA_DIR, "parts_sample.jsonl");

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("limit", {
      type: "number",
      default: 200,
      describe: "Number of JSONL lines to copy into the sample file",
    })
    .help()
    .parse();

  const limit = Math.max(1, argv.limit ?? 200);

  if (!existsSync(SOURCE)) {
    console.error(
      `Source not found: ${SOURCE}. Run 'pnpm build:imports' to generate parts.jsonl first.`,
    );
    process.exit(1);
  }

  const input = createReadStream(SOURCE, { encoding: "utf8" });
  const output = createWriteStream(DEST, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    output.write(line.trim() + "\n");
    count++;
    if (count >= limit) break;
  }

  await new Promise<void>((resolve) => output.end(resolve));
  console.log(`Wrote ${count} records → ${DEST}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
