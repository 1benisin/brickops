import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import {
  normalizeBrickOwlOrder,
  normalizeBrickOwlOrderItems,
} from "@/convex/marketplaces/brickowl/orders/transformers";
import {
  brickowlOrderFixture,
  brickowlOrderItemsFixture,
} from "@/convex/orders/refactor_baseline/fixtures";
import brickowlItemsSnapshot from "@/convex/orders/refactor_baseline/snapshots/brickowl.items.normalized.json";
import brickowlOrderSnapshot from "@/convex/orders/refactor_baseline/snapshots/brickowl.order.normalized.json";
import {
  NORMALIZATION_ERROR_CODES,
  isNormalizationError,
} from "@/convex/orders/normalizers/shared/errors";

describe("BrickOwl normalization transformers", () => {
  it("matches the baseline snapshot for orders", () => {
    const normalized = normalizeBrickOwlOrder(brickowlOrderFixture);
    expect(normalized).toEqual(brickowlOrderSnapshot);
  });

  it("matches the baseline snapshot for order items", () => {
    const normalized = normalizeBrickOwlOrderItems(
      brickowlOrderSnapshot.orderId,
      brickowlOrderItemsFixture,
    );
    expect(normalized).toEqual(brickowlItemsSnapshot);
  });

  it("throws a structured error when no identifier fields are present", () => {
    const invalidOrderRecord = structuredClone(brickowlOrderFixture) as Record<string, unknown>;
    delete invalidOrderRecord.order_id;
    delete invalidOrderRecord.id;
    delete invalidOrderRecord.orderId;
    delete invalidOrderRecord.orderID;
    delete invalidOrderRecord.uuid;
    const invalidOrder = invalidOrderRecord as typeof brickowlOrderFixture;

    expect(() => normalizeBrickOwlOrder(invalidOrder)).toThrowError(ConvexError);

    try {
      normalizeBrickOwlOrder(invalidOrder);
    } catch (error) {
      expect(isNormalizationError(error)).toBe(true);
      if (isNormalizationError(error)) {
        expect(error.data).toMatchObject({
          code: NORMALIZATION_ERROR_CODES.MissingField,
          provider: "brickowl",
          field: "orderId",
        });
      }
    }
  });
});

