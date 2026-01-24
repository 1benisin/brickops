# Shared Infrastructure (`shared/`)

Cross-cutting infrastructure modules used by all domain modules.
These modules have NO business domain knowledge.

## Modules

### auth/

OAuth 1.0 signature generation for external API authentication.

- `oauth.ts` - OAuth header builder with HMAC-SHA1 signatures

### email/

Email sending via Resend API.

- `index.ts` - Password reset and invite email utilities

### encryption/

Credential encryption using AES-GCM via Web Crypto API.

- `index.ts` - Encrypt/decrypt credentials for secure storage
- `webcrypto.ts` - HMAC and random hex utilities for OAuth signatures

### env.ts

Environment variable access with caching. Provides typed access to secrets for:
- BrickLink OAuth credentials
- BrickOwl API key
- Rebrickable API key
- Resend API key and email sender address

### http/

Generic HTTP client infrastructure.

- `types.ts` - API error types and helpers
- `retry.ts` - Exponential backoff retry logic
- `client.ts` - Configurable HTTP client with retry support
- `upstreamRequest.ts` - High-level upstream API client with OAuth, rate limiting, and retries

### metrics/

Lightweight metrics recording.

- `index.ts` - Metric event recording and listener system

### ratelimit/

API rate limiting with token bucket algorithm.

- `schema.ts` - Database table definition and types
- `config.ts` - Rate limit configurations per provider
- `consume.ts` - Token consumption mutation
- `dbRateLimiter.ts` - Direct rate limit helper for inline use

## Dependency Rules

- `shared/` modules MUST NOT import from any domain module
- `shared/` modules can only import from:
  - `convex/_generated/*`
  - `convex/values`
  - Other `shared/` modules
