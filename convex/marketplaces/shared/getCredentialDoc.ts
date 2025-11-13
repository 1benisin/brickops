// Shared helper for finding a single marketplace credential document by business and provider.
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

type Provider = Doc<"marketplaceCredentials">["provider"];

export async function getCredentialDoc(
  ctx: QueryCtx | MutationCtx,
  businessAccountId: Id<"businessAccounts">,
  provider: Provider,
): Promise<Doc<"marketplaceCredentials"> | null> {
  // Use the compound index to quickly locate the credential document for this provider.
  return ctx.db
    .query("marketplaceCredentials")
    .withIndex("by_business_provider", (q) =>
      q.eq("businessAccountId", businessAccountId).eq("provider", provider),
    )
    .first();
}
