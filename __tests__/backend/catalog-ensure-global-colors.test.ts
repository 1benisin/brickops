/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, afterEach } from "vitest";
import { isFresh, isColorComplete } from "@/convex/catalog/helpers";
import { getPartFreshnessStatus, getColorFreshnessStatus } from "@/convex/catalog/ensure";
import { createConvexTestContext, buildSeedData } from "@/test-utils/convex-test-context";

describe("catalog/helpers: isColorComplete", () => {
  it("returns false for null color", () => {
    expect(isColorComplete(null)).toBe(false);
  });

  it("returns false for color with undefined brickowlColorId", () => {
    expect(
      isColorComplete({
        lastFetched: Date.now(),
        brickowlColorId: undefined,
      }),
    ).toBe(false);
  });

  it("returns true for color with null brickowlColorId (checked but not found)", () => {
    expect(
      isColorComplete({
        lastFetched: Date.now(),
        brickowlColorId: null,
      }),
    ).toBe(true);
  });

  it("returns true for color with valid brickowlColorId", () => {
    expect(
      isColorComplete({
        lastFetched: Date.now(),
        brickowlColorId: 123,
      }),
    ).toBe(true);
  });

  it("returns false for stale color with valid brickowlColorId", () => {
    const staleTime = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago
    expect(
      isColorComplete({
        lastFetched: staleTime,
        brickowlColorId: 123,
      }),
    ).toBe(false);
  });
});

describe("catalog/helpers: isFresh", () => {
  it("returns false for undefined timestamp", () => {
    expect(isFresh(undefined)).toBe(false);
  });

  it("returns false for 0 timestamp", () => {
    expect(isFresh(0)).toBe(false);
  });

  it("returns true for recent timestamp", () => {
    expect(isFresh(Date.now())).toBe(true);
  });

  it("returns false for stale timestamp (>30 days)", () => {
    const staleTime = Date.now() - 31 * 24 * 60 * 60 * 1000;
    expect(isFresh(staleTime)).toBe(false);
  });

  it("respects custom threshold", () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const halfHourMs = 30 * 60 * 1000;

    expect(isFresh(oneHourAgo, twoHoursMs)).toBe(true);
    expect(isFresh(oneHourAgo, halfHourMs)).toBe(false);
  });
});

