import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  MutationCtx,
  QueryCtx,
  internalMutation,
  internalQuery,
  query,
} from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { encryptCredential } from "../../lib/encryption";
import { getRateLimitConfig } from "./rateLimitConfig";
import { randomHex } from "../../lib/webcrypto";

/**
 * Generate a unique webhook token for BrickLink callback URL
 */
function generateWebhookToken(): string {
  // Generate a secure random token (32 bytes = 64 hex characters)
  return randomHex(32);
}

type RequireOwnerReturn = {
  userId: Id<"users">;
  user: Doc<"users">;
  businessAccountId: Id<"businessAccounts">;
};

/**
 * Require authenticated owner user
 * Throws if user is not authenticated or not an owner
 */
async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<RequireOwnerReturn> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Authentication required");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError("User not found");
  }

  if (user.status !== "active") {
    throw new ConvexError("User account is not active");
  }

  if (!user.businessAccountId) {
    throw new ConvexError("User is not linked to a business account");
  }

  if (user.role !== "owner") {
    throw new ConvexError("Access denied. Only account owners can manage marketplace credentials.");
  }

  return {
    userId,
    user,
    businessAccountId: user.businessAccountId as Id<"businessAccounts">,
  };
}

/**
 * Save marketplace credentials (create or update)
 */
export const saveCredentials = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    // BrickLink OAuth 1.0a credentials
    bricklinkConsumerKey: v.optional(v.string()),
    bricklinkConsumerSecret: v.optional(v.string()),
    bricklinkTokenValue: v.optional(v.string()),
    bricklinkTokenSecret: v.optional(v.string()),
    // BrickOwl API key
    brickowlApiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, businessAccountId } = await requireOwner(ctx);

    // Validate provider-specific required fields
    if (args.provider === "bricklink") {
      if (
        !args.bricklinkConsumerKey ||
        !args.bricklinkConsumerSecret ||
        !args.bricklinkTokenValue ||
        !args.bricklinkTokenSecret
      ) {
        throw new ConvexError(
          "BrickLink requires: bricklinkConsumerKey, bricklinkConsumerSecret, bricklinkTokenValue, and bricklinkTokenSecret",
        );
      }
    } else if (args.provider === "brickowl") {
      if (!args.brickowlApiKey) {
        throw new ConvexError("BrickOwl requires: brickowlApiKey");
      }
    }

    // Encrypt sensitive fields
    const encryptedData: {
      bricklinkConsumerKey?: string;
      bricklinkConsumerSecret?: string;
      bricklinkTokenValue?: string;
      bricklinkTokenSecret?: string;
      brickowlApiKey?: string;
    } = {};

    if (args.bricklinkConsumerKey) {
      encryptedData.bricklinkConsumerKey = await encryptCredential(args.bricklinkConsumerKey);
    }
    if (args.bricklinkConsumerSecret) {
      encryptedData.bricklinkConsumerSecret = await encryptCredential(args.bricklinkConsumerSecret);
    }
    if (args.bricklinkTokenValue) {
      encryptedData.bricklinkTokenValue = await encryptCredential(args.bricklinkTokenValue);
    }
    if (args.bricklinkTokenSecret) {
      encryptedData.bricklinkTokenSecret = await encryptCredential(args.bricklinkTokenSecret);
    }
    if (args.brickowlApiKey) {
      encryptedData.brickowlApiKey = await encryptCredential(args.brickowlApiKey);
    }

    // Check if credentials already exist
    const existing = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", args.provider),
      )
      .first();

    const now = Date.now();
    let credentialId: Id<"marketplaceCredentials">;

    if (existing) {
      // Update existing credentials
      // Always ensure webhook token exists for BrickLink (generate if missing)
      let webhookToken = existing.webhookToken;
      if (args.provider === "bricklink" && !webhookToken) {
        webhookToken = generateWebhookToken();
      }

      const patchData: {
        [key: string]: unknown;
        isActive: boolean;
        updatedAt: number;
        validationStatus: "pending";
        validationMessage: undefined;
        lastValidatedAt: undefined;
        webhookToken?: string;
      } = {
        ...encryptedData,
        isActive: true,
        updatedAt: now,
        // Reset validation status on update
        validationStatus: "pending",
        validationMessage: undefined,
        lastValidatedAt: undefined,
      };

      // Always include webhookToken for BrickLink if it exists or was generated
      if (args.provider === "bricklink") {
        patchData.webhookToken = webhookToken;
      }

      await ctx.db.patch(existing._id, patchData);
      credentialId = existing._id;
    } else {
      // Create new credentials
      // Generate webhook token for BrickLink
      const webhookToken = args.provider === "bricklink" ? generateWebhookToken() : undefined;

      credentialId = await ctx.db.insert("marketplaceCredentials", {
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
    }

    return { success: true, credentialId };
  },
});

