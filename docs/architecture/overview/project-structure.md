# Project Structure

```text
brickops/
├── convex/                         # Convex backend functions and schema
│   ├── marketplaces/               # Marketplace integrations (Stories 2.3, 3.1-3.3)
│   │   ├── bricklink/              # BrickLink marketplace integration
│   │   │   ├── catalog/            # BrickLink catalog domain helpers
│   │   │   │   ├── actions.ts      # BrickLink catalog API actions
│   │   │   │   ├── client.ts       # Stateless catalog helpers (BrickOps credentials)
│   │   │   │   ├── refresh/        # Catalog refresh mutations/background jobs
│   │   │   │   │   └── index.ts    # Queue scheduling and cleanup
│   │   │   │   ├── schema.ts       # Catalog validators and response types
│   │   │   │   └── transformers.ts # Catalog data mappers
│   │   │   ├── notifications.ts   # BrickLink notifications processing
│   │   │   ├── oauth.ts            # OAuth 1.0a signing helpers
│   │   │   ├── storeClient.ts      # Store client (inventory + orders, user credentials)
│   │   │   ├── inventory/transformers.ts # BrickLink inventory data mappers
│   │   │   └── webhook.ts          # Webhook endpoint handlers
│   │   ├── brickowl/               # BrickOwl marketplace integration
│   │   │   ├── auth.ts             # API key authentication helpers
│   │   │   ├── storeClient.ts      # Store client (inventory + orders, user credentials)
│   │   │   └── storeMappers.ts     # Store data mappers
│   │   └── shared/                 # Shared marketplace orchestration
│   │       ├── actions.ts          # External marketplace API actions
│   │       ├── helpers.ts          # Marketplace business logic and client factories
│   │       ├── migrations.ts       # Marketplace migrations
│   │       ├── mutations.ts        # Marketplace write operations
│   │       ├── queries.ts          # Marketplace read operations
│   │       ├── schema.ts           # Marketplace table schemas
│   │       └── types.ts            # Shared TypeScript interfaces
│   ├── catalog/                    # Catalog domain functions (Story 2.2-2.3)
│   │   ├── actions.ts              # External API orchestration
│   │   ├── helpers.ts              # Catalog business logic helpers
│   │   ├── mutations.ts            # Catalog write operations
│   │   ├── queries.ts              # Catalog read operations and search
│   │   ├── refreshWorker.ts        # Catalog refresh outbox processing
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
│   │   ├── sync.ts                 # Marketplace sync orchestration
│   │   ├── syncWorker.ts           # Background sync processing
│   │   ├── types.ts                # Inventory types
│   │   ├── mocks.ts                # Inventory test utilities
│   │   └── validators.ts           # Inventory input validation
│   ├── orders/                     # Orders domain functions
│   │   ├── ingestion.ts           # Order ingestion from marketplaces
│   │   ├── mutations.ts            # Order write operations
│   │   ├── queries.ts              # Order read operations
│   │   ├── schema.ts               # Order table schemas
│   │   └── mocks.ts                # Order test mocks
│   ├── ratelimit/                  # Rate limiting domain
│   │   ├── helpers.ts              # Helper for consuming shared rate limit tokens
│   │   ├── mutations.ts            # Rate limit write operations
│   │   ├── rateLimitConfig.ts      # Provider validators and configuration
│   │   └── schema.ts               # Rate limit table schemas

Rate limit buckets map to business account IDs by default. Use the dedicated
`brickopsAdmin` bucket only for global BrickOps workloads and call
`takeRateLimitToken` when acquiring tokens inside actions.
│   ├── users/                      # User management domain (Story 1.3)
│   │   ├── actions.ts              # User-related actions (email, invitations)
│   │   ├── helpers.ts              # User business logic and RBAC
│   │   ├── mutations.ts            # User write operations
│   │   ├── queries.ts              # User read operations
│   │   └── schema.ts               # User table schemas
│   ├── lib/                        # Shared utilities
│   │   ├── dbRateLimiter.ts        # Database-backed rate limiting helpers
│   │   ├── encryption.ts          # AES-GCM encryption for credentials (Story 3.1)
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
│   ├── http.ts                     # HTTP endpoints for webhooks
│   └── schema.ts                   # Root database schema (aggregates domain schemas)
├── src/                            # Next.js frontend application
│   ├── app/                        # App Router (Next.js 14+)
│   │   ├── (auth)/                 # Auth pages (sign-in, sign-up, reset-password, invite)
│   │   ├── (authenticated)/        # Protected routes
│   │   │   ├── catalog/            # Catalog browsing page
│   │   │   ├── dashboard/          # Dashboard overview page
│   │   │   ├── identify/          # Part identification page
│   │   │   ├── inventory/          # Inventory management
│   │   │   │   ├── files/          # Inventory file management
│   │   │   │   └── history/        # Inventory change history
│   │   │   ├── orders/            # Order processing (placeholder)
│   │   │   └── settings/           # Settings page
│   │   └── design-system/          # Design system showcase
│   ├── components/                 # Reusable UI components
│   │   ├── catalog/                # Catalog components
│   │   ├── common/                 # Shared common components
│   │   ├── dashboard/              # Dashboard components
│   │   ├── identify/                # Part identification components
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
- `marketplaces/` - Marketplace integrations and orchestration (Stories 3.1-3.3)
  - `marketplaces/bricklink/` - BrickLink marketplace integration
  - `marketplaces/brickowl/` - BrickOwl marketplace integration
  - `marketplaces/shared/` - Shared marketplace orchestration and types
- `orders/` - Order management and processing
- `ratelimit/` - Rate limiting infrastructure
- `users/` - User management and RBAC (Story 1.3)

**Domain Module Pattern**:

Each domain typically contains:

- `queries.ts` - Read-only operations
- `mutations.ts` - Write operations
- `actions.ts` - External API orchestration (when needed)
- `helpers.ts` - Business logic and utilities
- `schema.ts` - Database table definitions
- `validators.ts` - Input validation (when needed)

**Marketplace Integration (Stories 3.1-3.3)**:

- `marketplaces/bricklink/` - BrickLink marketplace integration with separate clients for catalog (BrickOps credentials) vs store (user credentials)
  - Includes `notifications.ts` for processing BrickLink push notifications
  - Includes `webhook.ts` for handling webhook events
- `marketplaces/brickowl/` - BrickOwl marketplace integration following same pattern
- `marketplaces/shared/` - Orchestration layer with shared types, configurations, and client factories across all marketplace providers

**Shared Infrastructure**:

- `lib/` - Shared utilities (encryption, rate limiting, external API helpers)
- `ratelimit/` - Global rate limiting domain for shared rate limit buckets
- `auth.ts` / `auth.config.ts` - Authentication configuration
- `crons.ts` - Scheduled background jobs
- `http.ts` - HTTP endpoints for webhooks
- `schema.ts` - Root schema aggregating all domain schemas

**Testing Organization**:

- `__tests__/backend/` - Convex function tests
- `__tests__/frontend/` - React component tests
- `__tests__/e2e/` - Playwright end-to-end tests
