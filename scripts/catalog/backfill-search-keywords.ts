#!/usr/bin/env ts-node

/**
 * Backfill searchKeywords for legoPartCatalog
 *
 * What it does:
 * - Iterates all legoPartCatalog documents in batches
 * - Computes searchKeywords = `${partNumber} ${name}` (normalized)
 * - Writes missing/incorrect values back to Convex
 *
 * How to run:
 *   npx tsx scripts/catalog/backfill-search-keywords.ts \
 *     --convexUrl "https://YOUR-DEPLOYMENT.convex.cloud" \
 *     --adminKey "$CONVEX_ADMIN_KEY" \
 *     --batch 500
 *
 * Env alternative:
 *   CONVEX_URL=... CONVEX_ADMIN_KEY=... npx tsx scripts/catalog/backfill-search-keywords.ts
 */

import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";

type AdminCapableConvexClient = ConvexHttpClient & {
  setAdminAuth(token: string, actingAsIdentity?: unknown): void;
};

const createConvexAdminClient = (
  url: string,
  options: { adminKey?: string },
): AdminCapableConvexClient => {
  const client = new ConvexHttpClient(url) as AdminCapableConvexClient;
  if (options.adminKey) client.setAdminAuth(options.adminKey);
  return client;
};

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("convexUrl", {
      type: "string",
      default: process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL,
      describe: "Convex deployment URL",
    })
    .option("adminKey", {
      type: "string",
      default: process.env.CONVEX_ADMIN_KEY,
      describe: "Convex admin key",
    })
    .option("batch", {
      type: "number",
      default: 500,
      describe: "Batch size per mutation",
    })
    .help()
    .parse();

  if (!argv.convexUrl) throw new Error("convexUrl is required");
  if (!argv.adminKey) throw new Error("adminKey is required");

  const convex = createConvexAdminClient(argv.convexUrl, { adminKey: argv.adminKey });

  let cursor: string | undefined = undefined;
  let totalUpdated = 0;
  let page = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page += 1;
    const res: { updated: number; cursor: string | null; isDone: boolean } = await convex.mutation(
      api.functions.scriptOps.backfillCatalogSearchKeywords,
      {
        limit: argv.batch,
        cursor,
      },
    );
    totalUpdated += res.updated;
    cursor = res.cursor ?? undefined;
    // eslint-disable-next-line no-console
    console.log(`[backfill] page ${page}: updated=${res.updated}, done=${res.isDone}`);
    if (res.isDone) break;
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill] completed, total updated=${totalUpdated}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
