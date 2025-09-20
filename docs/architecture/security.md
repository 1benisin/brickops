# Security

## Input Validation

- **Validation Library:** Zod schemas for all user inputs with strict type checking and sanitization
- **Validation Location:** Validate at Convex function entry point before any business logic execution
- **Required Rules:**
  - All external inputs MUST be validated using defined Zod schemas before processing
  - Validation at API boundary before database operations or external API calls
  - Whitelist approach preferred over blacklist - define allowed values explicitly
  - File uploads must validate file type, size (max 10MB for images), and scan for malicious content

## Authentication & Authorization

- **Auth Method:** Convex Auth with JWT tokens and secure session management
- **Session Management:** Automatic token refresh with secure httpOnly cookies for web sessions
- **Required Patterns:**
  - Every protected Convex function MUST verify authentication using `await ctx.auth.getUserIdentity()`
  - Role-based access control MUST check user role and business account membership before data access
  - Multi-tenant isolation MUST filter all queries by `businessAccountId` - no exceptions
  - API endpoints MUST validate both authentication and business account access permissions

## Secrets Management

- **Development:** Environment variables in `.env.local` with `.env.example` template (never commit actual secrets)
- **Production:** Convex environment variables with encryption for API credentials and sensitive configuration
- **Code Requirements:**
  - NEVER hardcode secrets, API keys, or credentials in source code
  - Access credentials only through Convex environment variables or secure configuration
  - No secrets in logs, error messages, or client-side code
  - Encrypt external API credentials before database storage using Convex's built-in encryption

## API Security

- **Rate Limiting:** Implement per-user rate limiting for critical operations (part identification: 100/hour, order processing: 50/hour)
- **CORS Policy:** Restrict origins to production domains only - no wildcard CORS in production
- **Security Headers:** Enforce HTTPS, set CSP headers, disable X-Frame-Options for iframe protection
- **HTTPS Enforcement:** All production traffic MUST use HTTPS with automatic HTTP to HTTPS redirect

## Data Protection

- **Encryption at Rest:** Convex handles database encryption automatically - verify all sensitive fields use proper data types
- **Encryption in Transit:** All API communications use TLS 1.2+ with certificate pinning for external APIs
- **PII Handling:** Customer addresses, payment info, and personal data MUST be flagged as sensitive and excluded from logs
- **Logging Restrictions:** Never log passwords, API keys, credit card numbers, or full customer addresses

## Dependency Security

- **Scanning Tool:** GitHub Dependabot with automated vulnerability alerts and patch management
- **Update Policy:** Security patches applied within 48 hours, dependency updates reviewed weekly
- **Approval Process:** New dependencies require security review and approval before integration

## Security Testing

- **SAST Tool:** ESLint security plugins with automated scanning in CI/CD pipeline
- **DAST Tool:** Basic penetration testing for authentication flows and input validation
- **Penetration Testing:** Quarterly security assessment focusing on multi-tenant data isolation and API security
