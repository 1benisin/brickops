import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../../_generated/api";
import { decryptCredential } from "../../../lib/encryption";
import { requireActiveUser } from "@/convex/users/authorization";

/**
 * OAuth credential bundle required to authenticate against the BrickLink API.
 */
export type BLOAuthCredentials = {
  consumerKey: string;
  consumerSecret: string;
  tokenValue: string;
  tokenSecret: string;
};

type RawBLCredentials = {
  consumerKey: string | null | undefined;
  consumerSecret: string | null | undefined;
  tokenValue: string | null | undefined;
  tokenSecret: string | null | undefined;
};

/**
 * Normalize and validate BrickLink credential values by trimming whitespace and ensuring all fields
 * are present. Throws a ConvexError if any field is missing or blank.
 */
export function normalizeBlCredentials(raw: RawBLCredentials): BLOAuthCredentials {
  const normalized: BLOAuthCredentials = {
    consumerKey: raw.consumerKey?.trim() ?? "",
    consumerSecret: raw.consumerSecret?.trim() ?? "",
    tokenValue: raw.tokenValue?.trim() ?? "",
    tokenSecret: raw.tokenSecret?.trim() ?? "",
  };

  validateCredentials(normalized);

  return normalized;
}

/**
 * Fetch and decrypt the BrickLink OAuth credentials for a business account.
 * Enforces that the active user has access to the requested business account,
 * returning richly formatted Convex errors when credentials are unavailable or invalid.
 */
export async function getBlCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BLOAuthCredentials> {
  await assertBusinessAccountAccess(ctx, businessAccountId);

  // Pull the encrypted credential payload out of storage for the target marketplace provider.
  const credentials = await ctx.runQuery(
    internal.marketplaces.shared.credentials.getEncryptedCredentials,
    {
      businessAccountId,
      provider: "bricklink",
    },
  );

  if (!credentials) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickLink credentials not configured. Please add your credentials in Settings.",
    });
  }

  const [consumerKey, consumerSecret, tokenValue, tokenSecret] = await Promise.all([
    decryptCredential(credentials.bricklinkConsumerKey!),
    decryptCredential(credentials.bricklinkConsumerSecret!),
    decryptCredential(credentials.bricklinkTokenValue!),
    decryptCredential(credentials.bricklinkTokenSecret!),
  ]);

  return normalizeBlCredentials({
    consumerKey,
    consumerSecret,
    tokenValue,
    tokenSecret,
  });
}

/**
 * Ensure that each decrypted field required by BrickLink OAuth is present.
 * We throw a Convex error so callers can surface actionable feedback to the UI.
 */
function validateCredentials(credentials: BLOAuthCredentials): void {
  if (
    !credentials.consumerKey ||
    !credentials.consumerSecret ||
    !credentials.tokenValue ||
    !credentials.tokenSecret
  ) {
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickLink credentials are missing required fields",
    });
  }
}

/**
 * Confirm that the requesting user is operating within their active business account context.
 * Prevents cross-tenant access to stored BrickLink credentials.
 */
async function assertBusinessAccountAccess(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<void> {
  const { businessAccountId: activeAccountId } = await requireActiveUser(ctx);
  if (activeAccountId !== businessAccountId) {
    throw new ConvexError({
      code: "BUSINESS_ACCOUNT_MISMATCH",
      message: "You are not authorized to access these BrickLink credentials.",
    });
  }
}
