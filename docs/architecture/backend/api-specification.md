# API Specification

BrickOps uses Convex serverless functions instead of a traditional REST API. The frontend calls Convex functions directly via the Convex client and real-time subscriptions. Authentication/authorization occur at function boundaries.

- No OpenAPI spec is required for MVP. If a REST façade is added later, generate an OpenAPI document then.
- External API quotas to respect:
  - Bricklink: default 5,000 calls/day (API Terms 2023-02-02). Implement daily budgeting and monitoring.

## Dual Credential Architecture

BrickOps uses **two distinct credential systems** for marketplace integrations:

### 1. BrickOps System Credentials (Environment Variables)

Used for global catalog operations (Story 2.3):

- **Purpose**: Query global parts catalog, colors, categories, price guides
- **Scope**: System-wide operations shared across all tenants
- **Storage**: Convex environment variables
- **Rate Limiting**: Static in-memory tracking (single shared quota pool)
- **Example Use**: Catalog search, part details, price guide queries

### 2. User BYOK Credentials (Database, Encrypted)

Used for user marketplace store operations (Stories 3.1-3.3):

- **Purpose**: Manage user's BrickLink/BrickOwl store (inventory, orders)
- **Scope**: Per-business-account operations
- **Storage**: `marketplaceCredentials` table, encrypted at rest with AES-GCM
- **Rate Limiting**: Database-backed per-tenant tracking with circuit breaker
- **Example Use**: Inventory sync, order management, store settings

**CRITICAL**: Never mix credential types. System credentials cannot access user stores; user credentials should not query global catalog.

## External Provider Credentials

### Convex Environment Management

- System credentials (BrickOps) live in the Convex environment; never hardcode in source control
- User credentials (BYOK) stored encrypted in `marketplaceCredentials` table with `ENCRYPTION_KEY` env var for encryption
- Use `npx convex env set <deployment> <key> <value>` (or the Convex dashboard) to configure values for each deployment
- Limit access to administrators. Rotate keys on provider-requested cadence and immediately when compromise is suspected

### Brickognize API Key

- Request access through the Brickognize developer portal at https://brickognize.com/api/docs (contact: piotr.rybak@brickognize.com).
- Provider does not require an API key; service is accessible without authentication.
- Grant application services read-only access. Health checks use the `/health/` endpoint to verify connectivity.

### Bricklink OAuth 1.0a Credentials (BrickOps System Account)

- Follow Bricklink's OAuth 1.0a requirements (HMAC-SHA1 signatures, UTF-8 encoding, SSL enforced).
- Register the application in the Bricklink member portal to obtain consumer credentials, then generate access tokens.
- Configure the following Convex environment variables:
  - `BRICKLINK_CONSUMER_KEY` - System catalog access
  - `BRICKLINK_CONSUMER_SECRET` - System catalog access
  - `BRICKLINK_ACCESS_TOKEN` - System catalog access
  - `BRICKLINK_TOKEN_SECRET` - System catalog access
- Tokens must be scoped to the BrickOps store account and rotated per Bricklink policy. Validation utilities assert signature correctness without performing destructive operations.

**Note**: User BrickLink credentials (BYOK) are stored in `marketplaceCredentials` table, not environment variables.

### Brickowl API Key (BrickOps System Account - Future Use)

- Generate a key via the Brickowl account settings page (`/user/{id}/api_keys`).
- Respect Brickowl rate limits (typically 600 requests/minute; 200 requests/minute for bulk endpoints).
- Store the key as `BRICKOWL_API_KEY` in the Convex environment if needed for system operations.

**Note**: User BrickOwl credentials (BYOK) are stored in `marketplaceCredentials` table, not environment variables.

### Encryption Key (Story 3.1)

**Required for user credential encryption**:

- `ENCRYPTION_KEY` - 32-byte base64-encoded key for AES-GCM encryption of user marketplace credentials
- Generate: `openssl rand -base64 32`
- Used by `convex/lib/encryption.ts` to encrypt/decrypt credentials in `marketplaceCredentials` table
- Must be set in Convex environment for production; rotate periodically per security policy

### Feature Flags

- `DISABLE_EXTERNAL_CALLS` - When set, marketplace test connections return mock success (useful for CI/CD)

### Sync Settings

Sync behavior is now controlled through marketplace credential settings rather than environment flags:

- Each marketplace credential has a `syncEnabled` field (defaults to `true`)
- Users can enable/disable auto-sync per marketplace through the settings UI
- The sync orchestration respects these settings when determining which providers to sync to

### Documentation Cross-References

- Credential acquisition details live in the provider-specific architecture docs:
  - Brickognize: `docs/external/apis/brickognize.md`
  - Bricklink: `docs/external/apis/bricklink.md`
  - Brickowl: `docs/external/apis/brickowl.md`
- Security and secret handling standards: `docs/architecture/security-and-performance.md#security-requirements`.

## External API Documents

- Bricklink API: `docs/external/apis/bricklink.md`
- Brickowl API: `docs/external/apis/brickowl.md`
- Brickognize API: `docs/external/apis/brickognize.md`
