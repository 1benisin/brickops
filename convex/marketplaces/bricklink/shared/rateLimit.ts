import type { Id } from "../../../_generated/dataModel";

const ACCOUNT_BUCKET_PREFIX = "bricklink:account";
const GLOBAL_BUCKET = "bricklink:global";

export function blAccountBucket(businessAccountId: Id<"businessAccounts">): string {
  return `${ACCOUNT_BUCKET_PREFIX}:${businessAccountId}`;
}

export function blGlobalBucket(): string {
  return GLOBAL_BUCKET;
}
