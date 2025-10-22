/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

import { getCurrentUser, listMembers } from "@/convex/users/queries";
import { regenerateInviteCode, updateProfile, createUserInvite } from "@/convex/users/mutations";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("users functions", () => {
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
        email: "manager@example.com",
        role: "manager",
        firstName: "Mason",
        lastName: "Manager",
        name: "Mason Manager",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  it("returns the current user and business account details", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    const result = await (getCurrentUser as any)._handler(ctx, {});

    expect(result.user).toMatchObject({
      _id: ownerUserId,
      email: "owner@example.com",
      role: "owner",
    });
    expect(result.businessAccount).toMatchObject({
      _id: businessAccountId,
      inviteCode: "abc12345",
    });
  });

  it("lists team members for the same business account", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-001` }),
    });

    const members = await (listMembers as any)._handler(ctx, {});

    expect(members).toHaveLength(2);
    expect(members.some((member: any) => member._id === ownerUserId && member.isCurrentUser)).toBe(
      true,
    );
    expect(members.some((member: any) => member._id === memberUserId)).toBe(true);
  });

  it("updates the current user's profile", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${memberUserId}|session-002` }),
    });

    await (updateProfile as any)._handler(ctx, {
      firstName: "Morgan",
      lastName: "Smith",
    });

    const updated = await ctx.db.get(memberUserId);
    expect(updated.firstName).toBe("Morgan");
    expect(updated.lastName).toBe("Smith");
    expect(updated.name).toBe("Morgan Smith");
  });

  it("allows the owner to regenerate invite codes", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-003` }),
    });

    const result = await (regenerateInviteCode as any)._handler(ctx, {});

    expect(result.inviteCode).toMatch(/^[0-9a-f]{8}$/);
    expect(result.inviteCode).not.toBe("abc12345");
  });

  it("prevents non-owners from regenerating invite codes", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${memberUserId}|session-004` }),
    });

    await expect((regenerateInviteCode as any)._handler(ctx, {})).rejects.toThrow(ConvexError);
  });

  it("enforces rate limits on invite creation per business and per email", async () => {
    // Mock Resend email send to avoid network and satisfy env requirements
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    process.env.RESEND_API_KEY = "test-api-key";
    process.env.AUTH_EMAIL_FROM = "BrickOps Auth <auth@brickops.test>";
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session-005` }),
    });

    // Within business limit (10 per hour), send 3 invites to same email to hit email limit
    const commonArgs = {
      role: "manager" as const,
      inviteBaseUrl: "https://app.example.com/invite",
      expiresInHours: 72,
    };

    await (createUserInvite as any)._handler(ctx, { email: "new1@example.com", ...commonArgs });
    await (createUserInvite as any)._handler(ctx, { email: "new2@example.com", ...commonArgs });
    await (createUserInvite as any)._handler(ctx, { email: "new3@example.com", ...commonArgs });

    // Same recipient should be limited after 3/day
    await (createUserInvite as any)._handler(ctx, { email: "limited@example.com", ...commonArgs });
    await (createUserInvite as any)._handler(ctx, { email: "limited@example.com", ...commonArgs });
    await (createUserInvite as any)._handler(ctx, { email: "limited@example.com", ...commonArgs });
    await expect(
      (createUserInvite as any)._handler(ctx, { email: "limited@example.com", ...commonArgs }),
    ).rejects.toThrow(ConvexError);

    // restore
    globalThis.fetch = originalFetch;
  });
});
