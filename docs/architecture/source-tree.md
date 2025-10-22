# Source Tree

```text
brickops/
├── convex/                         # Convex backend functions and schema
│   ├── bricklink/                  # BrickLink marketplace integration (Stories 2.3, 3.2)
│   │   ├── catalogClient.ts        # Catalog queries (BrickOps credentials)
│   │   ├── bricklinkMappers.ts     # Catalog data mappers
│   │   ├── dataRefresher.ts        # Catalog refresh jobs
│   │   ├── oauth.ts                # OAuth 1.0a signing helpers
│   │   ├── storeClient.ts          # Store client (inventory + orders, user credentials)
│   │   └── storeMappers.ts         # Store data mappers
│   ├── brickowl/                   # BrickOwl marketplace integration (Story 3.3)
│   │   ├── auth.ts                 # API key authentication helpers
│   │   ├── storeClient.ts          # Store client (inventory + orders, user credentials)
│   │   └── storeMappers.ts         # Store data mappers
│   ├── catalog/                    # Catalog domain functions (Story 2.2-2.3)
│   │   ├── helpers.ts              # Catalog business logic helpers
│   │   ├── mutations.ts            # Catalog write operations
│   │   ├── queries.ts              # Catalog read operations
│   │   ├── schema.ts               # Catalog table schemas
│   │   └── validators.ts           # Catalog input validation
│   ├── identify/                   # Part identification domain (Story 2.1)
│   │   ├── actions.ts              # Brickognize API integration actions
│   │   ├── helpers.ts              # Identification business logic
│   │   ├── mutations.ts            # Identification write operations
│   │   └── schema.ts               # Identification table schemas
│   ├── inventory/                  # Inventory domain functions (Story 3.4)
│   │   ├── helpers.ts              # Inventory business logic helpers
│   │   ├── mutations.ts            # Inventory write operations
│   │   ├── queries.ts              # Inventory read operations
│   │   ├── schema.ts               # Inventory table schemas
│   │   └── sync.ts                 # Marketplace sync orchestration
│   ├── marketplace/                # Marketplace domain functions (Stories 3.1-3.3)
│   │   ├── actions.ts              # External marketplace API actions
│   │   ├── helpers.ts              # Marketplace business logic
│   │   ├── mutations.ts            # Marketplace write operations
│   │   ├── queries.ts              # Marketplace read operations
│   │   ├── rateLimitConfig.ts      # Rate limit configurations per provider
│   │   ├── schema.ts               # Marketplace table schemas
│   │   └── types.ts                # Shared TypeScript interfaces
│   ├── users/                      # User management domain (Story 1.3)
│   │   ├── actions.ts              # User-related actions (email, invitations)
│   │   ├── helpers.ts              # User business logic and RBAC
│   │   ├── mutations.ts            # User write operations
│   │   ├── queries.ts              # User read operations
│   │   └── schema.ts               # User table schemas
│   ├── lib/                        # Shared utilities
│   │   ├── dbRateLimiter.ts        # Database-backed rate limiting helpers
│   │   ├── encryption.ts           # AES-GCM encryption for credentials (Story 3.1)
│   │   ├── external/               # External API utilities
│   │   │   ├── brickognize.ts      # Brickognize API client
│   │   │   ├── brickowl.ts         # BrickOwl API client
│   │   │   ├── circuitBreaker.ts   # Circuit breaker pattern implementation
│   │   │   ├── email.ts            # Email service client
│   │   │   ├── env.ts              # Environment variable helpers
│   │   │   ├── httpClient.ts       # Generic HTTP client
│   │   │   ├── inMemoryRateLimiter.ts # In-memory rate limiting
│   │   │   ├── metrics.ts          # Metrics recording helpers
│   │   │   ├── rateLimiter.ts      # Rate limiting abstractions
│   │   │   ├── retry.ts            # Retry logic implementation
│   │   │   ├── types.ts            # Shared external API types
│   │   │   └── validate.ts         # API response validation
│   │   ├── rateLimiterAdapter.ts   # Rate limiter adapter
│   │   └── webcrypto.ts            # Web Crypto API helpers
│   ├── auth.config.ts              # Convex Auth configuration
│   ├── auth.ts                     # Auth functions
│   ├── crons.ts                    # Scheduled functions (catalog refresh, inventory sync)
│   ├── hello.ts                    # Example public functions
│   ├── hello_impl.ts               # Example implementation helpers
│   ├── http.ts                     # HTTP endpoints
│   └── schema.ts                   # Root database schema (aggregates domain schemas)
├── src/                            # Next.js frontend application
│   ├── app/                        # App Router (Next.js 14+)
│   │   ├── (auth)/                 # Auth pages (sign-in, sign-up)
│   │   ├── (authenticated)/        # Protected routes
│   │   └── design-system/          # Design system showcase
│   ├── components/                 # Reusable UI components
│   │   ├── catalog/                # Catalog components
│   │   ├── dashboard/              # Dashboard components
│   │   ├── identify/               # Part identification components
│   │   ├── inventory/              # Inventory components
│   │   ├── layout/                 # Layout components (nav, toolbar, etc.)
│   │   ├── providers/              # React context providers
│   │   ├── settings/               # Settings components (credentials, users)
│   │   └── ui/                     # shadcn/ui components
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities and configs
│   └── middleware.ts               # Route protection
├── public/                         # Static assets
├── __tests__/                      # Tests (unit/integration/e2e)
│   ├── backend/                    # Backend tests (Convex functions)
│   ├── e2e/                        # End-to-end tests (Playwright)
│   └── frontend/                   # Frontend component tests
├── docs/                           # Documentation
│   ├── architecture/               # Architecture documents
│   ├── prd/                        # Product requirements (epics)
│   ├── stories/                    # User stories (organized by epic)
│   ├── qa/                         # QA assessments and gates
│   └── external-documentation/     # External API docs
├── scripts/                        # Build and utility scripts
│   └── catalog/                    # Catalog build scripts
├── package.json                    # Dependencies and scripts
├── pnpm-workspace.yaml             # Monorepo workspace configuration
└── README.md                       # Project documentation
```

