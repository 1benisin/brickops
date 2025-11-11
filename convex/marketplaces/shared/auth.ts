import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import { ConvexError } from "convex/values";
import { requireActiveUser, type RequireUserReturn } from "../../users/authorization";
import { internal } from "../../_generated/api";

export type RequireOwnerReturn = RequireUserReturn;

async function requireOwnerFromDb(ctx: QueryCtx | MutationCtx): Promise<RequireOwnerReturn> {
  const context = await requireActiveUser(ctx);

  if (context.user.role !== "owner") {
    throw new ConvexError("Access denied. Only account owners can manage marketplace credentials.");
  }

  return context;
}

async function requireOwnerFromAction(ctx: ActionCtx): Promise<RequireOwnerReturn> {
  const context = await ctx.runQuery(internal.users.queries.getActiveUserContext, {});

  if (context.user.role !== "owner") {
    throw new ConvexError("Access denied. Only account owners can manage marketplace credentials.");
  }

  return context;
}

export async function requireOwner(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<RequireOwnerReturn> {
  if ("db" in ctx) {
    return requireOwnerFromDb(ctx);
  }

  return requireOwnerFromAction(ctx);
}
