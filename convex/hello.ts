import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { helloImpl } from "./hello_impl";

/**
 * Convex mutation for a simple authenticated greeting.
 *
 * Responsibilities in this file:
 * - Authenticate the user and extract `tokenIdentifier`
 * - Derive a tenant id from the token (multi-tenant support)
 * - Delegate pure formatting/business logic to `helloImpl`
 *
 * Splitting concerns lets us unit test `helloImpl` without Convex context
 * and keep handler glue code minimal here.
 */

/**
 * Extract/normalize a tenant id from a Convex `tokenIdentifier`.
 * Handles a few common delimiter conventions (":", "|", "/").
 * Falls back to the full tokenIdentifier if no delimiter found.
 *
 * @throws {ConvexError} when tokenIdentifier is absent
 */
export const deriveTenantId = (tokenIdentifier: string) => {
  for (const delimiter of [":", "|", "/"]) {
    if (tokenIdentifier.includes(delimiter)) {
      const [tenant] = tokenIdentifier.split(delimiter);
      if (tenant) {
        return tenant;
      }
    }
  }

  if (!tokenIdentifier) {
    throw new ConvexError("Tenant context missing");
  }

  return tokenIdentifier;
};

/**
 * Authenticated greeting mutation.
 *
 * Args:
 * - name: string — the person to greet
 *
 * Behavior:
 * - Requires a valid identity; throws if unauthenticated
 * - Derives tenant id for multi-tenant context
 * - Returns greeting string from `helloImpl`
 */
export const hello = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    const { tokenIdentifier } = identity;
    if (!tokenIdentifier) {
      throw new ConvexError("Tenant context missing");
    }

    const tenantId = deriveTenantId(tokenIdentifier);

    return helloImpl({
      name: args.name,
      tenantId,
    });
  },
});
