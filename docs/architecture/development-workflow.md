# Development Workflow

## Local Development Setup

### Prerequisites

```bash
# Install deps
pnpm install

# Run unit/integration locally
pnpm test:coverage

# Optional: run E2E locally when touching auth/routing/hydration
pnpm exec playwright install
pnpm build && pnpm start &
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=chromium-desktop
```

## CI Strategy

- Lint, unit, and integration tests run on each PR and push to main.
- E2E is not part of default CI. Use the "E2E" workflow manually or wait for the weekly scheduled run.

## When to run E2E

Run Playwright locally or via workflow when changes affect:

- Authentication / sessions / redirects
- Next.js routing or middleware
- Hydration-sensitive UI changes
- Critical flows (signup, login, dashboard load)
