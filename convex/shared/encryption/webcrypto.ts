export function randomHex(numBytes: number): string {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function toBase64(buffer: ArrayBuffer): string {
  // Prefer web btoa when available (Convex isolate runtime)
  if (typeof btoa === "function") {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  // Node fallback for tests
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer as ArrayBuffer).toString("base64");
  }
  throw new Error("No base64 encoder available in this environment");
}

export async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key).buffer as ArrayBuffer;
  const dataBytes = new TextEncoder().encode(data).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "HMAC" }, cryptoKey, dataBytes);
  return toBase64(sig);
}
