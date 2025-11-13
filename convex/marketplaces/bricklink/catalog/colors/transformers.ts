import { decodeHtmlEntities } from "../shared/transformers";
import type { ColorRecord } from "./schema";

export function mapColor(input: {
  color_id: number;
  color_name: string;
  color_code?: string;
  color_type?: string;
}): ColorRecord {
  const now = Date.now();

  return {
    colorId: input.color_id,
    colorName: input.color_id === 0 ? "(Not Applicable)" : decodeHtmlEntities(input.color_name),
    colorCode: input.color_code,
    colorType: input.color_type,
    lastFetched: now,
    createdAt: now,
  };
}

