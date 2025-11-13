# Project Structure

BrickOps is a pnpm workspace that pairs a domain-driven Convex backend with a Next.js App Router frontend. This guide highlights where to find major pieces of the system and how the repository is organized.

## Repository Overview

```text
brickops/
├── AGENTS.md                  # AI agent & contributor quick reference
├── convex/                    # Convex backend organized by domain
├── src/                       # Next.js App Router application
├── __tests__/                 # Vitest, Jest, and Playwright suites
├── docs/                      # Architecture guides, flows, plans, external refs
├── scripts/                   # Operational and data seeding scripts
├── public/                    # Static assets
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Key Directory Purposes

### Convex Backend (`convex/`)

- **Domain folders**: `catalog/`, `identify/`, `inventory/`, `marketplaces/`, `orders/`, `ratelimiter/`, `users/`. Each domain typically exposes `queries.ts`, `mutations.ts`, optional `actions.ts`, domain `helpers.ts`, `schema.ts`, and `validators.ts`.
- **Marketplace integrations**: `marketplaces/bricklink/`, `marketplaces/brickowl/`, and `marketplaces/shared/` implement provider-specific transports, transformers, and shared credential/rate-limit utilities.
- **Shared infrastructure**: `lib/` houses encryption, HTTP, metrics, retry, and other reusable helpers. Top-level files (`auth.ts`, `auth.config.ts`, `crons.ts`, `http.ts`, `schema.ts`) wire up authentication, scheduled jobs, webhooks, and the aggregated database schema.

### Frontend (`src/`)

- **`app/`**: Next.js App Router routes and layouts, including `(auth)` and `(authenticated)` segments plus the design-system showcase.
- **`components/`**: Domain-focused React components composed from shadcn/ui primitives (`ui/`) and shared composition helpers (`inventory/`, `catalog/`, `layout/`, etc.).
- **`hooks/`**: Custom hooks and Zustand stores that bridge Convex clients with UI state.
- **`lib/`**: Frontend utilities (Convex client wrappers, formatting helpers, service facades).
- **`store/` & `types/`**: Client-side state stores and type helpers derived from backend validators.
- **`middleware.ts`**: Route protection and auth guards executed at the edge.

### Tests (`__tests__/`)

- **`backend/`**: Vitest suites covering Convex functions, marketplace transports, and shared helpers.
- **`frontend/`**: Jest + React Testing Library suites for pages, components, and frontend utilities.
- **`e2e/`**: Playwright scenarios for critical workflows (inventory management, identification, invites).

### Documentation (`docs/`)

- **`architecture/`**: System design, coding standards, development workflow, and detailed backend/frontend guides.
- **`flows/`**: Step-by-step user and system flows for catalog, inventory, orders, and background processes.
- **`plans/`**: Initiative planning documents and refactor/test plans (replaces the legacy PRD).
- **`external-documentation/`**: Upstream API references (Bricklink, BrickOwl, Brickognize) and Convex auth guides.

### Scripts (`scripts/`)

- `catalog/`, `orders/`, and `seed/` provide automation for data ingestion, maintenance jobs, and seeding workflows referenced in the architecture docs.

### Shared Tooling & Metadata

- **Root config**: `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `tailwind.config.ts`, `next.config.mjs`, and lint/test configs govern the workspace.
- **Guides**: `AGENTS.md` offers a condensed orientation for agents and new contributors; `README.md` provides quick-start commands and links back to architecture docs.
