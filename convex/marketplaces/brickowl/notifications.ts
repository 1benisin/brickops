import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { createBrickOwlHttpClient } from "./credentials";
import { boOrderNotifyPayloadSchema } from "./schema";

export async function setOrderNotifyTarget(
  ctx: ActionCtx,
  params: { businessAccountId: Id<"businessAccounts">; target: string | null },
): Promise<void> {
  const { businessAccountId, target } = params;
  const client = await createBrickOwlHttpClient(ctx, businessAccountId);

  const payload = boOrderNotifyPayloadSchema.parse({
    ip: target ?? "",
  });

  await client.requestWithRetry({
    path: "/order/notify",
    method: "POST",
    body: payload,
    idempotencyKey: target ? `notify-${target}` : "notify-clear",
    isIdempotent: true,
  });
}

