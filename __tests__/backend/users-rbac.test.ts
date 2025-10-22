/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";

import { updateUserRole, removeUser } from "@/convex/users/mutations";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("users RBAC functions", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";
  const memberUserId = "users:2";

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
        firstName: "Olivia",
        lastName: "Ops",
        name: "Olivia Ops",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: memberUserId,
        businessAccountId,
        email: "viewer@example.com",
        role: "viewer",
        firstName: "Vera",
        lastName: "Viewer",
        name: "Vera Viewer",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  it("allows owners to update other members' roles", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session` }),
    });

    await (updateUserRole as any)._handler(ctx, { targetUserId: memberUserId, role: "manager" });
    const updated = await ctx.db.get(memberUserId);
    expect(updated.role).toBe("manager");
  });

  it("prevents non-owners from updating roles", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${memberUserId}|session` }),
    });
    await expect(
      (updateUserRole as any)._handler(ctx, { targetUserId: ownerUserId, role: "viewer" }),
    ).rejects.toThrow(ConvexError);
  });

  it("prevents owners from changing their own role", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session` }),
    });
    await expect(
      (updateUserRole as any)._handler(ctx, { targetUserId: ownerUserId, role: "viewer" }),
    ).rejects.toThrow(ConvexError);
  });

  it("allows owners to remove other users but not themselves", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session` }),
    });

    // Remove member
    await (removeUser as any)._handler(ctx, { targetUserId: memberUserId });
    const removed = await ctx.db.get(memberUserId);
    expect(removed.status).toBe("invited");
    expect(removed.businessAccountId).toBeUndefined();

    // Attempt self-remove
    await expect((removeUser as any)._handler(ctx, { targetUserId: ownerUserId })).rejects.toThrow(
      ConvexError,
    );
  });
});
