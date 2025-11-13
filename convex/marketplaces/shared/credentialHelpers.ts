// Helper functions for validating and encrypting marketplace API credentials.
import { ConvexError } from "convex/values";
import { encryptCredential } from "../../lib/encryption";

export type CredentialProvider = "bricklink" | "brickowl";

export type CredentialInput = {
  bricklinkConsumerKey?: string;
  bricklinkConsumerSecret?: string;
  bricklinkTokenValue?: string;
  bricklinkTokenSecret?: string;
  brickowlApiKey?: string;
};

export type EncryptedCredentialFields = Partial<{
  bricklinkConsumerKey: string;
  bricklinkConsumerSecret: string;
  bricklinkTokenValue: string;
  bricklinkTokenSecret: string;
  brickowlApiKey: string;
}>;

export function validateBlCredentials(input: CredentialInput): void {
  // BrickLink needs a complete OAuth 1.0a credential set.
  // If anything is missing, fail fast so the mutation can explain the issue.
  if (
    !input.bricklinkConsumerKey ||
    !input.bricklinkConsumerSecret ||
    !input.bricklinkTokenValue ||
    !input.bricklinkTokenSecret
  ) {
    throw new ConvexError(
      "BrickLink requires: bricklinkConsumerKey, bricklinkConsumerSecret, bricklinkTokenValue, and bricklinkTokenSecret",
    );
  }
}

export function validateBrickowlCredentials(input: CredentialInput): void {
  // BrickOwl uses a single API key, so make sure it is present before saving.
  if (!input.brickowlApiKey) {
    throw new ConvexError("BrickOwl requires: brickowlApiKey");
  }
}

export function validateCredentialsForProvider(
  provider: CredentialProvider,
  input: CredentialInput,
): void {
  // Route the validation to the correct marketplace helper based on the provider flag.
  if (provider === "bricklink") {
    validateBlCredentials(input);
  } else {
    validateBrickowlCredentials(input);
  }
}

export async function encryptBlCredentials(
  input: CredentialInput,
): Promise<EncryptedCredentialFields> {
  // Encrypt each BrickLink secret so we never store raw values in Convex.
  const result: EncryptedCredentialFields = {};

  if (input.bricklinkConsumerKey) {
    result.bricklinkConsumerKey = await encryptCredential(input.bricklinkConsumerKey);
  }
  if (input.bricklinkConsumerSecret) {
    result.bricklinkConsumerSecret = await encryptCredential(input.bricklinkConsumerSecret);
  }
  if (input.bricklinkTokenValue) {
    result.bricklinkTokenValue = await encryptCredential(input.bricklinkTokenValue);
  }
  if (input.bricklinkTokenSecret) {
    result.bricklinkTokenSecret = await encryptCredential(input.bricklinkTokenSecret);
  }

  return result;
}

export async function encryptBrickowlCredentials(
  input: CredentialInput,
): Promise<EncryptedCredentialFields> {
  // Encrypt the BrickOwl API key if it was provided.
  const result: EncryptedCredentialFields = {};

  if (input.brickowlApiKey) {
    result.brickowlApiKey = await encryptCredential(input.brickowlApiKey);
  }

  return result;
}

export async function encryptCredentialsForProvider(
  provider: CredentialProvider,
  input: CredentialInput,
): Promise<EncryptedCredentialFields> {
  // Dispatch to the correct encryption helper for the marketplace being saved.
  if (provider === "bricklink") {
    return encryptBlCredentials(input);
  }

  return encryptBrickowlCredentials(input);
}
