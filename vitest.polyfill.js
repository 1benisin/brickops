const cryptoModule = require("node:crypto");

if (typeof cryptoModule.getRandomValues !== "function") {
  Object.defineProperty(cryptoModule, "getRandomValues", {
    value: cryptoModule.webcrypto.getRandomValues.bind(cryptoModule.webcrypto),
    configurable: true,
    enumerable: true,
  });
}

if (!globalThis.crypto) {
  globalThis.crypto = cryptoModule.webcrypto;
}

if (typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto.getRandomValues = cryptoModule.getRandomValues;
}
