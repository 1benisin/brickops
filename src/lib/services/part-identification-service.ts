import type { ConvexReactClient } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexClient } from "@/lib/convexClient";

export interface PartIdentificationRequest {
  storageId: Id<"_storage">;
}

export interface PartIdentificationExternalLink {
  name: string;
  url: string;
}

export interface PartIdentificationBoundingBox {
  left: number;
  upper: number;
  right: number;
  lower: number;
  image_width: number;
  image_height: number;
  score?: number;
}

export interface PartIdentificationItem {
  id: string;
  name: string;
  type: string;
  category: string | null;
  score: number;
  imageUrl: string | null;
  externalSites: PartIdentificationExternalLink[];
}

export interface PartIdentificationResult {
  provider: "brickognize";
  listingId: string | null;
  durationMs: number;
  requestedAt: number;
  boundingBox: PartIdentificationBoundingBox | null;
  items: PartIdentificationItem[];
  topScore: number;
  lowConfidence: boolean;
}

export interface PartIdentificationError {
  message: string;
  code?: string;
}

export class PartIdentificationService {
  private readonly client: ConvexReactClient;

  constructor(client: ConvexReactClient = getConvexClient()) {
    this.client = client;
  }

  async generateUploadUrl(): Promise<string> {
    try {
      return await this.client.mutation(api.identify.mutations.generateUploadUrl, {});
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async identifyPartFromImage(
    request: PartIdentificationRequest,
  ): Promise<PartIdentificationResult> {
    try {
      return await this.client.action(api.identify.actions.identifyPartFromImage, request);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): PartIdentificationError {
    if (error instanceof Error) {
      return { message: error.message };
    }

    if (typeof error === "object" && error !== null) {
      const candidate = error as {
        message?: string;
        code?: string;
        data?: { message?: string; code?: string };
      };
      const message =
        candidate.message ?? candidate.data?.message ?? "Identification request failed";
      const code = candidate.code ?? candidate.data?.code;
      return { message, code };
    }

    return { message: "Identification request failed" };
  }
}
