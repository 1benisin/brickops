/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPart, getPartColors, getPriceGuide } from "@/convex/catalog/queries";
import { createConvexTestContext } from "@/test-utils/convex-test-context";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_NOW = new Date("2024-06-15T12:00:00.000Z").valueOf();

describe("catalog status queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getPart", () => {
    it("returns missing status when the part is absent", async () => {
      const ctx = createConvexTestContext();

      const result = await (getPart as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("missing");
      expect(result.data).toBeNull();
    });

    it("returns fresh status with category name when recently fetched", async () => {
      const fetchedAt = BASE_NOW - 5 * DAY_MS;
      const seed = {
        parts: [
          {
            _id: "parts:1",
            no: "3001",
            name: "Brick 2 x 4",
            type: "PART" as const,
            categoryId: 1,
            alternateNo: undefined,
            imageUrl: "https://cdn.example.com/3001.png",
            thumbnailUrl: "https://cdn.example.com/3001-thumb.png",
            weight: 2.5,
            dimX: "2",
            dimY: "4",
            dimZ: "1",
            yearReleased: 1970,
            description: "Classic brick",
            isObsolete: false,
            brickowlId: "bo-3001",
            ldrawId: "ldraw-3001",
            legoId: "lego-3001",
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        categories: [
          {
            _id: "categories:1",
            categoryId: 1,
            categoryName: "Bricks",
            parentId: null,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPart as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("fresh");
      expect(result.data?.categoryName).toBe("Bricks");
      expect(result.data?.partNumber).toBe("3001");
    });

    it("marks the part as stale when last fetched more than 30 days ago", async () => {
      const staleFetchedAt = BASE_NOW - 31 * DAY_MS;
      const seed = {
        parts: [
          {
            _id: "parts:1",
            no: "3001",
            name: "Brick 2 x 4",
            type: "PART" as const,
            lastFetched: staleFetchedAt,
            createdAt: staleFetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPart as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("stale");
      expect(result.data?.lastFetched).toBe(staleFetchedAt);
    });

    it("prefers refreshing status when an outbox message is pending", async () => {
      const fetchedAt = BASE_NOW - 10 * DAY_MS;
      const seed = {
        parts: [
          {
            _id: "parts:1",
            no: "3001",
            name: "Brick 2 x 4",
            type: "PART" as const,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        catalogRefreshOutbox: [
          {
            _id: "catalogRefreshOutbox:1",
            tableName: "parts" as const,
            primaryKey: "3001",
            secondaryKey: null,
            recordId: "3001",
            priority: 1,
            status: "pending" as const,
            attempt: 0,
            nextAttemptAt: BASE_NOW + DAY_MS,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPart as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("refreshing");
    });
  });

  describe("getPartColors", () => {
    it("returns missing status with an empty array when no colors exist", async () => {
      const ctx = createConvexTestContext();

      const result = await (getPartColors as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("missing");
      expect(result.data).toEqual([]);
    });

    it("returns fresh status and maps color metadata", async () => {
      const fetchedAt = BASE_NOW - 3 * DAY_MS;
      const seed = {
        partColors: [
          {
            _id: "partColors:1",
            partNo: "3001",
            colorId: 21,
            quantity: 100,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
          {
            _id: "partColors:2",
            partNo: "3001",
            colorId: 0,
            quantity: 0,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        colors: [
          {
            _id: "colors:1",
            colorId: 21,
            colorName: "Bright Red",
            colorCode: "#ff0000",
            colorType: "Solid" as const,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPartColors as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("fresh");
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            colorId: 21,
            name: "Bright Red",
            hexCode: "#ff0000",
            type: "Solid",
          }),
          expect.objectContaining({
            colorId: 0,
            name: "(Not Applicable)",
            hexCode: "#ffffff",
            type: "Not Applicable",
          }),
        ]),
      );
    });

    it("flags color data as stale when any record is older than 30 days", async () => {
      const freshFetchedAt = BASE_NOW - 5 * DAY_MS;
      const staleFetchedAt = BASE_NOW - 34 * DAY_MS;
      const seed = {
        partColors: [
          {
            _id: "partColors:1",
            partNo: "3001",
            colorId: 21,
            quantity: 100,
            lastFetched: freshFetchedAt,
            createdAt: freshFetchedAt,
          },
          {
            _id: "partColors:2",
            partNo: "3001",
            colorId: 22,
            quantity: 50,
            lastFetched: staleFetchedAt,
            createdAt: staleFetchedAt,
          },
        ],
        colors: [
          {
            _id: "colors:1",
            colorId: 21,
            colorName: "Bright Red",
            colorCode: "#ff0000",
            colorType: "Solid" as const,
            lastFetched: freshFetchedAt,
            createdAt: freshFetchedAt,
          },
          {
            _id: "colors:2",
            colorId: 22,
            colorName: "Bright Blue",
            colorCode: "#0000ff",
            colorType: "Solid" as const,
            lastFetched: staleFetchedAt,
            createdAt: staleFetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPartColors as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("stale");
    });

    it("returns refreshing status when a refresh outbox job exists", async () => {
      const fetchedAt = BASE_NOW - 4 * DAY_MS;
      const seed = {
        partColors: [
          {
            _id: "partColors:1",
            partNo: "3001",
            colorId: 21,
            quantity: 100,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        colors: [
          {
            _id: "colors:1",
            colorId: 21,
            colorName: "Bright Red",
            colorCode: "#ff0000",
            colorType: "Solid" as const,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        catalogRefreshOutbox: [
          {
            _id: "catalogRefreshOutbox:1",
            tableName: "partColors" as const,
            primaryKey: "3001",
            secondaryKey: null,
            recordId: "3001",
            priority: 1,
            status: "pending" as const,
            attempt: 0,
            nextAttemptAt: BASE_NOW + DAY_MS,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPartColors as any)._handler(ctx, { partNumber: "3001" });

      expect(result.status).toBe("refreshing");
    });
  });

  describe("getPriceGuide", () => {
    it("returns missing when no pricing records exist", async () => {
      const ctx = createConvexTestContext();

      const result = await (getPriceGuide as any)._handler(ctx, {
        partNumber: "3001",
        colorId: 21,
      });

      expect(result.status).toBe("missing");
      expect(result.data).toBeNull();
    });

    it("returns fresh pricing data across all variants", async () => {
      const fetchedAt = BASE_NOW - 2 * DAY_MS;
      const seed = {
        partPrices: [
          {
            _id: "partPrices:1",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "N" as const,
            guideType: "stock" as const,
            currencyCode: "USD",
            minPrice: 1.0,
            maxPrice: 5.0,
            avgPrice: 2.5,
            qtyAvgPrice: 2.2,
            unitQuantity: 10,
            totalQuantity: 100,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
          {
            _id: "partPrices:2",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "N" as const,
            guideType: "sold" as const,
            currencyCode: "USD",
            minPrice: 1.1,
            maxPrice: 5.5,
            avgPrice: 2.8,
            qtyAvgPrice: 2.4,
            unitQuantity: 8,
            totalQuantity: 80,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
          {
            _id: "partPrices:3",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "U" as const,
            guideType: "stock" as const,
            currencyCode: "USD",
            minPrice: 0.5,
            maxPrice: 3.5,
            avgPrice: 1.6,
            qtyAvgPrice: 1.4,
            unitQuantity: 15,
            totalQuantity: 150,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
          {
            _id: "partPrices:4",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "U" as const,
            guideType: "sold" as const,
            currencyCode: "USD",
            minPrice: 0.7,
            maxPrice: 4.2,
            avgPrice: 1.9,
            qtyAvgPrice: 1.7,
            unitQuantity: 12,
            totalQuantity: 120,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPriceGuide as any)._handler(ctx, {
        partNumber: "3001",
        colorId: 21,
      });

      expect(result.status).toBe("fresh");
      expect(result.data?.newStock?.avgPrice).toBe(2.5);
      expect(result.data?.newSold?.avgPrice).toBe(2.8);
      expect(result.data?.usedStock?.avgPrice).toBe(1.6);
      expect(result.data?.usedSold?.avgPrice).toBe(1.9);
    });

    it("marks pricing as stale when any record is outside the 30-day window", async () => {
      const freshFetchedAt = BASE_NOW - 3 * DAY_MS;
      const staleFetchedAt = BASE_NOW - 45 * DAY_MS;
      const seed = {
        partPrices: [
          {
            _id: "partPrices:1",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "N" as const,
            guideType: "stock" as const,
            currencyCode: "USD",
            minPrice: 1.0,
            maxPrice: 5.0,
            avgPrice: 2.5,
            qtyAvgPrice: 2.2,
            unitQuantity: 10,
            totalQuantity: 100,
            lastFetched: staleFetchedAt,
            createdAt: staleFetchedAt,
          },
          {
            _id: "partPrices:2",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "N" as const,
            guideType: "sold" as const,
            currencyCode: "USD",
            minPrice: 1.1,
            maxPrice: 5.5,
            avgPrice: 2.8,
            qtyAvgPrice: 2.4,
            unitQuantity: 8,
            totalQuantity: 80,
            lastFetched: freshFetchedAt,
            createdAt: freshFetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPriceGuide as any)._handler(ctx, {
        partNumber: "3001",
        colorId: 21,
      });

      expect(result.status).toBe("stale");
    });

    it("returns refreshing status when an outbox entry exists for the price guide", async () => {
      const fetchedAt = BASE_NOW - 6 * DAY_MS;
      const seed = {
        partPrices: [
          {
            _id: "partPrices:1",
            partNo: "3001",
            partType: "PART" as const,
            colorId: 21,
            newOrUsed: "N" as const,
            guideType: "stock" as const,
            currencyCode: "USD",
            minPrice: 1.0,
            maxPrice: 5.0,
            avgPrice: 2.5,
            qtyAvgPrice: 2.2,
            unitQuantity: 10,
            totalQuantity: 100,
            lastFetched: fetchedAt,
            createdAt: fetchedAt,
          },
        ],
        catalogRefreshOutbox: [
          {
            _id: "catalogRefreshOutbox:1",
            tableName: "partPrices" as const,
            primaryKey: "3001",
            secondaryKey: "21",
            recordId: "3001:21",
            priority: 1,
            status: "pending" as const,
            attempt: 0,
            nextAttemptAt: BASE_NOW + DAY_MS,
            createdAt: fetchedAt,
          },
        ],
      } as any;
      const ctx = createConvexTestContext({ seed });

      const result = await (getPriceGuide as any)._handler(ctx, {
        partNumber: "3001",
        colorId: 21,
      });

      expect(result.status).toBe("refreshing");
    });
  });
});
