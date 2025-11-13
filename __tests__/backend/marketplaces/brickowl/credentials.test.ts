import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import { getBrickOwlCredentials } from "@/convex/marketplaces/brickowl/credentials";
import { decryptCredential } from "@/convex/lib/encryption";
import { requireActiveUser } from "@/convex/users/authorization";

vi.mock("@/convex/users/authorization", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("@/convex/lib/encryption", () => ({
  decryptCredential: vi.fn(),
}));

const requireActiveUserMock = vi.mocked(requireActiveUser);
const decryptCredentialMock = vi.mocked(decryptCredential);

const businessAccountId = "ba-123" as Id<"businessAccounts">;

const createCtx = (identity: unknown = { tokenIdentifier: "token" }) => {
  const runQuery = vi.fn();
  const runMutation = vi.fn();
  const getUserIdentity = vi.fn().mockResolvedValue(identity);
  const ctx = {
    runQuery,
    runMutation,
    scheduler: { runAfter: vi.fn(), runAt: vi.fn() },
    auth: { getUserIdentity },
  } as unknown as ActionCtx;

  return { ctx, runQuery, getUserIdentity };
};

beforeEach(() => {
  vi.clearAllMocks();

  requireActiveUserMock.mockResolvedValue({ businessAccountId });
  decryptCredentialMock.mockResolvedValue("valid-api-key-123456789");
});

describe("getBrickOwlCredentials", () => {
  it("returns decrypted and validated credentials when user owns the business account", async () => {
    const { ctx, runQuery, getUserIdentity } = createCtx();
    runQuery.mockResolvedValue({
      brickowlApiKey: "encrypted-key",
    });
    decryptCredentialMock.mockResolvedValueOnce("  valid-api-key-123456 ");

    const result = await getBrickOwlCredentials(ctx, businessAccountId);

    expect(getUserIdentity).toHaveBeenCalled();
    expect(requireActiveUserMock).toHaveBeenCalledWith(ctx);
    expect(runQuery).toHaveBeenCalledTimes(1);
    const [, args] = runQuery.mock.calls[0] ?? [];
    expect(args).toMatchObject({
      businessAccountId,
      provider: "brickowl",
    });
    expect(decryptCredentialMock).toHaveBeenCalledWith("encrypted-key");

    expect(result).toEqual({ apiKey: "valid-api-key-123456" });
  });

  it("throws when the active user is requesting another business account's credentials", async () => {
    const { ctx, runQuery } = createCtx();
    requireActiveUserMock.mockResolvedValueOnce({ businessAccountId: "different-ba" });

    await expect(getBrickOwlCredentials(ctx, businessAccountId)).rejects.toMatchObject({
      data: {
        code: "BUSINESS_ACCOUNT_MISMATCH",
      },
    });

    expect(runQuery).not.toHaveBeenCalled();
  });

  it("throws when credentials are missing for the business account", async () => {
    const { ctx, runQuery } = createCtx();
    runQuery.mockResolvedValue(null);

    await expect(getBrickOwlCredentials(ctx, businessAccountId)).rejects.toMatchObject({
      data: {
        code: "CREDENTIALS_NOT_FOUND",
      },
    });
  });

  it("throws when the decrypted key is invalid", async () => {
    const { ctx, runQuery } = createCtx();
    runQuery.mockResolvedValue({
      brickowlApiKey: "encrypted-key",
    });
    decryptCredentialMock.mockResolvedValueOnce("invalid key!!!");

    await expect(getBrickOwlCredentials(ctx, businessAccountId)).rejects.toMatchObject({
      data: {
        code: "INVALID_CREDENTIALS",
      },
    });
  });

  it("allows system contexts to retrieve credentials without requiring an active user", async () => {
    const { ctx, runQuery, getUserIdentity } = createCtx(null);
    runQuery.mockResolvedValue({
      brickowlApiKey: "encrypted-key",
    });
    decryptCredentialMock.mockResolvedValueOnce("valid-api-key-system");

    const result = await getBrickOwlCredentials(ctx, businessAccountId);

    expect(getUserIdentity).toHaveBeenCalled();
    expect(requireActiveUserMock).not.toHaveBeenCalled();
    expect(result).toEqual({ apiKey: "valid-api-key-system" });
  });

  it("falls back to system access when requireActiveUser throws Authentication required", async () => {
    const { ctx, runQuery } = createCtx({ tokenIdentifier: "system-token" });
    runQuery.mockResolvedValue({
      brickowlApiKey: "encrypted-key",
    });
    decryptCredentialMock.mockResolvedValueOnce("system-access-key-1234567");
    requireActiveUserMock.mockRejectedValueOnce(new ConvexError("Authentication required"));

    const result = await getBrickOwlCredentials(ctx, businessAccountId);

    expect(requireActiveUserMock).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({ apiKey: "system-access-key-1234567" });
  });
});

