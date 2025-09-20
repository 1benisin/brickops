import { ConvexReactClient } from "convex/react";
import { getEnv } from "./env";

/**
 * Convex client singleton used by the React app.
 * The URL is injected via environment variables to support multi-environment setups.
 */
let convexClient: ConvexReactClient | null = null;

export function getConvexClient() {
  if (!convexClient) {
    const { NEXT_PUBLIC_CONVEX_URL } = getEnv();
    convexClient = new ConvexReactClient(NEXT_PUBLIC_CONVEX_URL);
  }

  return convexClient;
}
