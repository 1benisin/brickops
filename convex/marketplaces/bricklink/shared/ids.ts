import { randomHex } from "../../../lib/webcrypto";

export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `bl-${Date.now()}-${randomHex(8)}`;
}
