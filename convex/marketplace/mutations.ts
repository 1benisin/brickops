import { getAuthUserId } from "@convex-dev/auth/server";
import {
  mutation,
  MutationCtx,
  QueryCtx,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { encryptCredential } from "../lib/encryption";
import { getRateLimitConfig } from "./rateLimitConfig";
import { randomHex } from "../lib/webcrypto";
import { requireUser, assertBusinessMembership } from "../inventory/helpers";

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
    syncEnabled: v.boolean(),
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

    await ctx.db.patch(credentials._id, {
      syncEnabled: args.syncEnabled,
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Get sync settings for all configured providers
 */
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
      syncEnabled: cred.syncEnabled ?? true, // Default to true
      isActive: cred.isActive,
    }));
  },
});

/**
 * Mark an order item as picked and update inventory reserved quantity
 * Only updates reserved quantity, not available quantity (already decreased during order ingestion)
 */
export const markOrderItemAsPicked = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
    inventoryItemId: v.id("inventoryItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already picked
    if (orderItem.status === "picked") {
      throw new ConvexError("Order item already picked");
    }

    // Get inventory item
    const inventoryItem = await ctx.db.get(args.inventoryItemId);
    if (!inventoryItem) {
      throw new ConvexError("Inventory item not found");
    }

    // Verify inventory item matches order item
    if (
      inventoryItem.partNumber !== orderItem.itemNo ||
      inventoryItem.colorId !== orderItem.colorId.toString() ||
      inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
    ) {
      throw new ConvexError("Inventory item does not match order item");
    }

    const quantityToPick = orderItem.quantity;
    const now = Date.now();

    // Update order item
    await ctx.db.patch(args.orderItemId, {
      status: "picked",
      updatedAt: now,
    });

    // Update inventory reserved quantity (decrease)
    // If insufficient reserved quantity, set to 0 (don't go negative)
    const newReservedQuantity = Math.max(0, inventoryItem.quantityReserved - quantityToPick);

    await ctx.db.patch(args.inventoryItemId, {
      quantityReserved: newReservedQuantity,
      updatedAt: now,
    });

    // Note: We do NOT update quantityAvailable here
    // It was already decreased during order ingestion

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityPicked: quantityToPick,
    };
  },
});

/**
 * Update order status to "Packed" if all items are picked
 * Called after each item is picked
 */
export const updateOrderStatusIfFullyPicked = mutation({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;

    // Get order
    const order = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .first();

    if (!order) {
      throw new ConvexError("Order not found");
    }

    // Get all order items
    const orderItems = await ctx.db
      .query("bricklinkOrderItems")
      .withIndex("by_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", args.orderId),
      )
      .collect();

    // Check if all items are picked
    const allPicked = orderItems.length > 0 && orderItems.every((item) => item.status === "picked");

    // Update status if fully picked and currently "Paid"
    if (allPicked && order.status === "Paid") {
      await ctx.db.patch(order._id, {
        status: "Packed",
        updatedAt: Date.now(),
      });

      return { updated: true, newStatus: "Packed" };
    }

    return { updated: false, currentStatus: order.status };
  },
});

/**
 * Mark an order item as having an issue and update inventory reserved quantity
 * Only updates reserved quantity, not available quantity (already decreased during order ingestion)
 */
export const markOrderItemAsIssue = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
    inventoryItemId: v.id("inventoryItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already issue
    if (orderItem.status === "issue") {
      throw new ConvexError("Order item already marked as issue");
    }

    // Get inventory item
    const inventoryItem = await ctx.db.get(args.inventoryItemId);
    if (!inventoryItem) {
      throw new ConvexError("Inventory item not found");
    }

    // Verify inventory item matches order item
    if (
      inventoryItem.partNumber !== orderItem.itemNo ||
      inventoryItem.colorId !== orderItem.colorId.toString() ||
      inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
    ) {
      throw new ConvexError("Inventory item does not match order item");
    }

    const quantityToPick = orderItem.quantity;
    const now = Date.now();

    // Update order item
    await ctx.db.patch(args.orderItemId, {
      status: "issue",
      updatedAt: now,
    });

    // Update inventory reserved quantity (decrease)
    // If insufficient reserved quantity, set to 0 (don't go negative)
    const newReservedQuantity = Math.max(0, inventoryItem.quantityReserved - quantityToPick);

    await ctx.db.patch(args.inventoryItemId, {
      quantityReserved: newReservedQuantity,
      updatedAt: now,
    });

    // Note: We do NOT update quantityAvailable here
    // It was already decreased during order ingestion

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityPicked: quantityToPick,
    };
  },
});

