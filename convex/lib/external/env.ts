type EnvKey =
  | "BRICKOWL_API_KEY"
  | "REBRICKABLE_API_KEY"
  | "BRICKLINK_CONSUMER_KEY"
  | "BRICKLINK_CONSUMER_SECRET"
  | "BRICKLINK_ACCESS_TOKEN"
  | "BRICKLINK_TOKEN_SECRET"
  | "RESEND_API_KEY"
  | "AUTH_EMAIL_FROM";

const cache = new Map<EnvKey, string>();

/**
 * Clear the env var cache (for testing)
 */
export const clearEnvCache = () => cache.clear();

export const getSecret = (key: EnvKey): string => {
  // Always check process.env first (don't cache in test mode)
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  if (!isTest && cache.has(key)) {
    return cache.get(key)!;
  }

  const value = process.env[key];
  if (!value) {
    // Allow missing env vars during module load in test environment
    // Tests will set env vars in beforeEach before calling functions
    if (isTest) {
      return "test-placeholder";
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }

  if (!isTest) {
    cache.set(key, value);
  }
  return value;
};

export type BricklinkCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  tokenSecret: string;
};

export const getBrickowlApiKey = () => getSecret("BRICKOWL_API_KEY");

export const getRebrickableApiKey = () => getSecret("REBRICKABLE_API_KEY");

export const getBricklinkCredentials = (): BricklinkCredentials => ({
  consumerKey: getSecret("BRICKLINK_CONSUMER_KEY"),
  consumerSecret: getSecret("BRICKLINK_CONSUMER_SECRET"),
  accessToken: getSecret("BRICKLINK_ACCESS_TOKEN"),
  tokenSecret: getSecret("BRICKLINK_TOKEN_SECRET"),
});

export const getResendApiKey = () => getSecret("RESEND_API_KEY");

export const getAuthEmailFromAddress = () => getSecret("AUTH_EMAIL_FROM");
