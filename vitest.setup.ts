import { webcrypto } from "node:crypto";

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
  // @ts-expect-error - assign node webcrypto in test/runtime environments lacking it
  globalThis.crypto = webcrypto as unknown as Crypto;
}