describe("catalog/ensure: getPartFreshnessStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks globalColorsFresh as false when colors table entry is missing", async () => {
    const freshTime = Date.now();
    const seed = buildSeedData({
      parts: [
        {
          _id: "parts:1",
          no: "3001",
          name: "Brick 2x4",
          type: "PART",
          lastFetched: freshTime,
          status: "complete",
        },
      ],
      partColors: [
        {
          _id: "partColors:1",
          partNo: "3001",
          colorId: 11,
          lastFetched: freshTime,
        },
      ],
      colors: [], // No global color entry
      partPrices: [],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getPartFreshnessStatus as any)._handler(ctx, {
      partNumber: "3001",
    });

    expect(result.partFresh).toBe(true);
    expect(result.colorsFresh).toBe(true);
    expect(result.globalColorsFresh).toBe(false);
    expect(result.allFresh).toBe(false);
    expect(result.colorIdsNeedingGlobalColors).toContain(11);
  });

  it("marks globalColorsFresh as false when color entry lacks brickowlColorId", async () => {
    const freshTime = Date.now();
    const seed = buildSeedData({
      parts: [
        {
          _id: "parts:1",
          no: "3001",
          name: "Brick 2x4",
          type: "PART",
          lastFetched: freshTime,
          status: "complete",
        },
      ],
      partColors: [
        {
          _id: "partColors:1",
          partNo: "3001",
          colorId: 11,
          lastFetched: freshTime,
        },
      ],
      colors: [
        {
          _id: "colors:11",
          colorId: 11,
          colorName: "Black",
          lastFetched: freshTime,
          // brickowlColorId is undefined
        },
      ],
      partPrices: [],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getPartFreshnessStatus as any)._handler(ctx, {
      partNumber: "3001",
    });

    expect(result.globalColorsFresh).toBe(false);
    expect(result.colorIdsNeedingGlobalColors).toContain(11);
  });

  it("marks globalColorsFresh as true when color has brickowlColorId (even if null)", async () => {
    const freshTime = Date.now();
    const seed = buildSeedData({
      parts: [
        {
          _id: "parts:1",
          no: "3001",
          name: "Brick 2x4",
          type: "PART",
          lastFetched: freshTime,
          status: "complete",
        },
      ],
      partColors: [
        {
          _id: "partColors:1",
          partNo: "3001",
          colorId: 11,
          lastFetched: freshTime,
        },
      ],
      colors: [
        {
          _id: "colors:11",
          colorId: 11,
          colorName: "Black",
          lastFetched: freshTime,
          brickowlColorId: null, // Checked but not found
        },
      ],
      partPrices: [
        {
          _id: "partPrices:1",
          partNo: "3001",
          colorId: 11,
          newOrUsed: "N",
          guideType: "stock",
          lastFetched: freshTime,
          avgPrice: 0.1,
          minPrice: 0.05,
          maxPrice: 0.2,
          qtyAvgPrice: 0.1,
          unitQuantity: 1,
          totalQuantity: 100,
        },
      ],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getPartFreshnessStatus as any)._handler(ctx, {
      partNumber: "3001",
    });

    expect(result.globalColorsFresh).toBe(true);
    expect(result.colorIdsNeedingGlobalColors).toHaveLength(0);
  });

  it("marks globalColorsFresh as true when color has valid brickowlColorId", async () => {
    const freshTime = Date.now();
    const seed = buildSeedData({
      parts: [
        {
          _id: "parts:1",
          no: "3001",
          name: "Brick 2x4",
          type: "PART",
          lastFetched: freshTime,
          status: "complete",
        },
      ],
      partColors: [
        {
          _id: "partColors:1",
          partNo: "3001",
          colorId: 11,
          lastFetched: freshTime,
        },
      ],
      colors: [
        {
          _id: "colors:11",
          colorId: 11,
          colorName: "Black",
          lastFetched: freshTime,
          brickowlColorId: 38, // Valid BrickOwl color ID
        },
      ],
      partPrices: [
        {
          _id: "partPrices:1",
          partNo: "3001",
          colorId: 11,
          newOrUsed: "N",
          guideType: "stock",
          lastFetched: freshTime,
          avgPrice: 0.1,
          minPrice: 0.05,
          maxPrice: 0.2,
          qtyAvgPrice: 0.1,
          unitQuantity: 1,
          totalQuantity: 100,
        },
      ],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getPartFreshnessStatus as any)._handler(ctx, {
      partNumber: "3001",
    });

    expect(result.globalColorsFresh).toBe(true);
    expect(result.allFresh).toBe(true);
    expect(result.colorIdsNeedingGlobalColors).toHaveLength(0);
  });

  it("skips colorId 0 (Not Applicable) from global color checks", async () => {
    const freshTime = Date.now();
    const seed = buildSeedData({
      parts: [
        {
          _id: "parts:1",
          no: "3001",
          name: "Brick 2x4",
          type: "PART",
          lastFetched: freshTime,
          status: "complete",
        },
      ],
      partColors: [
        {
          _id: "partColors:1",
          partNo: "3001",
          colorId: 0, // Not Applicable
          lastFetched: freshTime,
        },
      ],
      colors: [], // No global color entry for 0 (and shouldn't need one)
      partPrices: [
        {
          _id: "partPrices:1",
          partNo: "3001",
          colorId: 0,
          newOrUsed: "N",
          guideType: "stock",
          lastFetched: freshTime,
          avgPrice: 0.1,
          minPrice: 0.05,
          maxPrice: 0.2,
          qtyAvgPrice: 0.1,
          unitQuantity: 1,
          totalQuantity: 100,
        },
      ],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getPartFreshnessStatus as any)._handler(ctx, {
      partNumber: "3001",
    });

    expect(result.globalColorsFresh).toBe(true);
    expect(result.colorIdsNeedingGlobalColors).toHaveLength(0);
  });
});

describe("catalog/ensure: getColorFreshnessStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns isComplete=true for colorId 0", async () => {
    const seed = buildSeedData({
      colors: [],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getColorFreshnessStatus as any)._handler(ctx, {
      colorId: 0,
    });

    expect(result.isComplete).toBe(true);
    expect(result.color).toBe(null);
  });

  it("returns isComplete=false for missing color", async () => {
    const seed = buildSeedData({
      colors: [],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getColorFreshnessStatus as any)._handler(ctx, {
      colorId: 11,
    });

    expect(result.isComplete).toBe(false);
    expect(result.color).toBe(null);
  });

  it("returns isComplete=false for color without brickowlColorId", async () => {
    const seed = buildSeedData({
      colors: [
        {
          _id: "colors:11",
          colorId: 11,
          colorName: "Black",
          lastFetched: Date.now(),
          // brickowlColorId is undefined
        },
      ],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getColorFreshnessStatus as any)._handler(ctx, {
      colorId: 11,
    });

    expect(result.isComplete).toBe(false);
    expect(result.color).not.toBe(null);
  });

  it("returns isComplete=true for color with brickowlColorId", async () => {
    const seed = buildSeedData({
      colors: [
        {
          _id: "colors:11",
          colorId: 11,
          colorName: "Black",
          lastFetched: Date.now(),
          brickowlColorId: 38,
        },
      ],
    });

    const ctx = createConvexTestContext({ seed });
    const result = await (getColorFreshnessStatus as any)._handler(ctx, {
      colorId: 11,
    });

    expect(result.isComplete).toBe(true);
    expect(result.color).not.toBe(null);
  });
});

