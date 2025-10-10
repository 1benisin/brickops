/**
 * Marketplace Credentials Management
 * BYOK (Bring Your Own Key) model for BrickLink and BrickOwl API credentials
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  query,
  action,
  MutationCtx,
  QueryCtx,
  internalMutation,
  internalQuery,
  ActionCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { encryptCredential, decryptCredential } from "../lib/encryption";
import { api, internal } from "../_generated/api";
import { BricklinkStoreClient } from "../bricklink/storeClient";
import { BrickOwlStoreClient } from "../brickowl/storeClient";
import { getRateLimitConfig } from "../marketplaces/rateLimitConfig";

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
      await ctx.db.patch(existing._id, {
        ...encryptedData,
        isActive: true,
        updatedAt: now,
        // Reset validation status on update
        validationStatus: "pending",
        validationMessage: undefined,
        lastValidatedAt: undefined,
      });
      credentialId = existing._id;
    } else {
      // Create new credentials
      credentialId = await ctx.db.insert("marketplaceCredentials", {
        businessAccountId,
        provider: args.provider,
        ...encryptedData,
        isActive: true,
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

/**
 * Get credential status (non-sensitive data only)
 */
export const getCredentialStatus = query({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credential = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_business_provider", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("provider", args.provider),
      )
      .first();

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
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      // Mask credentials for display
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

/**
 * Get all credential statuses for a business
 */
export const getAllCredentialStatuses = query({
  args: {},
  handler: async (ctx) => {
    const { businessAccountId } = await requireOwner(ctx);

    const credentials = await ctx.db
      .query("marketplaceCredentials")
      .withIndex("by_businessAccount", (q) => q.eq("businessAccountId", businessAccountId))
      .collect();

    return credentials.map((cred) => ({
      provider: cred.provider,
      configured: true,
      isActive: cred.isActive,
      lastValidatedAt: cred.lastValidatedAt,
      validationStatus: cred.validationStatus,
      validationMessage: cred.validationMessage,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    }));
  },
});

/**
 * Test connection to marketplace API
 * This is a lightweight validation - more comprehensive validation will be added in stories 3.2 and 3.3
 */
export const testConnection = action({
  args: {
    provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  },
  handler: async (ctx, args) => {
    // Check feature flag to disable external calls in dev/test
    if (process.env.DISABLE_EXTERNAL_CALLS === "true") {
      // Mock success for testing
      return {
        success: true,
        message: "Test mode: external calls disabled",
        provider: args.provider,
      };
    }

    // Get credentials via query (this will check owner permission)
    const status = await ctx.runQuery(api.functions.marketplace.getCredentialStatus, {
      provider: args.provider,
    });

    if (!status.configured || !status.isActive) {
      return {
        success: false,
        message: "Credentials not configured or inactive",
        provider: args.provider,
      };
    }

    // Get actual credentials from database (server-side only)
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("Authentication required");
    }

    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {});
    const businessAccountId = user.businessAccount._id;

    // Fetch encrypted credentials directly
    const credential = await ctx.runQuery(internal.functions.marketplace.getEncryptedCredentials, {
      businessAccountId,
      provider: args.provider,
    });

    if (!credential) {
      return {
        success: false,
        message: "Credentials not found",
        provider: args.provider,
      };
    }

    // Decrypt and test connection
    try {
      if (args.provider === "bricklink") {
        const bricklinkConsumerKey = await decryptCredential(credential.bricklinkConsumerKey!);
        const bricklinkConsumerSecret = await decryptCredential(
          credential.bricklinkConsumerSecret!,
        );
        const bricklinkTokenValue = await decryptCredential(credential.bricklinkTokenValue!);
        const bricklinkTokenSecret = await decryptCredential(credential.bricklinkTokenSecret!);

        // Test with BrickLink colors endpoint (lightweight)
        // OAuth 1.0a signing will be implemented with proper library
        // For now, just validate we have the credentials
        const testResult = await testBrickLinkConnection({
          bricklinkConsumerKey,
          bricklinkConsumerSecret,
          bricklinkTokenValue,
          bricklinkTokenSecret,
        });

        // Update validation status
        await ctx.runMutation(internal.functions.marketplace.updateValidationStatus, {
          businessAccountId,
          provider: args.provider,
          success: testResult.success,
          message: testResult.message,
        });

        return testResult;
      } else if (args.provider === "brickowl") {
        const brickowlApiKey = await decryptCredential(credential.brickowlApiKey!);

        // Test with BrickOwl inventory list endpoint
        const testResult = await testBrickOwlConnection(brickowlApiKey);

        // Update validation status
        await ctx.runMutation(internal.functions.marketplace.updateValidationStatus, {
          businessAccountId,
          provider: args.provider,
          success: testResult.success,
          message: testResult.message,
        });

        return testResult;
      }

      return {
        success: false,
        message: "Unknown provider",
        provider: args.provider,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed";

      // Update validation status
      await ctx.runMutation(internal.functions.marketplace.updateValidationStatus, {
        businessAccountId,
        provider: args.provider,
        success: false,
        message,
      });

      return {
        success: false,
        message,
        provider: args.provider,
      };
    }
  },
});

