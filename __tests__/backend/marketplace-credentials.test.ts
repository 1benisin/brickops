/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConfiguredProviders,
  getSyncSettings,
  saveCredentials,
} from "@/convex/marketplaces/shared/credentials";
import * as encryption from "@/convex/lib/encryption";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("marketplace credential defaults", () => {
  const businessAccountId = "businessAccounts:1";
  const ownerUserId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId,
        inviteCode: "invite-code",
        createdAt: Date.now(),
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });

  beforeEach(() => {
    vi.spyOn(encryption, "encryptCredential").mockImplementation(async (value: string) => value);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables BrickLink inventory sync by default", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session` }),
    });

    await (saveCredentials as any)._handler(ctx, {
      provider: "bricklink",
      bricklinkConsumerKey: "consumerKey",
      bricklinkConsumerSecret: "consumerSecret",
      bricklinkTokenValue: "tokenValue",
      bricklinkTokenSecret: "tokenSecret",
    });

    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    expect(credential?.syncEnabled).toBe(false);
    expect(credential?.inventorySyncEnabled).toBe(false);
    expect(credential?.ordersSyncEnabled).toBe(true);

    const syncSettings = await (getSyncSettings as any)._handler(ctx, {});
    const bricklinkSettings = syncSettings.find(
      (setting: { provider: string }) => setting.provider === "bricklink",
    );

    expect(bricklinkSettings?.syncEnabled).toBe(false);

    const configuredProviders = await (getConfiguredProviders as any)._handler(ctx, {
      businessAccountId,
    });
    expect(configuredProviders).not.toContain("bricklink");
  });

  it("disables BrickOwl inventory sync by default", async () => {
    const ctx = createConvexTestContext({
      seed: baseSeed,
      identity: createTestIdentity({ subject: `${ownerUserId}|session` }),
    });

    await (saveCredentials as any)._handler(ctx, {
      provider: "brickowl",
      brickowlApiKey: "brickowl-key",
    });

    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", "brickowl"),
      )
      .first();

    expect(credential?.syncEnabled).toBe(false);
    expect(credential?.inventorySyncEnabled).toBe(false);

    const configuredProviders = await (getConfiguredProviders as any)._handler(ctx, {
      businessAccountId,
    });
    expect(configuredProviders).not.toContain("brickowl");
  });
});
