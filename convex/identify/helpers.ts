/**
 * Type definitions for Brickognize API responses
 * Not Convex functions - just type definitions
 */

export type BrickognizeBoundingBox = {
  left: number;
  upper: number;
  right: number;
  lower: number;
  image_width: number;
  image_height: number;
  score?: number;
};

export type BrickognizeExternalSite = {
  name: string;
  url: string;
};

export type BrickognizeItem = {
  id: string;
  name: string;
  type?: string;
  category?: string;
  img_url?: string;
  score?: number;
  external_sites?: BrickognizeExternalSite[];
};

export type BrickognizePredictResponse = {
  listing_id?: string;
  bounding_box?: BrickognizeBoundingBox;
  items?: BrickognizeItem[];
};

export type IdentificationResultItem = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  score: number;
  imageUrl: string | null;
  externalSites: BrickognizeExternalSite[];
};

export type IdentificationResult = {
  provider: "brickognize";
  listingId: string | null;
  durationMs: number;
  requestedAt: number;
  boundingBox: BrickognizeBoundingBox | null;
  items: IdentificationResultItem[];
  topScore: number;
  lowConfidence: boolean;
};

/**
 * Constants
 */
export const CONFIDENCE_THRESHOLD = 0.75;
export const IDENTIFY_LIMIT = 100; // 100 identifications per window
export const IDENTIFY_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
export const RATE_LIMIT_KIND = "identify_part";
