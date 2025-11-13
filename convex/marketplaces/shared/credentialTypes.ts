// Shared TypeScript types that represent decrypted marketplace credentials.
export interface MarketplaceCredentials {
  provider: "bricklink" | "brickowl";
  // BrickLink OAuth 1.0a credential pieces. These may be undefined if the provider is BrickOwl.
  bricklinkConsumerKey?: string;
  bricklinkConsumerSecret?: string;
  bricklinkTokenValue?: string;
  bricklinkTokenSecret?: string;
  // BrickOwl API key, only present when the provider is BrickOwl.
  brickowlApiKey?: string;
}
