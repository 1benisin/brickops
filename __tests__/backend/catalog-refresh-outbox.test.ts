/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ConvexError } from "convex/values";

import { enqueueCatalogRefresh } from "@/convex/catalog/mutations";
import {
  getPendingOutboxMessages,
  markOutboxInflight,
  markOutboxSucceeded,
  markOutboxFailed,
} from "@/convex/catalog/refreshWorker";
import { getOutboxMessage } from "@/convex/catalog/queries";
import {
  enqueueRefreshPart,
  enqueueRefreshPartColors,
  enqueueRefreshPriceGuide,
} from "@/convex/catalog/actions";
import {
  buildSeedData,
  createConvexTestContext,
  createTestIdentity,
} from "@/test-utils/convex-test-context";

describe("catalog refresh outbox", () => {
  const businessAccountId = "businessAccounts:1";
  const userId = "users:1";

  const baseSeed = buildSeedData({
    businessAccounts: [
      {
        _id: businessAccountId,
        name: "BrickOps",
        ownerUserId: userId,
        inviteCode: "abc12345",
        createdAt: Date.now(),
      },
    ],
    users: [
      {
        _id: userId,
        businessAccountId,
        email: "test@example.com",
        role: "owner",
        firstName: "Test",
        lastName: "User",
        name: "Test User",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    parts: [
      {
        _id: "parts:1",
        no: "3001",
        name: "Brick 2 x 4",
        type: "PART" as const,
        lastFetched: Date.now() - 35 * 24 * 60 * 60 * 1000, // 35 days ago (stale)
        createdAt: Date.now(),
      },
    ],
    partColors: [
      {
        _id: "partColors:1",
        partNo: "3001",
        colorId: 1,
        quantity: 100,
        lastFetched: Date.now() - 35 * 24 * 60 * 60 * 1000, // 35 days ago (stale)
        createdAt: Date.now(),
      },
    ],
    partPrices: [
      {
        _id: "partPrices:1",
        partNo: "3001",
        partType: "PART" as const,
        colorId: 1,
        newOrUsed: "N" as const,
        currencyCode: "USD",
        guideType: "stock" as const,
        lastFetched: Date.now() - 35 * 24 * 60 * 60 * 1000, // 35 days ago (stale)
        createdAt: Date.now(),
      },
    ],
  });

  describe("enqueueCatalogRefresh mutation", () => {
    it("creates a new outbox message for parts", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      const now = Date.now();
      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        lastFetched: baseSeed.parts[0].lastFetched,
        priority: 1,
      });

      // Verify message was created
      const message = await (getOutboxMessage as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
      });

      expect(message).toBeTruthy();
      expect(message?.tableName).toBe("parts");
      expect(message?.primaryKey).toBe("3001");
      expect(message?.status).toBe("pending");
      expect(message?.attempt).toBe(0);
      expect(message?.nextAttemptAt).toBeGreaterThanOrEqual(now);
      expect(message?.priority).toBe(1);
    });

    it("prevents duplicate outbox messages (idempotent)", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      // Create first message
      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        lastFetched: baseSeed.parts[0].lastFetched,
        priority: 1,
      });

      // Try to create duplicate
      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        lastFetched: baseSeed.parts[0].lastFetched,
        priority: 1,
      });

      // Should only have one message
      const messages = await ctx.db.query("catalogRefreshOutbox").collect();
      expect(messages.length).toBe(1);
    });

    it("allows new message if previous one succeeded", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      // Create and mark as succeeded
      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        lastFetched: baseSeed.parts[0].lastFetched,
        priority: 1,
      });

      const message = await (getOutboxMessage as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
      });

      if (message) {
        await (markOutboxSucceeded as any)._handler(ctx, {
          messageId: message._id,
        });
      }

      // Now should allow new message
      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        lastFetched: Date.now(),
        priority: 1,
      });

      const messages = await ctx.db
        .query("catalogRefreshOutbox")
        .filter((q: any) => q.eq(q.field("status"), "pending"))
        .collect();
      expect(messages.length).toBe(1);
    });

    it("creates message with correct recordId for partPrices", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      await (enqueueCatalogRefresh as any)._handler(ctx, {
        tableName: "partPrices",
        primaryKey: "3001",
        secondaryKey: "1",
        lastFetched: Date.now() - 1000,
        priority: 1,
      });

      const messages = await ctx.db.query("catalogRefreshOutbox").collect();
      expect(messages.length).toBe(1);
      expect(messages[0].recordId).toBe("3001:1");
    });
  });

  describe("worker queries", () => {
    it("getPendingOutboxMessages returns messages ready for processing", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      const now = Date.now();

      // Create messages with different nextAttemptAt times
      await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        recordId: "3001",
        priority: 1,
        status: "pending",
        attempt: 0,
        nextAttemptAt: now - 1000, // Ready for processing
        createdAt: now,
      });

      await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3002",
        secondaryKey: undefined,
        recordId: "3002",
        priority: 1,
        status: "pending",
        attempt: 0,
        nextAttemptAt: now + 1000, // Not ready yet
        createdAt: now,
      });

      const pending = await (getPendingOutboxMessages as any)._handler(ctx, {
        maxNextAttemptAt: now,
      });

      expect(pending.length).toBe(1);
      expect(pending[0].primaryKey).toBe("3001");
    });

    it("markOutboxInflight uses CAS pattern to prevent double processing", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      const now = Date.now();
      const messageId = await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        recordId: "3001",
        priority: 1,
        status: "pending",
        attempt: 0,
        nextAttemptAt: now,
        createdAt: now,
      });

      // First attempt should succeed
      const result1 = await (markOutboxInflight as any)._handler(ctx, {
        messageId,
        currentAttempt: 0,
      });

      expect(result1.success).toBe(true);

      // Second attempt with same attempt number should fail (already inflight)
      const result2 = await (markOutboxInflight as any)._handler(ctx, {
        messageId,
        currentAttempt: 0,
      });

      expect(result2.success).toBe(false);
      expect(result2.reason).toBe("Message state changed");
    });

    it("markOutboxFailed schedules retry with correct attempt number", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      const now = Date.now();
      const messageId = await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        recordId: "3001",
        priority: 1,
        status: "inflight",
        attempt: 1,
        nextAttemptAt: now,
        createdAt: now,
      });

      const nextAttempt = now + 5000;
      await (markOutboxFailed as any)._handler(ctx, {
        messageId,
        attempt: 2,
        nextAttemptAt: nextAttempt,
        error: "API_ERROR: Rate limit exceeded",
      });

      const message = await ctx.db.get(messageId);
      expect(message?.status).toBe("pending");
      expect(message?.attempt).toBe(2);
      expect(message?.nextAttemptAt).toBe(nextAttempt);
      expect(message?.lastError).toBe("API_ERROR: Rate limit exceeded");
    });

    it("markOutboxSucceeded marks message as succeeded", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
      });

      const now = Date.now();
      const messageId = await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        recordId: "3001",
        priority: 1,
        status: "inflight",
        attempt: 1,
        nextAttemptAt: now,
        createdAt: now,
      });

      await (markOutboxSucceeded as any)._handler(ctx, {
        messageId,
      });

      const message = await ctx.db.get(messageId);
      expect(message?.status).toBe("succeeded");
      expect(message?.processedAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe("enqueue actions", () => {
    it("enqueueRefreshPart creates outbox message for authenticated user", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${userId}|session-001` }),
      });

      // Mock runQuery and runMutation for action context
      const runQuery = vi.fn(async (query: any, args: any) => {
        if (query === (getOutboxMessage as any)) {
          return null; // No existing message
        }
        // Import helper for getPartInternal
        const { getPartInternal } = await import("@/convex/catalog/queries");
        if (query === (getPartInternal as any)) {
          return baseSeed.parts[0];
        }
        return null;
      });

      const runMutation = vi.fn(async (mutation: any, args: any) => {
        // Execute mutation directly
        if (mutation === (enqueueCatalogRefresh as any)) {
          return await (enqueueCatalogRefresh as any)._handler(
            createConvexTestContext({ seed: baseSeed }),
            args,
          );
        }
        return null;
      });

      const actionCtx = {
        ...ctx,
        runQuery,
        runMutation,
        auth: {
          getUserIdentity: async () => createTestIdentity({ subject: `${userId}|session-001` }),
        },
      } as any;

      await (enqueueRefreshPart as any)._handler(actionCtx, {
        partNumber: "3001",
      });

      // Verify mutation was called
      expect(runMutation).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          tableName: "parts",
          primaryKey: "3001",
        }),
      );
    });

    it("enqueueRefreshPart requires authentication", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        // No identity provided
      });

      const runQuery = vi.fn();
      const runMutation = vi.fn();
      const actionCtx = {
        ...ctx,
        runQuery,
        runMutation,
        auth: {
          getUserIdentity: async () => null, // Not authenticated
        },
      } as any;

      await expect(
        (enqueueRefreshPart as any)._handler(actionCtx, {
          partNumber: "3001",
        }),
      ).rejects.toThrow(ConvexError);

      expect(runMutation).not.toHaveBeenCalled();
    });

    it("enqueueRefreshPart skips if already queued", async () => {
      const ctx = createConvexTestContext({
        seed: baseSeed,
        identity: createTestIdentity({ subject: `${userId}|session-001` }),
      });

      // Create existing message
      await ctx.db.insert("catalogRefreshOutbox", {
        tableName: "parts",
        primaryKey: "3001",
        secondaryKey: undefined,
        recordId: "3001",
        priority: 1,
        status: "pending",
        attempt: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
      });

      const runQuery = vi.fn(async (query: any, args: any) => {
        if (query === (getOutboxMessage as any)) {
          return await (getOutboxMessage as any)._handler(ctx, args);
        }
        return baseSeed.parts[0];
      });

      const runMutation = vi.fn();
      const actionCtx = {
        ...ctx,
        runQuery,
        runMutation,
        auth: {
          getUserIdentity: async () => createTestIdentity({ subject: `${userId}|session-001` }),
        },
      } as any;

      await (enqueueRefreshPart as any)._handler(actionCtx, {
        partNumber: "3001",
      });

      // Should not create duplicate
      expect(runMutation).not.toHaveBeenCalled();
    });
  });
});
