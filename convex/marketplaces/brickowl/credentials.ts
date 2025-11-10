import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { decryptCredential } from "../../lib/encryption";
import {
  createRequestCache,
  request,
  requestWithRetry,
  type BrickOwlRequestOptions,
  type BrickOwlRequestState,
} from "./storeClient";
import {
  type BrickOwlCredentials,
  validateApiKey,
} from "./auth";

export interface BrickOwlHttpClient {
  request: <T>(options: BrickOwlRequestOptions, state?: BrickOwlRequestState) => Promise<T>;
  requestWithRetry: <T>(
    options: BrickOwlRequestOptions,
    state?: BrickOwlRequestState,
  ) => Promise<T>;
  credentials: BrickOwlCredentials;
}

export async function getBrickOwlCredentials(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlCredentials> {
  const credentials = await ctx.runQuery(
    internal.marketplaces.shared.mutations.getEncryptedCredentials,
    {
      businessAccountId,
      provider: "brickowl",
    },
  );

  if (!credentials?.brickowlApiKey) {
    throw new ConvexError({
      code: "CREDENTIALS_NOT_FOUND",
      message: "BrickOwl credentials not configured. Please add your credentials in Settings.",
    });
  }

  const apiKey = (await decryptCredential(credentials.brickowlApiKey)).trim();

  if (!validateApiKey(apiKey)) {
    throw new ConvexError({
      code: "INVALID_CREDENTIALS",
      message: "BrickOwl API key is invalid. Please update your credentials.",
    });
  }

  return { apiKey };
}

export async function createBrickOwlHttpClient(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
): Promise<BrickOwlHttpClient> {
  const credentials = await getBrickOwlCredentials(ctx, businessAccountId);

  return {
    credentials,
    request: <T>(options: BrickOwlRequestOptions, state?: BrickOwlRequestState) =>
      request<T>(ctx, businessAccountId, credentials, options, state),
    requestWithRetry: <T>(options: BrickOwlRequestOptions, state?: BrickOwlRequestState) =>
      requestWithRetry<T>(ctx, businessAccountId, credentials, options, state),
  };
}

export async function withBrickOwlClient<T>(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    fn: (client: BrickOwlHttpClient) => Promise<T>;
  },
): Promise<T> {
  const client = await createBrickOwlHttpClient(ctx, params.businessAccountId);
  return await params.fn(client);
}

export function createBrickOwlRequestState(): BrickOwlRequestState {
  return { cache: createRequestCache() };
}

