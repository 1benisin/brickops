import type { Id } from "../../_generated/dataModel";

const ACCOUNT_BUCKET_PREFIX = "brickowl:account";

export function boAccountBucket(businessAccountId: Id<"businessAccounts">): string {
  return `${ACCOUNT_BUCKET_PREFIX}:${businessAccountId}`;
}
