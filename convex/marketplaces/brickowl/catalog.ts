import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { getBrickowlApiKey } from "../../lib/external/env";

/**
 * Response from BrickOwl /catalog/id_lookup endpoint
 * https://www.brickowl.com/api/v1/catalog/id_lookup
 */
type IdLookupResponse = Array<{
  boid: string;
  type:
    | "Part"
    | "Set"
    | "Minifigure"
    | "Gear"
    | "Sticker"
    | "Minibuild"
    | "Instructions"
    | "Packaging";
  name: string;
}>;

/**
 * Look up BrickOwl ID (BOID) from a BrickLink part number
 * Uses BrickOwl's catalog/id_lookup endpoint with API key authentication
 * Includes rate limiting (200 req/min global bucket)
 * Returns the first matching BOID or empty string if not found or rate limited
 */
export const lookupBrickowlId = internalAction({
  args: {
    bricklinkPartNo: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    // Check feature flag to disable external calls in dev/test
    if (process.env.DISABLE_EXTERNAL_CALLS === "true") {
      return "";
    }

    // Rate limiting - use global bucket for catalog refresh
    const token = await ctx.runMutation(internal.ratelimiter.consume.consumeToken, {
      bucket: "brickops:catalog:brickowl",
      provider: "brickowl",
    });

    if (!token.granted) {
      const retryAfterMs = Math.max(0, token.resetAt - Date.now());
      console.warn(`BrickOwl rate limit reached for catalog lookup, retry after ${retryAfterMs}ms`);
      return ""; // Gracefully degrade
    }

    try {
      // Get API key for authentication
      const apiKey = getBrickowlApiKey();

      const params = new URLSearchParams({
        key: apiKey,
        id: args.bricklinkPartNo,
        type: "Part",
        id_type: "bl_item_no",
      });

      const response = await fetch(
        `https://api.brickowl.com/v1/catalog/id_lookup?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        console.warn(
          `BrickOwl ID lookup failed for ${args.bricklinkPartNo}: HTTP ${response.status}`,
        );
        return "";
      }

      const data = (await response.json()) as IdLookupResponse;

      // Return first BOID if found
      if (data && data.length > 0) {
        return data[0].boid;
      }

      return "";
    } catch (error) {
      // Log error but return empty string to allow graceful degradation
      console.warn(
        `Failed to lookup BrickOwl ID for ${args.bricklinkPartNo}:`,
        error instanceof Error ? error.message : String(error),
      );
      return "";
    }
  },
});