/**
 * Revoke marketplace credentials (hard delete)
 */
export const revokeCredentials = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const existing = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      throw new ConvexError(`No credentials found for ${args.provider}`);
    }

    // Hard delete - completely remove credentials from database
    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Get encrypted credentials (internal only - never exposed to client)
 */
export const getEncryptedCredentials = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

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

/**
 * Update validation status (internal only)
 */
export const updateValidationStatus = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    success: v.boolean(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

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

/**
 * Get quota state for a business account and provider
 */
export const getQuotaState = internalQuery({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const quota = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    // Return defaults if no quota record exists
    if (!quota) {
      const config = getRateLimitConfig(args.provider);
      return {
        windowStart: Date.now(),
        requestCount: 0,
        capacity: config.capacity,
        windowDurationMs: config.windowDurationMs,
        alertThreshold: config.alertThreshold,
        alertEmitted: false,
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined as number | undefined,
      };
    }

    return {
      windowStart: quota.windowStart,
      requestCount: quota.requestCount,
      capacity: quota.capacity,
      windowDurationMs: quota.windowDurationMs,
      alertThreshold: quota.alertThreshold,
      alertEmitted: quota.alertEmitted,
      consecutiveFailures: quota.consecutiveFailures,
      circuitBreakerOpenUntil: quota.circuitBreakerOpenUntil,
    };
  },
});

/**
 * Increment quota counter for a business account
 */
export const incrementQuota = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    // Initialize if first request
    if (!existing) {
      // Get provider-specific rate limit configuration
      const config = getRateLimitConfig(args.provider);

      await ctx.db.insert("marketplaceRateLimits", {
        businessAccountId: args.businessAccountId,
        provider: args.provider,
        windowStart: now,
        requestCount: 1,
        capacity: config.capacity,
        windowDurationMs: config.windowDurationMs,
        alertThreshold: config.alertThreshold,
        alertEmitted: false,
        consecutiveFailures: 0,
        lastRequestAt: now,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    // Check if window expired
    const windowElapsed = now - existing.windowStart;
    if (windowElapsed >= existing.windowDurationMs) {
      // Reset window
      await ctx.db.patch(existing._id, {
        windowStart: now,
        requestCount: 1,
        alertEmitted: false,
        consecutiveFailures: 0, // Reset failures on new window
        circuitBreakerOpenUntil: undefined,
        lastRequestAt: now,
        lastResetAt: now,
        updatedAt: now,
      });
      return;
    }

    // Increment counter
    const newCount = existing.requestCount + 1;
    const percentage = newCount / existing.capacity;

    // Check alert threshold
    const shouldAlert = percentage >= existing.alertThreshold && !existing.alertEmitted;

    await ctx.db.patch(existing._id, {
      requestCount: newCount,
      alertEmitted: shouldAlert ? true : existing.alertEmitted,
      lastRequestAt: now,
      updatedAt: now,
    });

    // Emit alert metric
    if (shouldAlert) {
      // Note: recordMetric is not available in mutations, so we just set the flag
      // The alert will be logged when checked in the action
    }
  },
});

/**
 * Record API failure for circuit breaker tracking
 */
