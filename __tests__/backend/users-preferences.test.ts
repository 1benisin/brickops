/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import { getCurrentUser } from "@/convex/users/queries";
import { updatePreferences } from "@/convex/users/mutations";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("User Preferences", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "abc12345",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: ownerUserId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        firstName: "Test",
        lastName: "User",
        name: "Test User",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  it("updatePreferences - sets useSortLocations to true", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    await (updatePreferences as any)._handler(ctx, { useSortLocations: true });

    const updated = await ctx.db.get(ownerUserId);
    expect((updated as any).useSortLocations).toBe(true);
  });

  it("updatePreferences - sets useSortLocations to false", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    await (updatePreferences as any)._handler(ctx, { useSortLocations: false });

    const updated = await ctx.db.get(ownerUserId);
    expect((updated as any).useSortLocations).toBe(false);
  });

  it("updatePreferences - requires authentication", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: null, // No identity = not authenticated
    });

    await expect(
      (updatePreferences as any)._handler(ctx, { useSortLocations: true }),
    ).rejects.toThrow();
  });

  it("getCurrentUser - returns undefined useSortLocations for legacy users", async () => {
    // User created without useSortLocations field (legacy behavior)
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    const result = await (getCurrentUser as any)._handler(ctx, {});
    expect((result.user as any).useSortLocations).toBeUndefined();
  });

  it("updatePreferences - updates updatedAt timestamp", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    const before = await ctx.db.get(ownerUserId);
    const beforeTime = (before as any).updatedAt ?? 0;

    // Wait a bit to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    await (updatePreferences as any)._handler(ctx, { useSortLocations: true });

    const after = await ctx.db.get(ownerUserId);
    const afterTime = (after as any).updatedAt ?? 0;

    expect(afterTime).toBeGreaterThan(beforeTime);
  });

  it("updatePreferences - can toggle preference multiple times", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    // Set to true
    await (updatePreferences as any)._handler(ctx, { useSortLocations: true });
    let updated = await ctx.db.get(ownerUserId);
    expect((updated as any).useSortLocations).toBe(true);

    // Toggle to false
    await (updatePreferences as any)._handler(ctx, { useSortLocations: false });
    updated = await ctx.db.get(ownerUserId);
    expect((updated as any).useSortLocations).toBe(false);

    // Toggle back to true
    await (updatePreferences as any)._handler(ctx, { useSortLocations: true });
    updated = await ctx.db.get(ownerUserId);
    expect((updated as any).useSortLocations).toBe(true);
  });
});
