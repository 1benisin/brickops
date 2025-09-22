type EnvKey =
  | "BRICKOGNIZE_API_KEY"
  | "BRICKOWL_API_KEY"
  | "BRICKLINK_CONSUMER_KEY"
  | "BRICKLINK_CONSUMER_SECRET"
  | "BRICKLINK_ACCESS_TOKEN"
  | "BRICKLINK_TOKEN_SECRET"
  | "RESEND_API_KEY"
  | "AUTH_EMAIL_FROM";

const cache = new Map<EnvKey, string>();

export const getSecret = (key: EnvKey): string => {
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  cache.set(key, value);
  return value;
};

export type BricklinkCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  tokenSecret: string;
};

export const getBrickognizeApiKey = () => getSecret("BRICKOGNIZE_API_KEY");

export const getBrickowlApiKey = () => getSecret("BRICKOWL_API_KEY");

export const getBricklinkCredentials = (): BricklinkCredentials => ({
  consumerKey: getSecret("BRICKLINK_CONSUMER_KEY"),
  consumerSecret: getSecret("BRICKLINK_CONSUMER_SECRET"),
  accessToken: getSecret("BRICKLINK_ACCESS_TOKEN"),
  tokenSecret: getSecret("BRICKLINK_TOKEN_SECRET"),
});

export const getResendApiKey = () => getSecret("RESEND_API_KEY");

export const getAuthEmailFromAddress = () => getSecret("AUTH_EMAIL_FROM");
