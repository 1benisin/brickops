# Documentation Refresh Plan

## Purpose

Document the changes needed to bring our engineering docs back in sync with the codebase, remove stale references (especially the deleted `docs/prd/` folder), and simplify onboarding for future contributors.

## Background

- The original PRD folder (`docs/prd/`) was intentionally removed. Multiple docs (including `AGENTS.md`) still reference it, sending new contributors to dead links.
- Several architecture docs describe an outdated repository layout (e.g., `convex/functions`, `docs/stories/`) or conceptual “services” that never shipped.
- Our test strategy and component docs have fallen out of sync with the actual folder structure and implementation patterns.

## Desired Outcomes

1. Every doc/tree diagram matches the current repository structure.
2. All references to the deleted PRD folder are replaced with working links or explanatory notes.
3. Frontend docs describe the real component and workflow structure (hooks, domain folders, Convex functions) instead of the unimplemented service abstractions.
4. Contributors can discover the correct test suites, seeding steps, and external documentation without cross-referencing outdated files.

## Target Updates (by file)

### `AGENTS.md`

- Remove the PRD section or replace it with a “Product context” pointer (e.g., highlight `docs/plans/` and `docs/flows/`).
- Add a short note explaining that the PRD folder was removed and where to find current requirements.

### `docs/architecture/index.md`

- Fix navigation links that still reference `../external/apis/`. They should point at `../external-documentation/...`.
- Update the “Documentation Structure” hierarchy to drop the PRD section and include `docs/plans/`.

### Root `README.md`

- Regenerate the project tree so it reflects:
  - Domain-first Convex folders (no `functions/` subdirectory).
  - `docs/plans/` instead of `docs/prd/`.
  - Any new top-level folders since the last refresh.
- Add a one-line “Where to learn more” section linking to the architecture index and flows docs.

### `docs/architecture/overview/project-structure.md`

- Regenerate the ASCII tree to match the current repo.
- Trim commentary that references removed folders (`docs/stories`, `marketplaces/shared/queries.ts`, etc.).
- Call out important naming conventions directly tied to the real directories (`src/components/inventory/...`, `convex/marketplaces/...`).

### `docs/architecture/frontend/components.md`

- Replace the “Service” sections (AuthenticationService, CatalogService, etc.) with the actual component hierarchy:
  - High-level explanation of domain folders (`inventory`, `catalog`, `layout`, etc.).
  - Patterns for shadcn/ui composition, data-table utilities, and hooks.
- Keep or move the component relationship diagram only if it references real modules; otherwise, trim or relocate to flows docs.

### `docs/architecture/frontend/core-workflows.md`

- Audit the mermaid diagrams and align the actors with real Convex functions/hooks (e.g., `api.inventory.mutations.*`).
- Cross-link to `docs/flows/*` so we have a single source for user and system workflows.

### `docs/architecture/development/coding-standards.md`

- Add a TL;DR section up top summarizing the critical rules (Convex patterns, validator-based typing, shadcn/ui usage).
- Confirm naming conventions section matches current practice.

### `docs/architecture/development/testing-strategy.md`

- Update the test directory diagrams to match `__tests__/backend/...` and `__tests__/frontend/app/...`.
- Mention the high-value suites (marketplace clients, inventory import) and any new tooling/mocking helpers.
- Validate Playwright guidance against the current scripts.

### `docs/architecture/development/development-workflow.md`

- Replace the “to be added” BrickLink bootstrap script note with either the real command or a TODO anchored to a tracking issue.
- Ensure all commands use the current pnpm scripts (`pnpm test:coverage`, etc.).

### `docs/architecture/backend/api-specification.md`

- Fix links to external docs (use `docs/external-documentation/...`).
- Reiterate the dual-credential architecture now that PRD context is gone.

### `convex/marketplaces/README.md`

- Update the “Discover requirements” bullet to point at the relevant `docs/plans/` entries and marketplace flows instead of the deleted PRD.
- Emphasize validator/type patterns that the backend currently uses (convex validators vs Zod schema hybrids).

## Implementation Checklist

1. Audit and regenerate directory trees (`README.md`, `project-structure.md`), ensuring comments reflect current files.
2. Search for `docs/prd` across the repo and update or remove every reference.
3. Rewrite frontend component/workflow docs to mirror today’s component layout and Convex integration patterns.
4. Refresh test strategy diagrams and instructions to match the existing suites.
5. Fix all stale relative links (external documentation, flows, plans).
6. Add or update cross-links so `docs/plans/` becomes the canonical place for roadmap/requirements context.
7. Run `pnpm lint` (or markdown lint if available) on updated docs to catch formatting issues.

## Open Questions / Follow-ups

- Should we introduce a lightweight “Product context” page under `docs/plans/` to replace the PRD overview entirely?
- Do we want automated checks (lint rule or script) to warn when directory diagrams drift from the actual tree?
- Is there additional documentation (e.g., onboarding guides) that should reference the updated structure once this refresh is complete?

## Suggested Timeline

1. **Day 1:** Regenerate project trees, clean PRD references, fix broken links.
2. **Day 2:** Rewrite frontend docs (components + workflows) and update coding/testing standards.
3. **Day 3:** Refresh marketplace/architecture docs, run linting, and circulate for review.

Assign each section to a dev familiar with that area (frontend, backend, marketplace) to ensure the content matches implementation realities.
