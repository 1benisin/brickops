"use node";

import { ConvexError, v } from "convex/values";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { BrickognizeClient } from "../lib/external/brickognize";
import { normalizeApiError } from "../lib/external/types";

const CONFIDENCE_THRESHOLD = 0.85;

type BrickognizeBoundingBox = {
  left: number;
  upper: number;
  right: number;
  lower: number;
  image_width: number;
  image_height: number;
  score?: number;
};

type BrickognizeExternalSite = {
  name: string;
  url: string;
};

type BrickognizeItem = {
  id: string;
  name: string;
  type?: string;
  category?: string;
  img_url?: string;
  score?: number;
  external_sites?: BrickognizeExternalSite[];
};

type BrickognizePredictResponse = {
  listing_id?: string;
  bounding_box?: BrickognizeBoundingBox;
  items?: BrickognizeItem[];
};

type IdentificationResultItem = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  score: number;
  imageUrl: string | null;
  externalSites: BrickognizeExternalSite[];
};

type IdentificationResult = {
  provider: "brickognize";
  listingId: string | null;
  durationMs: number;
  requestedAt: number;
  boundingBox: BrickognizeBoundingBox | null;
  items: IdentificationResultItem[];
  topScore: number;
  lowConfidence: boolean;
};

const now = () => Date.now();

type CurrentUserResponse = {
  user: Doc<"users">;
  businessAccount: Doc<"businessAccounts">;
};

export const identifyPartFromImage = action({
  args: {
    storageId: v.id("_storage"),
    businessAccountId: v.id("businessAccounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required");
    }

    const currentUser = (await ctx.runQuery(
      api.functions.users.getCurrentUser,
      {},
    )) as CurrentUserResponse | null;

    if (!currentUser) {
      throw new ConvexError("User context unavailable");
    }

    if (currentUser.businessAccount._id !== args.businessAccountId) {
      throw new ConvexError("User cannot access another business account");
    }

    // TODO: Implement rate limiting for identification requests
    // await ctx.runMutation(api.internal.identify.consumeIdentificationRate, {
    //   userId: currentUser.user._id,
    // });

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