export const recordFailure = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!existing) {
      // Initialize with failure count
      const now = Date.now();
      const config = getRateLimitConfig(args.provider);

      await ctx.db.insert("marketplaceRateLimits", {
        businessAccountId: args.businessAccountId,
        provider: args.provider,
        windowStart: now,
        requestCount: 0,
        capacity: config.capacity,
        windowDurationMs: config.windowDurationMs,
        alertThreshold: config.alertThreshold,
        alertEmitted: false,
        consecutiveFailures: 1,
        lastRequestAt: now,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    const newFailures = existing.consecutiveFailures + 1;
    const now = Date.now();

    // Open circuit breaker after 5 consecutive failures
    const updates: {
      consecutiveFailures: number;
      updatedAt: number;
      circuitBreakerOpenUntil?: number;
    } = {
      consecutiveFailures: newFailures,
      updatedAt: now,
    };

    if (newFailures >= 5) {
      updates.circuitBreakerOpenUntil = now + 5 * 60 * 1000; // 5 minutes
    }

    await ctx.db.patch(existing._id, updates);
  },
});

/**
 * Reset consecutive failures counter (called on successful request)
 */
export const resetFailures = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("marketplaceRateLimits")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (existing && existing.consecutiveFailures > 0) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        circuitBreakerOpenUntil: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Get list of configured marketplace providers for a business account
 * Internal query for use by sync orchestration (Story 3.4)
 */
export const getConfiguredProviders = internalQuery({
  args: { businessAccountId: v.id("businessAccounts") },
  handler: async (ctx, { businessAccountId }) => {
    const providers: Array<"bricklink" | "brickowl"> = [];

    // Check BrickLink credentials
    const bricklinkCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", "bricklink"),
      )
      .first();

    if (bricklinkCreds?.isActive && bricklinkCreds?.syncEnabled !== false) {
      providers.push("bricklink");
    }

    // Check BrickOwl credentials
    const brickowlCreds = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", "brickowl"),
      )
      .first();

    if (brickowlCreds?.isActive && brickowlCreds?.syncEnabled !== false) {
      providers.push("brickowl");
    }

    return providers; // Returns: [], ["bricklink"], ["brickowl"], or ["bricklink", "brickowl"]
  },
});

/**
 * Update sync settings for a marketplace provider
 */
export const updateSyncSettings = mutation({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    syncEnabled: v.optional(v.boolean()),
    ordersSyncEnabled: v.optional(v.boolean()),
    inventorySyncEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", args.provider),
      )
      .first();

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

/**
 * Update webhook registration status metadata for a credential
 */
export const updateWebhookStatus = internalMutation({
  args: {
    businessAccountId: v.id("businessAccounts"),
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
    status: v.union(
      v.literal("unconfigured"),
      v.literal("registering"),
      v.literal("registered"),
      v.literal("disabled"),
      v.literal("error"),
    ),
    endpoint: v.optional(v.string()),
    clearEndpoint: v.optional(v.boolean()),
    registeredAt: v.optional(v.number()),
    lastCheckedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    clearError: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", args.businessAccountId).eq("provider", args.provider),
      )
      .first();

    if (!credential) {
      return;
    }

    const patch: Record<string, unknown> = {
      webhookStatus: args.status,
      updatedAt: Date.now(),
    };

    if (args.endpoint !== undefined) {
      patch.webhookEndpoint = args.endpoint;
    } else if (args.clearEndpoint) {
      patch.webhookEndpoint = undefined;
    }

    if (args.registeredAt !== undefined) {
      patch.webhookRegisteredAt = args.registeredAt;
    } else if (args.clearEndpoint) {
      patch.webhookRegisteredAt = undefined;
    }

    if (args.lastCheckedAt !== undefined) {
      patch.webhookLastCheckedAt = args.lastCheckedAt;
    } else {
      patch.webhookLastCheckedAt = Date.now();
    }

    if (args.metadata !== undefined) {
      patch.webhookMetadata = args.metadata;
    }

    if (args.error !== undefined) {
      patch.webhookLastError = args.error;
    } else if (args.clearError) {
      patch.webhookLastError = undefined;
    }

    await ctx.db.patch(credential._id, patch);
  },
});
