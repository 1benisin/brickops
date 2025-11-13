// Handles secure access to BrickOwl API credentials and provides helper utilities
// for testing the connection. All exported functions follow the Convex action
// patterns for authorization and data fetching.
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { decryptCredential } from "../../lib/encryption";
import { requireActiveUser } from "@/convex/users/authorization";
import { makeBoRequest } from "./client";

// Simple container for the decrypted BrickOwl API credentials.
export type BrickOwlCredentials = {
  apiKey: string;
};

/**
 * Fetches and validates the BrickOwl API key for the provided business account.
 * The flow is:
 * 1. Attempt to load the active business account for the caller.
 * 2. Ensure the caller is authorized to access the requested credentials.
 * 3. Fetch encrypted credentials from Convex storage.
 * 4. Decrypt and validate the API key before returning it to the caller.
 */
export async function getBrickOwlCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlCredentials> {
  // Determine the business account the caller is currently operating under using shared auth helpers.
  let activeBusinessAccountId: Id<"businessAccounts"> | null = null;

  try {
    const { businessAccountId: resolvedBusinessAccountId } = await requireActiveUser(ctx);
    activeBusinessAccountId = resolvedBusinessAccountId;
  } catch (error) {
    if (!isAuthenticationRequiredError(error)) {
      throw error;
    }
  }

  if (activeBusinessAccountId !== null && activeBusinessAccountId !== businessAccountId) {
    // Prevent access when the caller tries to read credentials for another business account.
    throw new ConvexError({
      code: "BUSINESS_ACCOUNT_MISMATCH",
      message: "You are not authorized to access these BrickOwl credentials.",
    });
  }

  // Retrieve the encrypted credentials stored for this business account.
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

  // Decrypt the stored value so we can validate and return a clean API key.
  const apiKey = (await decryptCredential(encrypted.brickowlApiKey)).trim();

  if (!isValidBrickOwlApiKey(apiKey)) {
    // Fail fast if the credential format looks suspicious or malformed.
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickOwl API key is invalid or malformed.",
    });
  }

  return { apiKey };
}

/**
 * Executes a lightweight BrickOwl API request to confirm the stored credentials
 * are valid. We intentionally use a low-impact endpoint with minimal payload.
 */
export async function testBrickOwlConnection(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<{ success: boolean; message: string }> {
  // Reuse makeBoRequest so we benefit from consistent signing and error handling.
  await makeBoRequest(ctx, businessAccountId, {
    path: "/inventory/list",
    method: "GET",
    query: { limit: 1 },
  });

  return {
    success: true,
    message: "BrickOwl connection successful",
  };
}

// Narrowly checks for the specific error thrown when authentication is required.
function isAuthenticationRequiredError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }

  return error.data === "Authentication required";
}

/**
 * Guardrail to ensure decrypted keys meet the expected format before use.
 * BrickOwl API keys are alphanumeric plus `_` or `-`, and have a reasonable length.
 */
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
