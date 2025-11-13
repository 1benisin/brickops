// Helpers for creating and keeping webhook tokens used in BrickLink callbacks.
import { randomHex } from "../../lib/webcrypto";

export function generateWebhookToken(bytes = 32): string {
  // Produce a random hex string with enough entropy for a secret token.
  return randomHex(bytes);
}

export function ensureWebhookToken(existing?: string | null): string {
  // Reuse the existing token when possible, or generate a fresh one if missing.
  return existing && existing.length > 0 ? existing : generateWebhookToken();
}
