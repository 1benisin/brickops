import type { GenericMutationCtx } from "convex/server";

import type { DataModel } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { ConvexError } from "convex/values";

import { checkAndConsumeRateLimitDirect } from "../dbRateLimiter";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SHARD_COUNT = 4;

const BRICKLINK_LIMITS = {
  day: {
    key: "bricklink:global:day",
    kind: "bricklink:day",
    limit: 5_000,
    windowMs: DAY_MS,
  },
  minute: {
    key: "bricklink:global:minute",
    kind: "bricklink:minute",
    limit: 60,
    windowMs: MINUTE_MS,
  },
} as const;

export type BricklinkQuotaContext = MutationCtx | GenericMutationCtx<DataModel>;

export type ConsumeQuotaOptions = {
  tokens?: number;
  identity?: string;
  reserve?: boolean;
};

export type QuotaResult = {
  allowed: boolean;
  retryAfterMs: number | null;
};

export class BricklinkQuotaExceededError extends ConvexError<{ retryAfterMs: number }> {
  readonly retryAfterMs: number;

  constructor(context: string, retryAfterMs: number | null) {
    super({ retryAfterMs: retryAfterMs ?? 0 });
    this.retryAfterMs = retryAfterMs ?? 0;
    this.message = `${context} blocked by Bricklink quota; retry after ${Math.ceil((retryAfterMs ?? 0) / 1000)} seconds`;
  }
}

async function consumeLimit(
  ctx: BricklinkQuotaContext,
  limit: (typeof BRICKLINK_LIMITS)[keyof typeof BRICKLINK_LIMITS],
  {
    reserve = false,
    identity,
  }: {
    reserve?: boolean;
    identity?: string;
  },
): Promise<QuotaResult> {
  const key = shardKey(limit.key, identity);
  const { allowed, retryAfterMs } = await checkAndConsumeRateLimitDirect(ctx, {
    key,
    kind: limit.kind,
    limit: limit.limit,
    windowMs: limit.windowMs,
  });

  if (allowed) {
    return { allowed: true, retryAfterMs: null };
  }

  if (!reserve) {
    return {
      allowed: false,
      retryAfterMs: retryAfterMs ?? limit.windowMs,
    };
  }

  return {
    allowed: false,
    retryAfterMs: retryAfterMs ?? limit.windowMs,
  };
}

function shardKey(baseKey: string, identity?: string) {
  if (!identity) {
    return baseKey;
  }
  const hash = Math.abs(hashString(identity));
  const shard = hash % SHARD_COUNT;
  return `${baseKey}:shard-${shard}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export async function consumeBricklinkQuota(
  ctx: BricklinkQuotaContext,
  options: ConsumeQuotaOptions = {},
): Promise<QuotaResult> {
  const tokens = Math.max(1, Math.floor(options.tokens ?? 1));
  const results: QuotaResult[] = [];

  for (let i = 0; i < tokens; i++) {
    const dayResult = await consumeLimit(ctx, BRICKLINK_LIMITS.day, {
      reserve: options.reserve,
      identity: options.identity,
    });
    if (!dayResult.allowed) {
      return dayResult;
    }

    const minuteResult = await consumeLimit(ctx, BRICKLINK_LIMITS.minute, {
      reserve: options.reserve,
      identity: options.identity,
    });
    if (!minuteResult.allowed) {
      return minuteResult;
    }

    results.push(minuteResult);
  }

  if (results.some((r) => !r.allowed)) {
    return results.find((r) => !r.allowed)!;
  }

  return { allowed: true, retryAfterMs: null };
}

export function requireQuotaSuccess(result: QuotaResult, context: string): void {
  if (!result.allowed) {
    throw new BricklinkQuotaExceededError(context, result.retryAfterMs);
  }
}