/**
 * Test BrickLink API connection
 * NOTE: Full OAuth 1.0a implementation will be added in Story 3.2
 */
async function testBrickLinkConnection(credentials: {
  bricklinkConsumerKey: string;
  bricklinkConsumerSecret: string;
  bricklinkTokenValue: string;
  bricklinkTokenSecret: string;
}): Promise<{ success: boolean; message: string; provider: string }> {
  // Placeholder for OAuth 1.0a signed request
  // Story 3.2 will implement full BrickLink client with oauth-1.0a library

  // For now, validate that we have all required credentials
  if (
    !credentials.bricklinkConsumerKey ||
    !credentials.bricklinkConsumerSecret ||
    !credentials.bricklinkTokenValue ||
    !credentials.bricklinkTokenSecret
  ) {
    return {
      success: false,
      message: "Missing required BrickLink credentials",
      provider: "bricklink",
    };
  }

  // TODO: Story 3.2 - Implement actual OAuth 1.0a signed request to /api/store/v1/colors

  return {
    success: true,
    message: "Credentials validated (placeholder - full validation in Story 3.2)",
    provider: "bricklink",
  };
}

/**
 * Test BrickOwl API connection
 * NOTE: Full implementation will be added in Story 3.3
 */
async function testBrickOwlConnection(brickowlApiKey: string): Promise<{
  success: boolean;
  message: string;
  provider: string;
}> {
  // Placeholder for BrickOwl API test
  // Story 3.3 will implement full BrickOwl client

  if (!brickowlApiKey) {
    return {
      success: false,
      message: "Missing BrickOwl API key",
      provider: "brickowl",
    };
  }

  // TODO: Story 3.3 - Implement actual API call to /v1/inventory/list

  return {
    success: true,
    message: "API key validated (placeholder - full validation in Story 3.3)",
    provider: "brickowl",
  };
}

/**
 * Internal mutations and queries
 * Export as named exports that will be picked up by internal API
 */

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
 * Rate Limiting Functions (Story 3.2)
 */

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
 * Create BrickLink Store Client with user credentials
 * Helper function for use within actions
 */
export async function createBricklinkStoreClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BricklinkStoreClient> {
  // Get encrypted credentials
  const credentials = await ctx.runQuery(internal.functions.marketplace.getEncryptedCredentials, {
    businessAccountId,
    provider: "bricklink",
  });

  if (!credentials) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickLink credentials not configured. Please add your credentials in Settings.",
    });
  }

  // Decrypt credentials
  const decryptedCreds = {
    consumerKey: await decryptCredential(credentials.bricklinkConsumerKey!),
    consumerSecret: await decryptCredential(credentials.bricklinkConsumerSecret!),
    tokenValue: await decryptCredential(credentials.bricklinkTokenValue!),
    tokenSecret: await decryptCredential(credentials.bricklinkTokenSecret!),
  };

  // Create and return client instance with ActionCtx for DB rate limiting
  return new BricklinkStoreClient(decryptedCreds, businessAccountId, ctx);
}

/**
 * Create BrickOwl Store Client with user credentials
 * Helper function for use within actions
 */
export async function createBrickOwlStoreClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlStoreClient> {
  // Get encrypted credentials
  const credentials = await ctx.runQuery(internal.functions.marketplace.getEncryptedCredentials, {
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
