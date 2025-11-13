"use node";

import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { BrickognizeClient } from "../lib/external/brickognize";
import { normalizeApiError } from "../lib/external/types";
import {
  CONFIDENCE_THRESHOLD,
  type BrickognizePredictResponse,
  type IdentificationResult,
  type IdentificationResultItem,
} from "./helpers";
import { requireActiveUser } from "../users/authorization";

const now = () => Date.now();

/**
 * Identify a LEGO part from an uploaded image using Brickognize API
 * This is an action (not mutation) because it needs Node.js for HTTP requests
 */
export const identifyPartFromImage = action({
  args: {
    storageId: v.id("_storage"),
    businessAccountId: v.optional(v.id("businessAccounts")),
  },
  handler: async (ctx, args) => {
    const { businessAccountId } = await requireActiveUser(ctx);

    if (args.businessAccountId && args.businessAccountId !== businessAccountId) {
      throw new ConvexError("Cannot access another business account");
    }

    // TODO: Implement rate limiting for identification requests via consumeIdentificationRate mutation.

    const arrayBuffer = await ctx.storage.get(args.storageId);
    if (!arrayBuffer) {
      throw new ConvexError("Captured image not found");
    }

    const cleanup = async () => {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // ignore cleanup failures
      }
    };

    const client = new BrickognizeClient();
    const formData = new FormData();
    const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
    formData.append("query_image", blob, "capture.jpg");

    const started = now();

    try {
      const response = await client.request<BrickognizePredictResponse>({
        path: "/predict/",
        method: "POST",
        body: formData,
        expectJson: true,
      });

      const durationMs = now() - started;

      const items = (response.data.items ?? []).map<IdentificationResultItem>((item) => ({
        id: item.id,
        name: item.name,
        type: item.type ?? "part",
        category: item.category ?? null,
        score: item.score ?? 0,
        imageUrl: item.img_url ?? null,
        externalSites: item.external_sites ?? [],
      }));

      const topScore = items.reduce((maxScore, item) => Math.max(maxScore, item.score), 0);

      const result: IdentificationResult = {
        provider: "brickognize",
        listingId: response.data.listing_id ?? null,
        durationMs,
        requestedAt: started,
        boundingBox: response.data.bounding_box ?? null,
        items,
        topScore,
        lowConfidence: topScore < CONFIDENCE_THRESHOLD,
      };

      await cleanup();
      return result;
    } catch (error) {
      await cleanup();

      const apiError = normalizeApiError("brickognize", error, {
        endpoint: "/predict/parts/",
      });

      throw new ConvexError(apiError.error.message ?? "Brickognize identification failed");
    }
  },
});
