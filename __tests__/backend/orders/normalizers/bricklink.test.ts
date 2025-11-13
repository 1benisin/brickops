import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  normalizeBrickLinkOrder,
  normalizeBrickLinkOrderItems,
} from "@/convex/marketplaces/bricklink/orders/transformers";
import {
  bricklinkOrderFixture,
  bricklinkOrderItemsFixture,
} from "@/convex/orders/refactor_baseline/fixtures";
import bricklinkItemsSnapshot from "@/convex/orders/refactor_baseline/snapshots/bricklink.items.normalized.json";
import bricklinkOrderSnapshot from "@/convex/orders/refactor_baseline/snapshots/bricklink.order.normalized.json";
import {
  NORMALIZATION_ERROR_CODES,
  isNormalizationError,
} from "@/convex/orders/normalizers/shared/errors";

describe("BrickLink normalization transformers", () => {
  it("matches the baseline snapshot for orders", () => {
    const normalized = normalizeBrickLinkOrder(bricklinkOrderFixture);
    expect(normalized).toEqual(bricklinkOrderSnapshot);
  });

  it("matches the baseline snapshot for order items", () => {
    const normalized = normalizeBrickLinkOrderItems(
      bricklinkOrderSnapshot.orderId,
      bricklinkOrderItemsFixture,
    );
    expect(normalized).toEqual(bricklinkItemsSnapshot);
  });

  it("throws a structured error for unsupported statuses", () => {
    const invalidOrderRecord = structuredClone(bricklinkOrderFixture) as Record<string, unknown>;
    invalidOrderRecord.status = "bogus";
    const invalidOrder = invalidOrderRecord as typeof bricklinkOrderFixture;

    expect(() => normalizeBrickLinkOrder(invalidOrder)).toThrowError(ConvexError);

    try {
      normalizeBrickLinkOrder(invalidOrder);
    } catch (error) {
      expect(isNormalizationError(error)).toBe(true);
      if (isNormalizationError(error)) {
        expect(error.data).toMatchObject({
          code: NORMALIZATION_ERROR_CODES.UnsupportedStatus,
          provider: "bricklink",
          field: "status",
          value: "bogus",
        });
      }
    }
  });
});

