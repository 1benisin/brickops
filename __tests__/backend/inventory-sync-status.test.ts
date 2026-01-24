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
        lifecycleStatus: "ready_to_sync",
      },
    ],
    // Sync state is now in inventorySyncState table
    inventorySyncState: [
      {
        _id: "inventorySyncState:1",
        itemId,
        provider: "bricklink" as const,
        status: "synced" as const,
        lastSyncAttempt: 100,
        lotId: 1234,
      },
      {
        _id: "inventorySyncState:2",
        itemId,
        provider: "brickowl" as const,
        status: "synced" as const,
        lastSyncAttempt: 200,
        lotId: "abc-123",
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

    // Check inventorySyncState table for updated status
    const bricklinkState = await ctx.db
      .query("inventorySyncState")
      .withIndex("by_item_provider", (q) =>
        q.eq("itemId", itemId).eq("provider", "bricklink"),
      )
      .first();

    const brickowlState = await ctx.db
      .query("inventorySyncState")
      .withIndex("by_item_provider", (q) =>
        q.eq("itemId", itemId).eq("provider", "brickowl"),
      )
      .first();

    expect(bricklinkState?.status).toBe("pending");
    expect(brickowlState?.status).toBe("pending");
    // lotId should be preserved
    expect(bricklinkState?.lotId).toBe(1234);
    expect(brickowlState?.lotId).toBe("abc-123");
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
  });
});

