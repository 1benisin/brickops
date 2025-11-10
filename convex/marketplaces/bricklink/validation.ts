import { ConvexError } from "convex/values";
import { z } from "zod";

// Basic metadata returned by every BrickLink API response.
const bricklinkMetaSchema = z
  .object({
    description: z.string().optional(),
    message: z.string().optional(),
    code: z.number().int().optional(),
  })
  .passthrough();

// Shared envelope for all BrickLink JSON payloads. Individual endpoints parse `data`.
export const bricklinkEnvelopeSchema = z
  .object({
    meta: bricklinkMetaSchema.default({}),
    data: z.unknown(),
  })
  .passthrough();

export type BricklinkEnvelope = z.infer<typeof bricklinkEnvelopeSchema>;

export function parseBricklinkEnvelope(
  raw: unknown,
  ctx: { endpoint: string; correlationId: string },
): BricklinkEnvelope {
  // Keep the guard rails close to the network boundary so downstream code can assume shape.
  const result = bricklinkEnvelopeSchema.safeParse(raw);
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
