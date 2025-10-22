import { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { decryptCredential } from "../lib/encryption";
import { BricklinkStoreClient } from "../bricklink/storeClient";
import { BrickOwlStoreClient } from "../brickowl/storeClient";

/**
 * Create BrickLink Store Client with user credentials
 * Helper function for use within actions - not a Convex function
 */
export async function createBricklinkStoreClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BricklinkStoreClient> {
  // Get encrypted credentials
  const credentials = await ctx.runQuery(internal.marketplace.mutations.getEncryptedCredentials, {
    businessAccountId,
    provider: "bricklink",
  });

  if (!credentials) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickLink credentials not configured. Please add your credentials in Settings.",
    });
  }

  // Decrypt credentials and trim whitespace
  const decryptedCreds = {
    consumerKey: (await decryptCredential(credentials.bricklinkConsumerKey!)).trim(),
    consumerSecret: (await decryptCredential(credentials.bricklinkConsumerSecret!)).trim(),
    tokenValue: (await decryptCredential(credentials.bricklinkTokenValue!)).trim(),
    tokenSecret: (await decryptCredential(credentials.bricklinkTokenSecret!)).trim(),
  };

  // Create and return client instance with ActionCtx for DB rate limiting
  return new BricklinkStoreClient(decryptedCreds, businessAccountId, ctx);
}

/**
 * Create BrickOwl Store Client with user credentials
 * Helper function for use within actions - not a Convex function
 */
export async function createBrickOwlStoreClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlStoreClient> {
  // Get encrypted credentials
  const credentials = await ctx.runQuery(internal.marketplace.mutations.getEncryptedCredentials, {
    businessAccountId,
    provider: "brickowl",
  });

  if (!credentials) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickOwl credentials not configured. Please add your credentials in Settings.",
    });
  }

  // Decrypt credentials
  const decryptedCreds = {
    apiKey: await decryptCredential(credentials.brickowlApiKey!),
  };

  // Create and return client instance with ActionCtx for DB rate limiting
  return new BrickOwlStoreClient(decryptedCreds, businessAccountId, ctx);
}
