/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import { updateInventoryItem } from "@/convex/inventory/mutations";
import * as inventoryHelpers from "@/convex/inventory/helpers";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("inventory marketplace sync status", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";
  const itemId = "inventoryItems:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "invite-123",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        firstName: "Owner",
        lastName: "User",
        name: "Owner User",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    inventoryItems: [
      {
        _id: itemId,
        businessAccountId,
        name: "Red 2 x 4 Brick",
        partNumber: "3001",
        colorId: "5",
        location: "A-01",
        quantityAvailable: 10,
        quantityReserved: 0,
        condition: "new" as const,
        price: 12.5,
        notes: "Initial sync complete",
        createdBy: ownerUserId,
        createdAt: 1,
        marketplaceSync: {
          bricklink: {
            status: "synced",
            lastSyncAttempt: 100,
            lotId: 1234,
          },
          brickowl: {
            status: "synced",
            lastSyncAttempt: 200,
            lotId: "abc-123",
          },
        },
      },
    ],
    marketplaceCredentials: [
      {
        _id: "marketplaceCredentials:1",
        businessAccountId,
        provider: "bricklink" as const,
        isActive: true,
        syncEnabled: true,
        createdBy: ownerUserId,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: "marketplaceCredentials:2",
        businessAccountId,
        provider: "brickowl" as const,
        isActive: true,
        syncEnabled: true,
        createdBy: ownerUserId,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  let ctx: ReturnType<typeof createConvexTestContext>;

  beforeEach(() => {
    ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks marketplace sync status as pending after an edit", async () => {
    vi.spyOn(inventoryHelpers, "getNextSeqForItem").mockResolvedValue(2);
    vi.spyOn(inventoryHelpers, "getCurrentAvailableFromLedger").mockResolvedValue(10);
    const enqueueSpy = vi
      .spyOn(inventoryHelpers, "enqueueMarketplaceSync")
      .mockResolvedValue(true);

    await (updateInventoryItem as any)._handler(ctx, {
      itemId,
      quantityAvailable: 12,
      price: 13.75,
    });

    const updatedItem = (await ctx.db.get(itemId)) as any;

    expect(updatedItem.marketplaceSync.bricklink.status).toBe("pending");
    expect(updatedItem.marketplaceSync.brickowl.status).toBe("pending");
    expect(updatedItem.marketplaceSync.bricklink.lotId).toBe(1234);
    expect(updatedItem.marketplaceSync.brickowl.lotId).toBe("abc-123");
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
  });
});

