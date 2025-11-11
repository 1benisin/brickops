import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../../_generated/api";
import { decryptCredential } from "../../../lib/encryption";
import { requireActiveUser } from "@/convex/users/authorization";

export type BrickOwlCredentials = {
  apiKey: string;
};

export async function getBrickOwlCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlCredentials> {
  const { businessAccountId: activeBusinessAccountId } = await requireActiveUser(ctx);
  if (activeBusinessAccountId !== businessAccountId) {
    throw new ConvexError({
      code: "BUSINESS_ACCOUNT_MISMATCH",
      message: "You are not authorized to access these BrickOwl credentials.",
    });
  }

  const encrypted = await ctx.runQuery(
    internal.marketplaces.shared.credentials.getEncryptedCredentials,
    {
      businessAccountId,
      provider: "brickowl",
    },
  );

  if (!encrypted?.brickowlApiKey) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickOwl credentials not configured. Please add your API key in Settings.",
    });
  }

  const apiKey = (await decryptCredential(encrypted.brickowlApiKey)).trim();

  if (!isValidBrickOwlApiKey(apiKey)) {
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickOwl API key is invalid or malformed.",
    });
  }

  return { apiKey };
}

function isValidBrickOwlApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== "string") {
    return false;
  }
  const trimmed = apiKey.trim();
  if (trimmed.length < 20 || trimmed.length > 128) {
    return false;
  }
  const validPattern = /^[A-Za-z0-9_-]+$/;
  return validPattern.test(trimmed);
}
