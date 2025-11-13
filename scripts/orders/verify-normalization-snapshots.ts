import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  bricklinkOrderFixture,
  bricklinkOrderItemsFixture,
  brickowlOrderFixture,
  brickowlOrderItemsFixture,
} from "../../convex/orders/refactor_baseline/fixtures";
import { normalizeOrder, normalizeOrderItems } from "../../convex/orders/normalizers";

async function readSnapshot(fileName: string) {
  const snapshotPath = path.resolve(
    process.cwd(),
    "convex/orders/refactor_baseline/snapshots",
    fileName,
  );
  const data = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(data) as unknown;
}

async function main() {
  const bricklinkOrderSnapshot = await readSnapshot("bricklink.order.normalized.json");
  const bricklinkItemsSnapshot = await readSnapshot("bricklink.items.normalized.json");
  const brickowlOrderSnapshot = await readSnapshot("brickowl.order.normalized.json");
  const brickowlItemsSnapshot = await readSnapshot("brickowl.items.normalized.json");

  const normalizedBricklinkOrderRaw = normalizeOrder("bricklink", bricklinkOrderFixture);
  const normalizedBricklinkOrder = JSON.parse(JSON.stringify(normalizedBricklinkOrderRaw));
  const normalizedBricklinkItems = JSON.parse(
    JSON.stringify(
      normalizeOrderItems(
        "bricklink",
        normalizedBricklinkOrderRaw.orderId,
        bricklinkOrderItemsFixture,
      ),
    ),
  );

  const normalizedBrickowlOrderRaw = normalizeOrder("brickowl", brickowlOrderFixture);
  const normalizedBrickowlOrder = JSON.parse(JSON.stringify(normalizedBrickowlOrderRaw));
  const normalizedBrickowlItems = JSON.parse(
    JSON.stringify(
      normalizeOrderItems("brickowl", normalizedBrickowlOrderRaw.orderId, brickowlOrderItemsFixture),
    ),
  );

  assert.deepStrictEqual(normalizedBricklinkOrder, bricklinkOrderSnapshot);
  assert.deepStrictEqual(normalizedBricklinkItems, bricklinkItemsSnapshot);
  assert.deepStrictEqual(normalizedBrickowlOrder, brickowlOrderSnapshot);
  assert.deepStrictEqual(normalizedBrickowlItems, brickowlItemsSnapshot);

  // eslint-disable-next-line no-console
  console.log("Normalization outputs match baseline snapshots.");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Snapshot verification failed", error);
  process.exitCode = 1;
});
