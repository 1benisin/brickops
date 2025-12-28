/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, afterEach } from "vitest";
import { isColorComplete } from "@/convex/catalog/helpers";
import { buildSeedData, createConvexTestContext, createTestIdentity } from "@/test-utils/convex-test-context";
import * as userAuthorization from "@/convex/users/authorization";

/**
 * Tests for inventory lifecycle status with global color checking.
 *
 * The lifecycle status should be "awaiting_catalog" if:
 * 1. Part status is not "complete", OR
 * 2. The color's global entry doesn't exist or lacks BrickOwl mapping
 */
describe("inventory: lifecycle status with color checking", () => {
  const businessAccountId = "businessAccounts:1";
  const userId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId: userId,
        inviteCode: "abc12345",
        createdAt: Date.now(),
      },
    ],
    users: [
      {
        _id: userId,
        businessAccountId,
        email: "test@example.com",
        role: "owner",
        firstName: "Test",
        lastName: "User",
        name: "Test User",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    marketplaceCredentials: [],
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isColorComplete helper", () => {
    it("returns false when color is null (not found)", () => {
      expect(isColorComplete(null)).toBe(false);
    });

    it("returns false when brickowlColorId is undefined", () => {
      expect(
        isColorComplete({
          lastFetched: Date.now(),
          brickowlColorId: undefined,
        }),
      ).toBe(false);
    });

    it("returns true when brickowlColorId is null (checked but not found)", () => {
      expect(
        isColorComplete({
          lastFetched: Date.now(),
          brickowlColorId: null,
        }),
      ).toBe(true);
    });

    it("returns true when brickowlColorId is a number", () => {
      expect(
        isColorComplete({
          lastFetched: Date.now(),
          brickowlColorId: 38,
        }),
      ).toBe(true);
    });
  });

  describe("promoteItemsForPart with color checking", () => {
    it("logs skip message when color is not complete", async () => {
      const { promoteItemsForPart } = await import("@/convex/inventory/mutations");

      const seed = {
        ...baseSeed,
        parts: [
          {
            _id: "parts:1",
            no: "3001",
            name: "Brick 2x4",
            type: "PART",
            status: "complete",
            lastFetched: Date.now(),
          },
        ],
        inventoryItems: [
          {
            _id: "inventoryItems:1",
            businessAccountId,
            name: "Test Item",
            partNumber: "3001",
            colorId: "11", // Color without BrickOwl mapping
            location: "A1",
            quantityAvailable: 10,
            quantityReserved: 0,
            condition: "new",
            createdBy: userId,
            lifecycleStatus: "awaiting_catalog",
            marketplaceSync: {
              bricklink: { status: "pending", lastSyncAttempt: Date.now() },
              brickowl: { status: "pending", lastSyncAttempt: Date.now() },
            },
          },
        ],
        colors: [
          {
            _id: "colors:11",
            colorId: 11,
            colorName: "Black",
            lastFetched: Date.now(),
            // brickowlColorId is undefined - color not complete
          },
        ],
        inventoryQuantityLedger: [],
        marketplaceOutbox: [],
        marketplaceCredentials: [],
      };

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${userId}|session-001` }),
      });

      // Mock requireActiveUser for internal mutation
      vi.spyOn(userAuthorization, "requireActiveUser").mockResolvedValue({
        userId: seed.users[0]._id,
        user: seed.users[0] as any,
        businessAccountId,
      } as any);

      // Spy on console.log to verify the skip message
      const consoleSpy = vi.spyOn(console, "log");

      await (promoteItemsForPart as any)._handler(ctx, { partNumber: "3001" });

      // Should log skip message with color not complete
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Promotion] Skipping item inventoryItems:1 - color 11 not complete yet",
      );
    });

    it("skips items with missing global color entry", async () => {
      const { promoteItemsForPart } = await import("@/convex/inventory/mutations");

      const seed = {
        ...baseSeed,
        parts: [
          {
            _id: "parts:1",
            no: "3001",
            name: "Brick 2x4",
            type: "PART",
            status: "complete",
            lastFetched: Date.now(),
          },
        ],
        inventoryItems: [
          {
            _id: "inventoryItems:1",
            businessAccountId,
            name: "Test Item - Color not in colors table",
            partNumber: "3001",
            colorId: "99", // Color doesn't exist in colors table
            location: "A1",
            quantityAvailable: 10,
            quantityReserved: 0,
            condition: "new",
            createdBy: userId,
            lifecycleStatus: "awaiting_catalog",
            marketplaceSync: {
              bricklink: { status: "pending", lastSyncAttempt: Date.now() },
              brickowl: { status: "pending", lastSyncAttempt: Date.now() },
            },
          },
        ],
        colors: [], // No colors in table
        inventoryQuantityLedger: [],
        marketplaceOutbox: [],
        marketplaceCredentials: [],
      };

      const ctx = createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${userId}|session-001` }),
      });

      // Mock requireActiveUser for internal mutation
      vi.spyOn(userAuthorization, "requireActiveUser").mockResolvedValue({
        userId: seed.users[0]._id,
        user: seed.users[0] as any,
        businessAccountId,
      } as any);

      // Spy on console.log
      const consoleSpy = vi.spyOn(console, "log");

      await (promoteItemsForPart as any)._handler(ctx, { partNumber: "3001" });

      // Should log skip message for color 99 (missing from colors table)
      const skipCalls = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes("Skipping item"),
      );

      expect(skipCalls).toHaveLength(1);
      expect(skipCalls[0][0]).toContain("color 99 not complete");
    });
  });
});

