/**
 * Encryption utilities for secure credential storage
 * Uses Web Crypto API with AES-GCM encryption
 * Compatible with Convex runtime (no Node.js Buffer dependency)
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Decode base64 string to Uint8Array (browser-compatible)
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode Uint8Array to base64 string (browser-compatible)
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Get the encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = process.env.ENCRYPTION_KEY;

  if (!keyString) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Generate one with: openssl rand -base64 32",
    );
  }

  // Decode base64 key using browser-compatible method
  const keyArray = base64ToBytes(keyString);

  if (keyArray.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes (256 bits). " + "Generate one with: openssl rand -base64 32",
    );
  }

  // Import key for AES-GCM
  return await crypto.subtle.importKey(
    "raw",
    keyArray as BufferSource,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a plaintext credential string
 * @param plaintext The credential to encrypt
 * @returns Base64-encoded encrypted data with IV prepended
 */
export async function encryptCredential(plaintext: string): Promise<string> {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty credential");
  }

  const key = await getEncryptionKey();

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encode plaintext
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    data,
  );

  // Prepend IV to encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Return as base64 using browser-compatible method
  return bytesToBase64(combined);
}

/**
 * Decrypt an encrypted credential string
 * @param ciphertext Base64-encoded encrypted data with IV prepended
 * @returns Decrypted plaintext credential
 */
export async function decryptCredential(ciphertext: string): Promise<string> {
  if (!ciphertext) {
    throw new Error("Cannot decrypt empty ciphertext");
  }

  const key = await getEncryptionKey();

  // Decode base64 using browser-compatible method
  const combinedArray = base64ToBytes(ciphertext);

  // Extract IV and encrypted data
  const iv = combinedArray.slice(0, IV_LENGTH);
  const data = combinedArray.slice(IV_LENGTH);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    data,
  );

  // Decode result
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Mask a credential string for display
 * Shows only last 4 characters
 * @param credential The credential to mask
 * @returns Masked string like "****abc123"
 */
export function maskCredential(credential: string | null | undefined): string {
  if (!credential || credential.length === 0) {
    return "****";
  }

  if (credential.length <= 4) {
    return "****";
  }

  const lastFour = credential.slice(-4);
  return `****${lastFour}`;
}
