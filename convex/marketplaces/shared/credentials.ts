// Convex mutations and queries that create, update, and read marketplace credentials.
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { getCredentialDoc } from "./getCredentialDoc";
import { encryptCredentialsForProvider, validateCredentialsForProvider } from "./credentialHelpers";
import { ensureWebhookToken, generateWebhookToken } from "./webhookTokens";
import { requireActiveUser, requireUserRole } from "../../users/authorization";
import { testBricklinkConnection } from "../bricklink/credentials";
import { testBrickOwlConnection } from "../brickowl/credentials";

type Provider = "bricklink" | "brickowl";

// Save new marketplace credentials or update the ones already stored.
export const saveCredentials = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    bricklinkConsumerKey: v.optional(v.string()),
    bricklinkConsumerSecret: v.optional(v.string()),
    bricklinkTokenValue: v.optional(v.string()),
    bricklinkTokenSecret: v.optional(v.string()),
    brickowlApiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only business owners are allowed to touch marketplace credentials.
    const { userId, businessAccountId } = await requireUserRole(ctx, "owner");

    // Check that the provided secrets are complete for the selected provider.
    validateCredentialsForProvider(args.provider, args);

    // Encrypt secrets before we touch the database.
    const encryptedData = await encryptCredentialsForProvider(args.provider, args);
    // Look for an existing credential document so we can either patch or insert.
    const existing = await getCredentialDoc(ctx, businessAccountId, args.provider);
    const now = Date.now();

    if (existing) {
      // Update the existing document and re-activate it.
      const patchData: Record<string, unknown> = {
        ...encryptedData,
        isActive: true,
        updatedAt: now,
        validationStatus: "pending",
        validationMessage: undefined,
        lastValidatedAt: undefined,
      };

      if (args.provider === "bricklink") {
        // Make sure the BrickLink record keeps a webhook token for callbacks.
        patchData.webhookToken = ensureWebhookToken(existing.webhookToken);
      }

      await ctx.db.patch(existing._id, patchData);

      // Automatically test credentials after saving
      await ctx.scheduler.runAfter(
        0,
        internal.marketplaces.shared.credentials.testConnectionInternal,
        {
          businessAccountId,
          provider: args.provider,
        },
      );

      return { success: true, credentialId: existing._id };
    }

    // Create a brand new document for this marketplace connection.
    const webhookToken = args.provider === "bricklink" ? generateWebhookToken() : undefined;

    const credentialId = await ctx.db.insert("marketplaceCredentials", {
      businessAccountId,
      provider: args.provider,
      ...encryptedData,
      isActive: true,
      webhookToken,
      syncEnabled: false,
      ordersSyncEnabled: true,
      inventorySyncEnabled: false,
      webhookStatus: "unconfigured",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      validationStatus: "pending",
    });

    // Automatically test credentials after saving
    await ctx.scheduler.runAfter(
      0,
      internal.marketplaces.shared.credentials.testConnectionInternal,
      {
        businessAccountId,
        provider: args.provider,
      },
    );

    return { success: true, credentialId };
  },
});

// Permanently delete credentials for a marketplace provider.
export const revokeCredentials = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Only the owner can disable marketplace connections.
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    // If we cannot find the credentials there is nothing to delete.
    const existing = await getCredentialDoc(ctx, businessAccountId, args.provider);
    if (!existing) {
      throw new ConvexError(`No credentials found for ${args.provider}`);
    }

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

// Internal helper used by actions to read encrypted credential values.
export const getEncryptedCredentials = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Grab the stored document and only return data if it is still active.
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential || !credential.isActive) {
      return null;
    }

    return {
      bricklinkConsumerKey: credential.bricklinkConsumerKey,
      bricklinkConsumerSecret: credential.bricklinkConsumerSecret,
      bricklinkTokenValue: credential.bricklinkTokenValue,
      bricklinkTokenSecret: credential.bricklinkTokenSecret,
      brickowlApiKey: credential.brickowlApiKey,
    };
  },
});

