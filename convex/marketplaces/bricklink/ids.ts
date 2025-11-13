// Utilities to generate ids used when talking to the BrickLink API.
// Utilities to generate ids used when talking to the BrickLink API.
import { randomHex } from "../../lib/webcrypto";

// Create a correlation id so we can trace a BrickLink request across logs and retries.
export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback: combine a timestamp with random hex so each id stays unique enough for logs.
  return `bl-${Date.now()}-${randomHex(8)}`;
}
