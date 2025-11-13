import { describe, expect, it } from "vitest";

import {
  parseNumberLike,
  parseTimestampLike,
  pickFirstString,
  requireOrderId,
  stringifyAddress,
} from "@/convex/lib/normalization";
import { NORMALIZATION_ERROR_CODES, isNormalizationError } from "@/convex/orders/normalizers/shared/errors";
import { ConvexError } from "convex/values";

describe("normalize helpers", () => {
  it("parses timestamp-like inputs", () => {
    const msValue = 1728743530000;
    const secondValue = 1_728_743_530;
    const isoValue = "2024-10-12T14:32:10.000Z";

    expect(parseTimestampLike(msValue)).toBe(msValue);
    expect(parseTimestampLike(secondValue)).toBe(msValue);
    expect(parseTimestampLike(isoValue)).toBe(msValue);
    expect(parseTimestampLike("invalid")).toBeUndefined();
    expect(parseTimestampLike(undefined)).toBeUndefined();
  });

  it("parses number-like inputs", () => {
    expect(parseNumberLike(12.5)).toBe(12.5);
    expect(parseNumberLike("42")).toBe(42);
    expect(parseNumberLike(" 3.14 ")).toBeCloseTo(3.14);
    expect(parseNumberLike("not-a-number")).toBeUndefined();
    expect(parseNumberLike(null)).toBeUndefined();
  });

  it("returns the first non-empty string candidate", () => {
    expect(pickFirstString(undefined, "", "  ", "abc", "later")).toBe("abc");
    expect(pickFirstString(undefined, 0, 123, "ignored")).toBe("0");
    expect(pickFirstString()).toBeUndefined();
  });

  it("requires an order id", () => {
    expect(requireOrderId(" 123 ")).toBe("123");
    expect(requireOrderId(456)).toBe("456");
    expect(() => requireOrderId(null)).toThrowError(ConvexError);

    try {
      requireOrderId(null);
    } catch (error) {
      expect(isNormalizationError(error)).toBe(true);
      if (isNormalizationError(error)) {
        expect(error.data).toMatchObject({
          code: NORMALIZATION_ERROR_CODES.MissingField,
          field: "orderId",
        });
      }
    }
  });

  it("stringifies address-like objects", () => {
    const value = { line1: "123 Example", city: "Bricktown" };
    expect(stringifyAddress(value)).toBe(JSON.stringify(value));
    expect(stringifyAddress(undefined)).toBeUndefined();

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(stringifyAddress(circular)).toBeUndefined();
  });
});
