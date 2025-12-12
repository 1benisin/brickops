import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import { requireUserRole } from "../../users/authorization";

/**
 * Marketplace settings are tenant-scoped and should only be modified/read by
 * the owning user of the current business account.
 */
export async function requireOwner(ctx: QueryCtx | MutationCtx | ActionCtx) {
  return requireUserRole(ctx, "owner");
}
