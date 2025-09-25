import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type RateLimitArgs = {
  key: string; // e.g., ba:{id}:invite_create, email:{addr}:invite_create, token:{token}:invite_redeem
  kind: string; // e.g., invite_create, invite_redeem
  limit: number;
  windowMs: number;
};

export type RateLimitResult = { allowed: boolean; remaining: number };

/**
 * Direct rate limit helper usable within any Convex mutation context.
 * Implements a simple sliding window counter using the `rateLimitEvents` table.
 */
export async function checkAndConsumeRateLimitDirect(
  ctx: MutationCtx | GenericMutationCtx<DataModel>,
  args: RateLimitArgs,
): Promise<RateLimitResult> {
  const now = Date.now();
  const since = now - args.windowMs;

  // Query events and prune old entries in a single flow
  const events = await ctx.db
    .query("rateLimitEvents")
    .withIndex("by_key_kind", (q) => q.eq("key", args.key).eq("kind", args.kind))
    .collect();

  const inWindow = events.filter((e) => e.createdAt >= since);
  if (inWindow.length >= args.limit) {
    return { allowed: false, remaining: 0 } as const;
  }

  await ctx.db.insert("rateLimitEvents", {
    key: args.key,
    kind: args.kind,
    createdAt: now,
  });

  // Opportunistic pruning: remove entries older than current window for this key/kind
  // Best-effort only; ignore failures
  const oldEntries = events.filter((e) => e.createdAt < since);
  await Promise.all(
    oldEntries.map(async (e) => {
      try {
        await ctx.db.delete(e._id);
      } catch {
        // ignore
      }
    }),
  );

  return { allowed: true, remaining: Math.max(0, args.limit - (inWindow.length + 1)) } as const;
}
