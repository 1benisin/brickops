import { ConvexError } from "convex/values";
import { z } from "zod";

import { blResponseMetaSchema } from "../schema";

export const blEnvelopeSchema = z
  .object({
    meta: blResponseMetaSchema,
    data: z.unknown(),
  })
  .passthrough();

export type BLResponseMeta = z.infer<typeof blResponseMetaSchema>;

export type BLEnvelope = z.infer<typeof blEnvelopeSchema>;

export type BLApiResponse<T> = BLEnvelope & { data: T };

export function parseBlEnvelope(
  raw: unknown,
  ctx: { endpoint: string; correlationId: string },
): BLEnvelope {
  const result = blEnvelopeSchema.safeParse(raw);

  if (!result.success) {
    throw new ConvexError({
      code: "INVALID_RESPONSE",
      message: "BrickLink response did not match the expected envelope schema",
      details: result.error.flatten(),
      endpoint: ctx.endpoint,
      correlationId: ctx.correlationId,
    });
  }

  return result.data;
}