// Record the result of an external validation check (for example, testing an API call).
export const updateValidationStatus = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    success: v.boolean(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // Quietly skip updates if the credential was deleted before the validator finished.
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential) {
      return;
    }

    // Update timestamps and the status flag so the UI can show the result.
    await ctx.db.patch(credential._id, {
      lastValidatedAt: Date.now(),
      validationStatus: args.success ? "success" : "failed",
      validationMessage: args.message,
      updatedAt: Date.now(),
    });
  },
});

// Internal query that lists the providers that are ready for sync jobs.
export const getConfiguredProviders = internalQuery({
  args: { businessAccountId: v.id("businessAccounts") },
  handler: async (ctx, { businessAccountId }) => {
    const providers: Provider[] = [];

    const bricklink = await getCredentialDoc(ctx, businessAccountId, "bricklink");
    if (bricklink?.isActive && bricklink?.syncEnabled !== false) {
      providers.push("bricklink");
    }

    const brickowl = await getCredentialDoc(ctx, businessAccountId, "brickowl");
    if (brickowl?.isActive && brickowl?.syncEnabled !== false) {
      providers.push("brickowl");
    }

    return providers;
  },
});

// Allow the owner to turn marketplace sync features on or off.
export const updateSyncSettings = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    syncEnabled: v.optional(v.boolean()),
    ordersSyncEnabled: v.optional(v.boolean()),
    inventorySyncEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Confirm the caller owns the account we are about to modify.
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    // Fetch the credential document we will be patching.
    const credentials = await getCredentialDoc(ctx, businessAccountId, args.provider);

    if (!credentials) {
      throw new ConvexError("Marketplace credentials not found");
    }

    // Require at least one setting to be provided so we do not patch with empty data.
    if (
      args.syncEnabled === undefined &&
      args.ordersSyncEnabled === undefined &&
      args.inventorySyncEnabled === undefined
    ) {
      throw new ConvexError("No sync setting provided");
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.syncEnabled !== undefined) {
      // Flip all sync flags together when the master switch is provided.
      patch.syncEnabled = args.syncEnabled;
      patch.ordersSyncEnabled = args.syncEnabled;
      patch.inventorySyncEnabled = args.syncEnabled;
    }

    if (args.ordersSyncEnabled !== undefined) {
      patch.ordersSyncEnabled = args.ordersSyncEnabled;
    }

    if (args.inventorySyncEnabled !== undefined) {
      patch.inventorySyncEnabled = args.inventorySyncEnabled;
    }

    await ctx.db.patch(credentials._id, patch);

    return null;
  },
});

// Return credential progress information for the owner dashboard.
export const getCredentialStatus = query({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Only the owner can view credential details.
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    // See if we have already saved credentials for this provider.
    const credential = await getCredentialDoc(ctx, businessAccountId, args.provider);

    if (!credential) {
      // Nothing stored yet, report that the provider is not configured.
      return {
        configured: false,
        provider: args.provider,
      };
    }

    // Return a snapshot of the credential metadata without exposing secrets.
    return {
      configured: true,
      provider: args.provider,
      isActive: credential.isActive,
      lastValidatedAt: credential.lastValidatedAt,
      validationStatus: credential.validationStatus,
      validationMessage: credential.validationMessage,
      syncEnabled: credential.syncEnabled ?? true,
      ordersSyncEnabled: credential.ordersSyncEnabled ?? credential.syncEnabled ?? true,
      inventorySyncEnabled: credential.inventorySyncEnabled ?? credential.syncEnabled ?? true,
      webhookStatus: credential.webhookStatus,
      webhookEndpoint: credential.webhookEndpoint,
      webhookRegisteredAt: credential.webhookRegisteredAt,
      webhookLastCheckedAt: credential.webhookLastCheckedAt,
      webhookLastError: credential.webhookLastError,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      webhookToken: credential.webhookToken,
      maskedCredentials:
        args.provider === "bricklink"
          ? {
              bricklinkConsumerKey: credential.bricklinkConsumerKey
                ? "****-****-****-**** "
                : undefined,
              bricklinkTokenValue: credential.bricklinkTokenValue
                ? "****-****-****-****"
                : undefined,
            }
          : {
              brickowlApiKey: credential.brickowlApiKey ? "****-****-****-****" : undefined,
            },
    };
  },
});

