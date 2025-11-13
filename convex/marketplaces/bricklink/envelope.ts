// Helpers for validating the standard "meta + data" envelope that BrickLink returns.
import { ConvexError } from "convex/values";
import { z } from "zod";

import { blResponseMetaSchema } from "./schema";

// BrickLink wraps every response inside { meta, data }. We trust meta but leave data loose.
export const blEnvelopeSchema = z
  .object({
    meta: blResponseMetaSchema,
    data: z.unknown(),
  })
  .passthrough();

export type BLResponseMeta = z.infer<typeof blResponseMetaSchema>;

export type BLEnvelope = z.infer<typeof blEnvelopeSchema>;

export type BLApiResponse<T> = BLEnvelope & { data: T };

// Validate the response body and raise a friendly error if BrickLink sends something unexpected.
export function parseBlEnvelope(
  raw: unknown,
  ctx: { endpoint: string; correlationId: string },
): BLEnvelope {
  const result = blEnvelopeSchema.safeParse(raw);

  if (!result.success) {
    // Bubble up details so we can pinpoint why the response failed to match our expectations.
    throw new ConvexError({
      code: "INVALID_RESPONSE",
      message: "BrickLink response did not match the expected envelope schema",
      details: result.error.flatten(),
      endpoint: ctx.endpoint,
      correlationId: ctx.correlationId,
    });
  }

  // Safe to cast now; the envelope matches what we expect.
  return result.data;
}
