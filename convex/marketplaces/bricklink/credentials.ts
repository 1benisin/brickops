// Helper utilities for reading BrickLink OAuth credentials from Convex in a safe way.
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { decryptCredential } from "../../lib/encryption";
import { requireActiveUser, type RequireUserReturn } from "@/convex/users/authorization";
import { executeBlRequest } from "./request";

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
  // Build a cleaned object where every field is a trimmed string.
  const normalized: BLOAuthCredentials = {
    consumerKey: raw.consumerKey?.trim() ?? "",
    consumerSecret: raw.consumerSecret?.trim() ?? "",
    tokenValue: raw.tokenValue?.trim() ?? "",
    tokenSecret: raw.tokenSecret?.trim() ?? "",
  };

  validateCredentials(normalized);

  // give back the normalized, validated credential bundle to the caller
  return normalized;
}

/**
 * Fetch and decrypt the BrickLink OAuth credentials for a business account.
 * Enforces that the active user has access to the requested business account,
 * returning richly formatted Convex errors when credentials are unavailable or invalid.
 */
type GetBlCredentialsOptions = {
  allowSystemAccess?: boolean;
  identity?: unknown | null;
  activeUserContext?: RequireUserReturn;
};

export async function getBlCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  options: GetBlCredentialsOptions = {},
): Promise<BLOAuthCredentials> {
  // Gate the fetch so only the active business account can read these secrets.
  await assertBusinessAccountAccess(ctx, businessAccountId, options);

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

  // Decrypt each stored value in parallel so we can build the auth bundle quickly.
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

export async function testBricklinkConnection(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  options: { allowSystemAccess?: boolean } = {},
): Promise<{ success: boolean; message: string }> {
  const credentials = await getBlCredentials(ctx, businessAccountId, options);

  const result = await executeBlRequest({
    ctx,
    credentials,
    path: "/colors",
    method: "GET",
  });

  const success = result.ok && result.status === 200;
  const message = success
    ? "BrickLink connection successful"
    : `BrickLink API returned status ${result.status}`;

  return { success, message };
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
    // Stop early and surface a helpful error if any required value is blank.
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
  options: GetBlCredentialsOptions,
): Promise<void> {
  const identity =
    options.identity !== undefined ? options.identity : await getAuthIdentity(ctx);

  if (!identity) {
    if (options.allowSystemAccess) {
      return;
    }
    throw new ConvexError("Authentication required");
  }

  const { businessAccountId: activeAccountId } =
    options.activeUserContext ?? (await requireActiveUser(ctx));
  if (activeAccountId !== businessAccountId) {
    throw new ConvexError({
      code: "BUSINESS_ACCOUNT_MISMATCH",
      message: "You are not authorized to access these BrickLink credentials.",
    });
  }
}

async function getAuthIdentity(ctx: ActionCtx): Promise<unknown | null> {
  const getUserIdentity = ctx.auth?.getUserIdentity;
  if (typeof getUserIdentity === "function") {
    return await getUserIdentity();
  }
  return null;
}
