import { z } from "zod";

export const boOrderNotifyPayloadSchema = z.object({
  ip: z.string(),
});
export type BOOrderNotifyPayload = z.infer<typeof boOrderNotifyPayloadSchema>;
