import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Provider } from "./rateLimitConfig";

export type RateLimitBucket = string;

export type TakeRateLimitTokenArgs = {
  bucket: RateLimitBucket;
  provider: Provider;
};

type MutationRunnerCtx = Pick<ActionCtx, "runMutation">;

/**
 * Consume a token from the shared rate limit pool.
 *
 * Buckets should use business account identifiers whenever possible.
 * Reserve `brickopsAdmin` for the global BrickOps administrative bucket.
 */
export function takeRateLimitToken(ctx: MutationRunnerCtx, args: TakeRateLimitTokenArgs) {
  return ctx.runMutation(internal.ratelimit.mutations.takeToken, args);
}

