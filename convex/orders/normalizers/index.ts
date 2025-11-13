import { provider as bricklinkProvider } from "./bricklink";
import { provider as brickowlProvider } from "./brickowl";
import type { NormalizedOrder, NormalizedOrderItem, ProviderId, ProviderNormalizer } from "./types";

const providerNormalizers: Record<ProviderId, ProviderNormalizer> = {
  bricklink: bricklinkProvider,
  brickowl: brickowlProvider,
};

function getProviderNormalizer(provider: ProviderId): ProviderNormalizer {
  const normalizer = providerNormalizers[provider];
  if (!normalizer) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return normalizer;
}

export function normalizeOrder(provider: ProviderId, orderData: unknown): NormalizedOrder {
  return getProviderNormalizer(provider).normalizeOrder(orderData);
}

export function normalizeOrderItems(
  provider: ProviderId,
  orderId: string,
  orderItemsData: unknown,
): NormalizedOrderItem[] {
  return getProviderNormalizer(provider).normalizeItems(orderId, orderItemsData);
}

export * from "./types";
export * from "./shared/errors";
