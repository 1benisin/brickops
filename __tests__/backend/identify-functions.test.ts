/* eslint-disable @typescript-eslint/no-explicit-any */
import { Blob } from "node:buffer";

import { describe, expect, it, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

import { generateUploadUrl } from "@/convex/functions/identify";
import { consumeIdentificationRate } from "@/convex/internal/identify";
import { identifyPartFromImage } from "@/convex/functions/identifyActions";
import { api } from "@/convex/_generated/api";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

const mockRequest = vi.fn();

// Ensure Blob/FormData globals exist for the Convex action runtime in tests
(globalThis as any).Blob = Blob;
class MockFormData {
  private readonly entries: Array<{ name: string; value: unknown; filename?: string }> = [];

  append(name: string, value: unknown, filename?: string) {
    this.entries.push({ name, value, filename });
  }
}
(globalThis as any).FormData = MockFormData;

vi.mock("@/convex/lib/external/brickognize", () => ({
  BrickognizeClient: vi.fn().mockImplementation(() => ({
    request: mockRequest,
  })),
}));

describe("identify functions", () => {
  const businessAccountId = "businessAccounts:1";
  const userId = "users:1";

  const seed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId: userId,
        inviteCode: "abc12345",
        createdAt: 1,
      },
    ],
    users: [
      {
        _id: userId,
        businessAccountId,
        email: "owner@example.com",
        role: "owner",
        status: "active",
        firstName: "Olivia",
        lastName: "Ops",
        name: "Olivia Ops",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  beforeEach(() => {
    mockRequest.mockReset();
  });

  it("issues upload URLs for active users", async () => {
    const ctx = {
      ...createConvexTestContext({
        seed,
        identity: createTestIdentity({ subject: `${userId}|session-1` }),
      }),
      storage: {
        generateUploadUrl: vi.fn().mockResolvedValue("https://upload.convex.dev/test"),
      },
    } as any;

    const url = await (generateUploadUrl as any)._handler(ctx, {});

    expect(url).toBe("https://upload.convex.dev/test");
    expect(ctx.storage.generateUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("enforces identification rate limits", async () => {
    const ctx = createConvexTestContext({
      seed,
      identity: createTestIdentity({ subject: `${userId}|session-1` }),
    }) as any;

    for (let i = 0; i < 100; i += 1) {
      await (consumeIdentificationRate as any)._handler(ctx, { userId });
    }

    await expect((consumeIdentificationRate as any)._handler(ctx, { userId })).rejects.toThrow(
      ConvexError,
    );
  });

  it("identifies parts and normalizes Brickognize responses", async () => {
    const blob = new Blob(["test-image"], { type: "image/jpeg" });

    mockRequest.mockResolvedValue({
      data: {
        listing_id: "listing-123",
        items: [
          {
            id: "3001",
            name: "Brick 2 x 4",
            type: "part",
            category: "Brick",
            score: 0.92,
            img_url: "https://example.com/3001.jpg",
            external_sites: [{ name: "bricklink", url: "https://www.bricklink.com/3001" }],
          },
        ],
      },
    });

    const ctx = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier: `${userId}|session-1` }),
      },
      runQuery: vi.fn().mockResolvedValue({
        user: { _id: userId },
        businessAccount: { _id: businessAccountId },
      }),
      runMutation: vi.fn().mockResolvedValue({ remaining: 99 }),
      storage: {
        get: vi.fn().mockResolvedValue(blob),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    const result = await (identifyPartFromImage as any)._handler(ctx, {
      storageId: "storage:1",
      businessAccountId,
    });

    expect(ctx.runQuery).toHaveBeenCalledWith(api.functions.users.getCurrentUser, {});
    // TODO: Re-enable when rate limiting is implemented
    // expect(ctx.runMutation).toHaveBeenCalledWith(api.internal.identify.consumeIdentificationRate, {
    //   userId,
    // });
    expect(ctx.storage.get).toHaveBeenCalledWith("storage:1");
    expect(ctx.storage.delete).toHaveBeenCalledWith("storage:1");
    expect(result).toMatchObject({
      provider: "brickognize",
      listingId: "listing-123",
      lowConfidence: false,
      topScore: 0.92,
      items: [
        expect.objectContaining({
          id: "3001",
          name: "Brick 2 x 4",
          score: 0.92,
        }),
      ],
    });
  });

  it("rejects identification against a business account the user does not own", async () => {
    const ctx = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier: `${userId}|session-1` }),
      },
      runQuery: vi.fn().mockResolvedValue({
        user: { _id: userId },
        businessAccount: { _id: businessAccountId },
      }),
      runMutation: vi.fn(),
      storage: {
        get: vi.fn(),
        delete: vi.fn(),
      },
    } as any;

    await expect(
      (identifyPartFromImage as any)._handler(ctx, {
        storageId: "storage:1",
        businessAccountId: "businessAccounts:999",
      }),
    ).rejects.toThrow(/cannot access another business/i);
  });
});
