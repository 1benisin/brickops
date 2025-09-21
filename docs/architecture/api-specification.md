# API Specification

BrickOps uses Convex serverless functions instead of a traditional REST API. The frontend calls Convex functions directly via the Convex client and real-time subscriptions. Authentication/authorization occur at function boundaries.

- No OpenAPI spec is required for MVP. If a REST façade is added later, generate an OpenAPI document then.
- External API quotas to respect:
  - Bricklink: default 5,000 calls/day (API Terms 2023-02-02). Implement daily budgeting and monitoring.

## External Provider Credentials

### Convex Environment Management

- All secrets live in the Convex environment; never hardcode credentials in source control.
- Use `npx convex env set <deployment> <key> <value>` (or the Convex dashboard) to configure values for each deployment.
- Limit access to administrators. Rotate keys on provider-requested cadence and immediately when compromise is suspected.

### Brickognize API Key

- Request access through the Brickognize developer portal at https://brickognize.com/api/docs (contact: piotr.rybak@brickognize.com).
- Provider issues an API key per account; store it as `BRICKOGNIZE_API_KEY` in the Convex environment.
- Grant application services read-only access. Health checks use the `/health/` endpoint to verify connectivity.

### Bricklink OAuth 1.0a Credentials

- Follow Bricklink’s OAuth 1.0a requirements (HMAC-SHA1 signatures, UTF-8 encoding, SSL enforced).
- Register the application in the Bricklink member portal to obtain consumer credentials, then generate access tokens.
- Configure the following Convex environment variables:
  - `BRICKLINK_CONSUMER_KEY`
  - `BRICKLINK_CONSUMER_SECRET`
  - `BRICKLINK_ACCESS_TOKEN`
  - `BRICKLINK_TOKEN_SECRET`
- Tokens must be scoped to the BrickOps store account and rotated per Bricklink policy. Validation utilities assert signature correctness without performing destructive operations.

### Brickowl API Key

- Generate a key via the Brickowl account settings page (`/user/{id}/api_keys`).
- Respect Brickowl rate limits (typically 600 requests/minute; 200 requests/minute for bulk endpoints).
- Store the key as `BRICKOWL_API_KEY` in the Convex environment and scope usage to server-side functions.

### Documentation Cross-References

- Credential acquisition details live in the provider-specific architecture docs:
  - Brickognize: `docs/architecture/api-brickognize.md`
  - Bricklink: `docs/architecture/api-bricklink.md`
  - Brickowl: `docs/architecture/api-brickowl.md`
- Security and secret handling standards: `docs/architecture/security-and-performance.md#security-requirements`.

## External API Documents

- Bricklink API: `docs/architecture/api-bricklink.md`
- Brickowl API: `docs/architecture/api-brickowl.md`
- Brickognize API: `docs/architecture/api-brickognize.md`