## Key Directory Purposes

### Convex Backend Structure

**Domain-Based Organization**:

BrickOps organizes backend code by business domain, with each domain following a consistent structure:

- `catalog/` - Part catalog management (Story 2.2-2.3)
- `identify/` - Part identification via Brickognize (Story 2.1)
- `inventory/` - Inventory tracking and sync (Story 3.4)
- `marketplace/` - Marketplace integrations and orchestration (Stories 3.1-3.3)
- `users/` - User management and RBAC (Story 1.3)

**Domain Module Pattern**:

Each domain typically contains:

- `queries.ts` - Read-only operations
- `mutations.ts` - Write operations
- `actions.ts` - External API orchestration
- `helpers.ts` - Business logic and utilities
- `schema.ts` - Database table definitions
- `validators.ts` - Input validation (when needed)

**Marketplace Integration (Stories 3.1-3.3)**:

- `bricklink/` - BrickLink marketplace integration with separate clients for catalog (BrickOps credentials) vs store (user credentials)
- `brickowl/` - BrickOwl marketplace integration following same pattern
- `marketplace/` - Orchestration layer with shared types and configurations across all marketplace providers

**Shared Infrastructure**:

- `lib/` - Shared utilities (encryption, rate limiting, external API helpers)
- `auth.ts` / `auth.config.ts` - Authentication configuration
- `crons.ts` - Scheduled background jobs
- `http.ts` - HTTP endpoints for webhooks
- `schema.ts` - Root schema aggregating all domain schemas

**Testing Organization**:

- `__tests__/backend/` - Convex function tests
- `__tests__/frontend/` - React component tests
- `__tests__/e2e/` - Playwright end-to-end tests
