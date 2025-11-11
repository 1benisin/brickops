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
  if (!input.brickowlApiKey) {
    throw new ConvexError("BrickOwl requires: brickowlApiKey");
  }
}

export function validateCredentialsForProvider(
  provider: CredentialProvider,
  input: CredentialInput,
): void {
  if (provider === "bricklink") {
    validateBlCredentials(input);
  } else {
    validateBrickowlCredentials(input);
  }
}

export async function encryptBlCredentials(
  input: CredentialInput,
): Promise<EncryptedCredentialFields> {
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
  if (provider === "bricklink") {
    return encryptBlCredentials(input);
  }

  return encryptBrickowlCredentials(input);
}
