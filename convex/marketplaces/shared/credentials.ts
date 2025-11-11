import { internalMutation, internalQuery, mutation, query } from "../../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireOwner } from "./auth";
import { getCredentialDoc } from "./getCredentialDoc";
import { encryptCredentialsForProvider, validateCredentialsForProvider } from "./credentialHelpers";
import { ensureWebhookToken, generateWebhookToken } from "./webhookTokens";
import { requireActiveUser } from "../../users/authorization";

type Provider = "bricklink" | "brickowl";

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
    const { userId, businessAccountId } = await requireOwner(ctx);

    validateCredentialsForProvider(args.provider, args);

    const encryptedData = await encryptCredentialsForProvider(args.provider, args);
    const existing = await getCredentialDoc(ctx, businessAccountId, args.provider);
    const now = Date.now();

    if (existing) {
      const patchData: Record<string, unknown> = {
        ...encryptedData,
        isActive: true,
        updatedAt: now,
        validationStatus: "pending",
        validationMessage: undefined,
        lastValidatedAt: undefined,
      };

      if (args.provider === "bricklink") {
        patchData.webhookToken = ensureWebhookToken(existing.webhookToken);
      }

      await ctx.db.patch(existing._id, patchData);

      return { success: true, credentialId: existing._id };
    }

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

    return { success: true, credentialId };
  },
});

export const revokeCredentials = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const existing = await getCredentialDoc(ctx, businessAccountId, args.provider);
    if (!existing) {
      throw new ConvexError(`No credentials found for ${args.provider}`);
    }

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

export const getEncryptedCredentials = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
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

export const updateValidationStatus = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    success: v.boolean(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential) {
      return;
    }

    await ctx.db.patch(credential._id, {
      lastValidatedAt: Date.now(),
      validationStatus: args.success ? "success" : "failed",
      validationMessage: args.message,
      updatedAt: Date.now(),
    });
  },
});

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

export const updateSyncSettings = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    syncEnabled: v.optional(v.boolean()),
    ordersSyncEnabled: v.optional(v.boolean()),
    inventorySyncEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credentials = await getCredentialDoc(ctx, businessAccountId, args.provider);

    if (!credentials) {
      throw new ConvexError("Marketplace credentials not found");
    }

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

export const getCredentialStatus = query({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credential = await getCredentialDoc(ctx, businessAccountId, args.provider);

    if (!credential) {
      return {
        configured: false,
        provider: args.provider,
      };
    }

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
              bricklinkConsumerKey: credential.bricklinkConsumerKey ? "****" : undefined,
              bricklinkTokenValue: credential.bricklinkTokenValue ? "****" : undefined,
            }
          : {
              brickowlApiKey: credential.brickowlApiKey ? "****" : undefined,
            },
    };
  },
});

export const getMarketplaceSyncConfig = query({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireActiveUser(ctx);

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

export const getSyncSettings = query({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);

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

export const getCredentialMetadata = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const credential = await getCredentialDoc(ctx, args.businessAccountId, args.provider);

    if (!credential) {
      return null;
    }

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
