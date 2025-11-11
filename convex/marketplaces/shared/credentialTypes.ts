/**
 * Marketplace credential payload (decrypted).
 */
export interface MarketplaceCredentials {
  provider: "bricklink" | "brickowl";
  bricklinkConsumerKey?: string;
  bricklinkConsumerSecret?: string;
  bricklinkTokenValue?: string;
  bricklinkTokenSecret?: string;
  brickowlApiKey?: string;
}
