import { v } from "convex/values";
import { z } from "zod";

export const blNotificationEventTypeSchema = z.enum(["Order", "Message", "Feedback"] as const);
export type BLNotificationEventType = z.infer<typeof blNotificationEventTypeSchema>;

export const blNotificationSchema = z.object({
  event_type: blNotificationEventTypeSchema,
  resource_id: z.number(),
  timestamp: z.string(),
});
export type BLNotification = z.infer<typeof blNotificationSchema>;

export const blNotificationStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead_letter",
] as const);
export type BLNotificationStatus = z.infer<typeof blNotificationStatusSchema>;

// Convex validators derived from the zod schemas for runtime arg validation.
export const blNotificationEventTypeValidator = v.union(
  v.literal("Order"),
  v.literal("Message"),
  v.literal("Feedback"),
);

export const blNotificationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("dead_letter"),
);
