// Helpers that create consistent rate limit bucket keys for BrickLink calls.
import type { Id } from "../../_generated/dataModel";

const ACCOUNT_BUCKET_PREFIX = "bricklink:account";
const GLOBAL_BUCKET = "bricklink:global";

// Build a per-business account bucket id so we can throttle each tenant separately.
export function blAccountBucket(businessAccountId: Id<"businessAccounts">): string {
  return `${ACCOUNT_BUCKET_PREFIX}:${businessAccountId}`;
}

// Shared bucket for BrickLink-wide guardrails, regardless of account.
export function blGlobalBucket(): string {
  return GLOBAL_BUCKET;
}
