import { randomHex } from "../../lib/webcrypto";

export function generateWebhookToken(bytes = 32): string {
  return randomHex(bytes);
}

export function ensureWebhookToken(existing?: string | null): string {
  return existing && existing.length > 0 ? existing : generateWebhookToken();
}
