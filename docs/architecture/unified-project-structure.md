# Unified Project Structure

```text
brickops/
├── convex/                         # Convex backend functions and schema
│   ├── bricklink/                  # BrickLink marketplace integration
│   │   ├── catalogClient.ts        # Catalog queries (BrickOps credentials)
│   │   ├── bricklinkMappers.ts     # Catalog data mappers
│   │   ├── dataRefresher.ts        # Catalog refresh jobs
│   │   ├── oauth.ts                # OAuth 1.0a signing helpers
│   │   ├── storeClient.ts          # Store client (user credentials)
│   │   └── storeMappers.ts         # Store data mappers
│   ├── brickowl/                   # BrickOwl marketplace integration
│   │   ├── auth.ts                 # API key authentication helpers
│   │   ├── storeClient.ts          # Store client (user credentials)
│   │   └── storeMappers.ts         # Store data mappers
│   ├── catalog/                    # Catalog domain (queries, mutations, helpers, schema, validators)
│   ├── identify/                   # Identification domain (actions, mutations, helpers, schema)
│   ├── inventory/                  # Inventory domain (queries, mutations, helpers, schema, sync)
│   ├── marketplace/                # Marketplace domain (actions, queries, mutations, helpers, schema, types, rateLimitConfig)
│   ├── users/                      # Users domain (actions, queries, mutations, helpers, schema)
│   ├── lib/                        # Shared utilities
│   │   ├── dbRateLimiter.ts        # Rate limiting helpers
│   │   ├── encryption.ts           # AES-GCM encryption
│   │   ├── external/               # External API utilities
│   │   ├── rateLimiterAdapter.ts   # Rate limiter adapter
│   │   └── webcrypto.ts            # Web Crypto helpers
│   ├── auth.config.ts, auth.ts     # Convex Auth
│   ├── crons.ts                    # Scheduled functions
│   ├── hello.ts, hello_impl.ts     # Example functions
│   ├── http.ts                     # HTTP endpoints
│   └── schema.ts                   # Root database schema
├── src/                            # Next.js frontend application
│   ├── app/                        # App Router (Next.js 14+)
│   │   ├── (auth)/                 # Auth pages
│   │   ├── (authenticated)/        # Protected routes
│   │   └── design-system/          # Design system
│   ├── components/                 # Reusable UI components
│   │   ├── catalog/, dashboard/, identify/, inventory/
│   │   ├── layout/                 # Navigation, toolbar
│   │   ├── settings/               # Settings forms
│   │   └── ui/                     # shadcn/ui components
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Utilities and configs
│   └── middleware.ts               # Route protection
├── public/                         # Static assets
├── __tests__/                      # Tests
│   ├── backend/                    # Convex function tests
│   ├── e2e/                        # Playwright tests
│   └── frontend/                   # React component tests
├── docs/                           # Documentation
│   ├── architecture/               # Architecture documents
│   ├── prd/                        # Product requirements
│   ├── stories/                    # User stories by epic
│   ├── qa/                         # QA assessments and gates
│   └── external-documentation/     # External API docs
├── scripts/                        # Build and utility scripts
│   └── catalog/                    # Catalog build scripts
├── package.json                    # Dependencies and scripts
├── pnpm-workspace.yaml             # Monorepo workspace config
└── README.md                       # Project documentation
```
