import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionCtx } from "@/convex/_generated/server";
import type { Id } from "@/convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  getBlCredentials,
  normalizeBlCredentials,
} from "@/convex/marketplaces/bricklink/credentials";
import { decryptCredential } from "@/convex/lib/encryption";
import { requireActiveUser } from "@/convex/users/authorization";
import { internal } from "@/convex/_generated/api";

vi.mock("@/convex/lib/encryption", () => ({
  decryptCredential: vi.fn(),
}));

vi.mock("@/convex/users/authorization", () => ({
  requireActiveUser: vi.fn(),
}));

const decryptMock = vi.mocked(decryptCredential);
const requireActiveUserMock = vi.mocked(requireActiveUser);

describe("BrickLink credentials helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeBlCredentials", () => {
    it("trims whitespace from all credential fields", () => {
      const result = normalizeBlCredentials({
        consumerKey: "  key  ",
        consumerSecret: "\tsecret\n",
        tokenValue: " value ",
        tokenSecret: " secret\t",
      });

      expect(result).toEqual({
        consumerKey: "key",
        consumerSecret: "secret",
        tokenValue: "value",
        tokenSecret: "secret",
      });
    });

    it("throws a ConvexError when any credential is missing", () => {
      expect.assertions(2);

      try {
        normalizeBlCredentials({
          consumerKey: "key",
          consumerSecret: "secret",
          tokenValue: null,
          tokenSecret: "secret",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConvexError);
        expect((error as ConvexError).data).toMatchObject({
          code: "INVALID_CREDENTIALS",
        });
      }
    });
  });

  describe("getBlCredentials", () => {
    const businessAccountId = "ba1" as Id<"businessAccounts">;

    it("returns decrypted and normalized credentials when access is authorized", async () => {
      const identity = { tokenIdentifier: "token" };
      const activeUserContext = { businessAccountId } as unknown as Awaited<
        ReturnType<typeof requireActiveUser>
      >;
      const ctx = {
        runQuery: vi.fn().mockResolvedValue({
          bricklinkConsumerKey: "enc-ck",
          bricklinkConsumerSecret: "enc-cs",
          bricklinkTokenValue: "enc-tv",
          bricklinkTokenSecret: "enc-ts",
        }),
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue(identity),
        },
      } as unknown as ActionCtx;

      requireActiveUserMock.mockResolvedValue(activeUserContext);
      decryptMock
        .mockResolvedValueOnce("  ck  ")
        .mockResolvedValueOnce("\tcs\n")
        .mockResolvedValueOnce(" tv ")
        .mockResolvedValueOnce(" ts\t");

      const result = await getBlCredentials(ctx, businessAccountId);

      expect(requireActiveUserMock).toHaveBeenCalledWith(ctx);
      expect(ctx.runQuery).toHaveBeenCalledWith(
        internal.marketplaces.shared.credentials.getEncryptedCredentials,
        {
          businessAccountId,
          provider: "bricklink",
        },
      );
      expect(decryptMock).toHaveBeenCalledTimes(4);
      expect(result).toEqual({
        consumerKey: "ck",
        consumerSecret: "cs",
        tokenValue: "tv",
        tokenSecret: "ts",
      });
    });

    it("throws when no credentials are stored for the business account", async () => {
      const identity = { tokenIdentifier: "token" };
      const ctx = {
        runQuery: vi.fn().mockResolvedValue(null),
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue(identity),
        },
      } as unknown as ActionCtx;

      requireActiveUserMock.mockResolvedValue({ businessAccountId });

      const promise = getBlCredentials(ctx, businessAccountId);

      await expect(promise).rejects.toBeInstanceOf(ConvexError);
      await expect(promise).rejects.toMatchObject({
        data: { code: "CREDENTIALS_NOT_FOUND" },
      });
      expect(ctx.runQuery).toHaveBeenCalled();
    });

    it("throws when the active user is not authorized for the requested business account", async () => {
      const identity = { tokenIdentifier: "token" };
      const ctx = {
        runQuery: vi.fn(),
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue(identity),
        },
      } as unknown as ActionCtx;

      requireActiveUserMock.mockResolvedValue({
        businessAccountId: "ba-other" as Id<"businessAccounts">,
      });

      const promise = getBlCredentials(ctx, businessAccountId);

      await expect(promise).rejects.toBeInstanceOf(ConvexError);
      await expect(promise).rejects.toMatchObject({
        data: { code: "BUSINESS_ACCOUNT_MISMATCH" },
      });
      expect(ctx.runQuery).not.toHaveBeenCalled();
    });

    it("throws when invoked without an authenticated identity and system access is not allowed", async () => {
      const ctx = {
        runQuery: vi.fn(),
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue(null),
        },
      } as unknown as ActionCtx;

      const promise = getBlCredentials(ctx, businessAccountId);

      await expect(promise).rejects.toBeInstanceOf(ConvexError);
      await expect(promise).rejects.toMatchObject({ data: "Authentication required" });
      expect(requireActiveUserMock).not.toHaveBeenCalled();
      expect(ctx.runQuery).not.toHaveBeenCalled();
    });

    it("allows system contexts to read credentials when explicitly permitted", async () => {
      const ctx = {
        runQuery: vi.fn().mockResolvedValue({
          bricklinkConsumerKey: "enc-ck",
          bricklinkConsumerSecret: "enc-cs",
          bricklinkTokenValue: "enc-tv",
          bricklinkTokenSecret: "enc-ts",
        }),
        auth: {
          getUserIdentity: vi.fn().mockResolvedValue(null),
        },
      } as unknown as ActionCtx;

      decryptMock
        .mockResolvedValueOnce("ck")
        .mockResolvedValueOnce("cs")
        .mockResolvedValueOnce("tv")
        .mockResolvedValueOnce("ts");

      const result = await getBlCredentials(ctx, businessAccountId, {
        allowSystemAccess: true,
        identity: null,
      });

      expect(requireActiveUserMock).not.toHaveBeenCalled();
      expect(ctx.runQuery).toHaveBeenCalled();
      expect(result).toEqual({
        consumerKey: "ck",
        consumerSecret: "cs",
        tokenValue: "tv",
        tokenSecret: "ts",
      });
    });
  });
});