/**
 * Mark an order item as skipped
 */
export const markOrderItemAsSkipped = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    const now = Date.now();

    // Update order item status
    await ctx.db.patch(args.orderItemId, {
      status: "skipped",
      updatedAt: now,
    });

    return {
      success: true,
      orderItemId: args.orderItemId,
      status: "skipped",
    };
  },
});

/**
 * Mark an order item as unpicked and restore inventory reserved quantity if it was picked or issue
 * Only restores reserved quantity if the item was previously "picked" or "issue" (not skipped)
 */
export const markOrderItemAsUnpicked = mutation({
  args: {
    orderItemId: v.id("bricklinkOrderItems"),
    inventoryItemId: v.optional(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);

    // Get order item
    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) {
      throw new ConvexError("Order item not found");
    }

    // Verify user has access
    assertBusinessMembership(user, orderItem.businessAccountId);

    // Check if already unpicked
    if (orderItem.status === "unpicked") {
      throw new ConvexError("Order item already unpicked");
    }

    const wasPicked = orderItem.status === "picked" || orderItem.status === "issue";
    const now = Date.now();

    // Update order item status to unpicked
    await ctx.db.patch(args.orderItemId, {
      status: "unpicked",
      updatedAt: now,
    });

    // If item was picked or issue, restore reserved quantity
    if (wasPicked && args.inventoryItemId) {
      const inventoryItem = await ctx.db.get(args.inventoryItemId);
      if (!inventoryItem) {
        throw new ConvexError("Inventory item not found");
      }

      // Verify inventory item matches order item
      if (
        inventoryItem.partNumber !== orderItem.itemNo ||
        inventoryItem.colorId !== orderItem.colorId.toString() ||
        inventoryItem.condition !== (orderItem.newOrUsed === "N" ? "new" : "used")
      ) {
        throw new ConvexError("Inventory item does not match order item");
      }

      const quantityToRestore = orderItem.quantity;

      // Increase reserved quantity (restore what was reserved)
      await ctx.db.patch(args.inventoryItemId, {
        quantityReserved: inventoryItem.quantityReserved + quantityToRestore,
        updatedAt: now,
      });
    }

    // Check if order status needs to be reverted from "Packed" to "Paid"
    // if we unpicked an item from a fully picked order
    const businessAccountId = user.businessAccountId as Id<"businessAccounts">;
    const order = await ctx.db
      .query("bricklinkOrders")
      .withIndex("by_business_order", (q) =>
        q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
      )
      .first();

    if (order && order.status === "Packed") {
      // Check if all items are still picked
      const orderItems = await ctx.db
        .query("bricklinkOrderItems")
        .withIndex("by_order", (q) =>
          q.eq("businessAccountId", businessAccountId).eq("orderId", orderItem.orderId),
        )
        .collect();

      const allPicked = orderItems.length > 0 && orderItems.every((item) => item.status === "picked");

      // If not all items are picked, revert status to "Paid"
      if (!allPicked) {
        await ctx.db.patch(order._id, {
          status: "Paid",
          updatedAt: now,
        });
      }
    }

    return {
      success: true,
      orderItemId: args.orderItemId,
      inventoryItemId: args.inventoryItemId,
      quantityRestored: wasPicked ? orderItem.quantity : 0,
    };
  },
});
