import { randomHex } from "../../lib/webcrypto";

export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bo-${Date.now()}-${randomHex(8)}`;
}