// Simple query that the frontend can use to toggle sync UI hints.
export const getMarketplaceSyncConfig = query({
  args: {},
  handler: async (ctx) => {
    // Any active user can call this query; no owner check required.
    const { businessAccountId } = await requireActiveUser(ctx);

    // Load all credential docs for this business to inspect sync flags.
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    const bricklinkCred = credentials.find((c) => c.provider === "bricklink");
    const brickowlCred = credentials.find((c) => c.provider === "brickowl");

    return {
      showBricklinkSync:
        bricklinkCred !== undefined &&
        bricklinkCred.isActive &&
        (bricklinkCred.inventorySyncEnabled ?? bricklinkCred.syncEnabled ?? true),
      showBrickowlSync:
        brickowlCred !== undefined &&
        brickowlCred.isActive &&
        (brickowlCred.inventorySyncEnabled ?? brickowlCred.syncEnabled ?? true),
    };
  },
});

// Owner-facing query that lists each credential and whether sync is turned on.
export const getSyncSettings = query({
  args: {},
  handler: async (ctx) => {
    // Only the owner should control sync settings, so reuse the helper.
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    // Fetch all credentials for the account to build a simple status array.
    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    return credentials.map((cred) => ({
      provider: cred.provider,
      syncEnabled: cred.syncEnabled ?? true,
      isActive: cred.isActive,
    }));
  },
});

// Internal helper that returns metadata about a credential without the encrypted fields.
export const getCredentialMetadata = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Look up the credential document we want to describe.
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential) {
      return null;
    }

    // Strip out the encrypted secrets before returning the rest of the record.
    const {
      bricklinkConsumerKey: _bricklinkConsumerKey,
      bricklinkConsumerSecret: _bricklinkConsumerSecret,
      bricklinkTokenValue: _bricklinkTokenValue,
      bricklinkTokenSecret: _bricklinkTokenSecret,
      brickowlApiKey: _brickowlApiKey,
      ...metadata
    } = credential;

    return metadata;
  },
});

/**
 * Test marketplace credentials by making a lightweight API call.
 * Updates validationStatus after testing.
 */
export const testConnection = action({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireUserRole(ctx, "owner");

    return await performTestConnection(ctx, {
      businessAccountId,
      provider: args.provider,
      allowSystemAccess: false,
    });
  },
});

/**
 * Internal action version that can be scheduled from mutations.
 * Tests credentials and updates validation status.
 */
export const testConnectionInternal = internalAction({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    allowSystemAccess: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await performTestConnection(ctx, {
      businessAccountId: args.businessAccountId,
      provider: args.provider,
      allowSystemAccess: args.allowSystemAccess ?? true,
    });
  },
});

type PerformTestConnectionArgs = {
  businessAccountId: Id<"businessAccounts">;
  provider: Provider;
  allowSystemAccess: boolean;
};

async function performTestConnection(
  ctx: ActionCtx,
  { businessAccountId, provider, allowSystemAccess }: PerformTestConnectionArgs,
) {
  try {
    const { success, message } =
      provider === "bricklink"
        ? await testBricklinkConnection(ctx, businessAccountId, { allowSystemAccess })
        : await testBrickOwlConnection(ctx, businessAccountId);

    await ctx.runMutation(internal.marketplaces.shared.credentials.updateValidationStatus, {
      businessAccountId,
      provider,
      success,
      message,
    });

    return {
      success,
      message,
      provider,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const message = `Connection test failed: ${errorMessage}`;

    await ctx.runMutation(internal.marketplaces.shared.credentials.updateValidationStatus, {
      businessAccountId,
      provider,
      success: false,
      message,
    });

    return {
      success: false,
      message,
      provider,
    };
  }
}
