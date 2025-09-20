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
- `pnpm test` – Executes frontend, backend, and E2E dry-run test suites.
- `pnpm test:e2e` – Executes Playwright tests (requires running dev server).
- `pnpm format` – Formats source code with Prettier.

## Project Structure

```
brickops/
├── convex/                   # Convex backend functions and schema
│   ├── functions/            # Business logic mutations and queries
│   ├── crons.ts              # Scheduled jobs
│   ├── http.ts               # HTTP routes (health checks, webhooks)
│   └── schema.ts             # Convex data schema
├── src/                      # Next.js frontend application (App Router)
│   ├── app/                  # Route definitions and global layout
│   ├── components/           # Shared UI components
│   ├── hooks/                # React hooks
│   ├── lib/                  # Utilities, Convex clients, shared types
│   └── middleware.ts         # Request middleware / guards
├── __tests__/                # Jest, Vitest, and Playwright tests
├── public/                   # Static assets
├── scripts/                  # Automation scripts (git hooks, etc.)
├── docs/                     # Product and engineering documentation
├── package.json
├── pnpm-lock.yaml            # Generated lockfile (commit after install)
├── pnpm-workspace.yaml
└── README.md
```

## Environment Variables

| Variable                 | Description                              |
| ------------------------ | ---------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL for browser client |
| `CONVEX_DEPLOYMENT`      | Optional – target deployment for CLI     |

## Quality Tooling

- ESLint with TypeScript, React, accessibility, and import-ordering rules.
- Prettier formatting with pre-commit enforcement through `simple-git-hooks`.
- Jest + React Testing Library for frontend units.
- Vitest for backend logic.
- Playwright for cross-browser E2E scenarios.

## Convex Setup

1. If you have the Convex CLI, authenticate and initialize the project:
   ```bash
   npx convex dev
   ```
2. Update `convex.json` with the generated `projectConfig`.
3. Deploy functions with `npx convex deploy` when ready.

---

This scaffold follows the architecture and coding standards defined in `docs/architecture` for quick onboarding.
