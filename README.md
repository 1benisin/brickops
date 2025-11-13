# BrickOps

Next.js + Convex monorepo scaffold with comprehensive developer tooling for the BrickOps retail operations platform.

## Getting Started

1. Install pnpm **8.15.0** or newer.
2. Install project dependencies:
   ```bash
   pnpm install
   ```
3. Copy environment template and supply values:
   ```bash
   cp .env.local.example .env.local
   ```
4. Start the development environment with hot reloading for both frontend and backend:
   ```bash
   pnpm dev
   ```

## Available Scripts

- `pnpm dev` – Runs Next.js and Convex dev servers concurrently with hot reloading.
- `pnpm build` – Builds the production bundle.
- `pnpm lint` – Runs ESLint.
- `pnpm test` – Executes frontend, backend, and full Playwright suites sequentially.
- `pnpm test:frontend` – Runs Jest + React Testing Library suites.
- `pnpm test:frontend:coverage` – Generates frontend coverage reporting with thresholds.
- `pnpm test:backend` – Runs Vitest suites for Convex functions.
- `pnpm test:backend:coverage` – Produces backend coverage (v8 provider configured).
- `pnpm test:coverage` – Aggregates frontend and backend coverage into `coverage/`.
- `pnpm test:ci` – Lint + coverage + Playwright listing for CI guard rails.
- `pnpm test:e2e` – Executes Playwright tests (requires running dev server).
- `pnpm format` – Formats source code with Prettier.

## Project Structure

```
brickops/
├── AGENTS.md                  # Quick guide for AI agents and contributors
├── convex/                    # Convex backend organized by domain (catalog, inventory, marketplaces, etc.)
├── src/                       # Next.js App Router code (app routes, components, hooks, lib, middleware)
├── __tests__/                 # Vitest, Jest, and Playwright suites
├── docs/                      # Architecture guides, flows, external docs, and initiative plans
├── scripts/                   # Automation and data seeding scripts
├── public/                    # Static assets
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### Learn More

- Product context: `docs/architecture/overview/project-overview.md`
- Initiative roadmaps: `docs/plans/`