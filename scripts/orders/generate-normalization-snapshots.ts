import { promises as fs } from "node:fs";
import path from "node:path";

import {
  bricklinkOrderFixture,
  bricklinkOrderItemsFixture,
  brickowlOrderFixture,
  brickowlOrderItemsFixture,
} from "../../convex/orders/refactor_baseline/fixtures";
import {
  normalizeOrder,
  normalizeOrderItems,
} from "../../convex/orders/normalizers";

const projectRoot = path.resolve(process.cwd());
const baselineRoot = path.resolve(projectRoot, "convex/orders/refactor_baseline");
const rawDir = path.join(baselineRoot, "raw-fixtures");
const snapshotDir = path.join(baselineRoot, "snapshots");

async function writeJson(filePath: string, value: unknown) {
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, data, "utf8");
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(snapshotDir, { recursive: true });

  const bricklinkNormalizedOrder = normalizeOrder("bricklink", bricklinkOrderFixture);
  const bricklinkNormalizedItems = normalizeOrderItems(
    "bricklink",
    bricklinkNormalizedOrder.orderId,
    bricklinkOrderItemsFixture,
  );

  const brickowlNormalizedOrder = normalizeOrder("brickowl", brickowlOrderFixture);
  const brickowlNormalizedItems = normalizeOrderItems(
    "brickowl",
    brickowlNormalizedOrder.orderId,
    brickowlOrderItemsFixture,
  );

  await Promise.all([
    writeJson(path.join(rawDir, "bricklink.order.json"), bricklinkOrderFixture),
    writeJson(path.join(rawDir, "bricklink.items.json"), bricklinkOrderItemsFixture),
    writeJson(path.join(rawDir, "brickowl.order.json"), brickowlOrderFixture),
    writeJson(path.join(rawDir, "brickowl.items.json"), brickowlOrderItemsFixture),
    writeJson(path.join(snapshotDir, "bricklink.order.normalized.json"), bricklinkNormalizedOrder),
    writeJson(path.join(snapshotDir, "bricklink.items.normalized.json"), bricklinkNormalizedItems),
    writeJson(path.join(snapshotDir, "brickowl.order.normalized.json"), brickowlNormalizedOrder),
    writeJson(path.join(snapshotDir, "brickowl.items.normalized.json"), brickowlNormalizedItems),
  ]);

  const summary = {
    rawFixtures: rawDir,
    snapshots: snapshotDir,
    generatedAt: new Date().toISOString(),
  };

  await writeJson(path.join(baselineRoot, "snapshot-manifest.json"), summary);

  // eslint-disable-next-line no-console
  console.log(`Wrote normalization snapshots to ${snapshotDir}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
