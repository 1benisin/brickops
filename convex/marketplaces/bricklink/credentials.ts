import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { decryptCredential } from "../../lib/encryption";
import {
  makeBricklinkRequest,
  type BricklinkApiResponse,
  type BricklinkCredentials,
  type BricklinkRequestOptions,
  type BricklinkRequestResult,
} from "./storeClient";
import { requireActiveUser } from "@/convex/users/helpers";

export type BricklinkHttpClient = {
  request: <T>(options: BricklinkRequestOptions) => Promise<BricklinkRequestResult<T>>;
};

export async function getBrickLinkCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BricklinkCredentials> {
  const credentials = await ctx.runQuery(
    internal.marketplaces.shared.mutations.getEncryptedCredentials,
    {
      businessAccountId,
      provider: "bricklink",
    },
  );

  if (!credentials) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickLink credentials not configured. Please add your credentials in Settings.",
    });
  }

  const decrypted: BricklinkCredentials = {
    consumerKey: (await decryptCredential(credentials.bricklinkConsumerKey!)).trim(),
    consumerSecret: (await decryptCredential(credentials.bricklinkConsumerSecret!)).trim(),
    tokenValue: (await decryptCredential(credentials.bricklinkTokenValue!)).trim(),
    tokenSecret: (await decryptCredential(credentials.bricklinkTokenSecret!)).trim(),
  };

  validateDecryptedCredentials(decrypted);

  return decrypted;
}

export async function createBrickLinkHttpClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BricklinkHttpClient> {
  await ensureBusinessAccountAccess(ctx, businessAccountId);

  return {
    request: async <T>(options: BricklinkRequestOptions): Promise<BricklinkRequestResult<T>> => {
      return await makeBricklinkRequest<T>(ctx, options);
    },
  };
}

export async function withBrickLinkHttpClient<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  fn: (client: BricklinkHttpClient) => Promise<T>,
): Promise<T> {
  const client = await createBrickLinkHttpClient(ctx, businessAccountId);
  return await fn(client);
}

export async function testBrickLinkCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BricklinkRequestResult<BricklinkApiResponse<unknown>>> {
  await ensureBusinessAccountAccess(ctx, businessAccountId);

  return await makeBricklinkRequest<BricklinkApiResponse<unknown>>(ctx, {
    path: "orders",
    method: "GET",
    query: {
      direction: "in",
      page: 1,
    },
  });
}

function validateDecryptedCredentials(credentials: BricklinkCredentials): void {
  if (
    !credentials.consumerKey ||
    !credentials.consumerSecret ||
    !credentials.tokenValue ||
    !credentials.tokenSecret
  ) {
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickLink credentials are missing required fields",
    });
  }
}

async function ensureBusinessAccountAccess(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<void> {
  const { businessAccountId: activeBusinessAccountId } = await requireActiveUser(ctx);

  if (activeBusinessAccountId !== businessAccountId) {
    throw new ConvexError({
      code: "BUSINESS_ACCOUNT_MISMATCH",
      message: "You are not authorized to access these BrickLink credentials.",
    });
  }
}
