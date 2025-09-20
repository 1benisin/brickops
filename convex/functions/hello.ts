import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { helloImpl } from "./hello-impl";

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
