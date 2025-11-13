# Project Overview

## Purpose

BrickOps is a retail operations platform for LEGO resellers who manage thousands of lots across multiple marketplaces. This overview provides a stable “source of truth” for why the product exists, who it serves, and how the system is organized. Use it alongside the living initiative plans in `docs/plans/` for sprint-level detail.

## Vision & Goals

- Automate LEGO part identification via Brickognize to cut manual identification time by roughly 60%.
- Centralize inventory, catalog, and order management for BrickLink and BrickOwl with real-time synchronization.
- Reduce order processing and picking time from hours to minutes through optimized workflows.
- Maintain a high-fidelity LEGO catalog with freshness windows and automatic refresh jobs.
- Provide the operational backbone for small-to-mid-sized resellers to scale toward $50K+ MRR.

## Target Users

| Persona                   | Primary Needs                                                        | Pain Points Today                                                |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Owner/Operator            | End-to-end visibility, accurate reporting, easy onboarding for staff | Spreadsheet sprawl, manual reconciliation, limited analytics     |
| Inventory Specialist      | Fast part identification, location tracking, audit history           | Manual lookups, missing catalog context, error-prone adjustments |
| Fulfillment Lead          | Optimized pick paths, issue resolution, live order status            | Disconnected picking tools, inconsistent inventory counts        |
| Marketplace Administrator | Credential management, sync health, rate limit visibility            | API limits, credential drift, hard-to-debug sync failures        |

## Value Proposition

1. **Identify:** Camera-first part identification with confidence scoring and catalog validation.
2. **Organize:** Real-time inventory with location, status splits, and full change history.
3. **Sync:** Bidirectional marketplace integrations that treat BrickLink inventory as ground truth.
4. **Fulfill:** Order ingestion, pick path generation, and issue handling to keep shipments on track.
5. **Insight:** Emerging reporting and analytics to highlight stock levels, aging lots, and workflow bottlenecks.

## Core Workflows

- **Part Identification:** `src/app/(authenticated)/identify` + `convex/identify` actions orchestrate Brickognize, validate against the catalog, and create inventory candidates.
- **Catalog Maintenance:** `convex/catalog` seeds, validates, and refreshes LEGO data using BrickLink XML exports plus on-demand API passthrough.
- **Inventory Management:** `src/components/inventory/*` + `convex/inventory` mutations handle CRUD, sync status, imports, and audit trails.
- **Marketplace Sync:** `convex/marketplaces/*` actions wrap BrickLink/BrickOwl calls, enforce rate limits, and persist normalized data to `convex/orders` and inventory.
- **Order Processing & Picking:** `src/app/(authenticated)/orders` & `picking` routes collaborate with `convex/orders` helpers to drive pick sessions, status updates, and TODO management.
- **User & Access Control:** `convex/users` & Convex Auth provide multi-user, role-based access across business accounts.

Details and sequence diagrams live in `docs/architecture/frontend/core-workflows.md` and the flows under `docs/flows/`.

## System Architecture Snapshot

| Layer          | Highlights                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend       | Next.js 14+ App Router, shadcn/ui, Tailwind, React Query via Convex hooks, responsive/mobile-first UI.                                           |
| Backend        | Convex serverless functions (queries/mutations/actions) organized by domain with end-to-end validator-derived typings.                           |
| Data           | Convex database for catalog, inventory, orders, rate limits, credentials; Convex file storage for captures; scheduled jobs in `convex/crons.ts`. |
| Integrations   | Brickognize (part identification), BrickLink (catalog + store), BrickOwl (store), email providers (future).                                      |
| Infrastructure | Vercel (frontend), Convex (backend + auth), pnpm monorepo with shared lint/test/format tooling.                                                  |

## Non-Functional Priorities

- **Performance:** <3s page load, <1s interactive latency, aggressive client and server caching.
- **Reliability:** 99.9% uptime target, idempotent sync jobs, consistent refresh windows (<7d fresh, <30d stale).
- **Scalability:** Support 1,000+ concurrent users and large catalogs via indexed queries and background workers.
- **Security & Compliance:** Convex Auth, role-based access, encrypted credentials, GDPR-aligned data handling.
- **Accessibility:** WCAG AA compliance, keyboard navigation, high-contrast design, alt text for part imagery.

## Success Metrics (Working Targets)

- 95%+ Brickognize identification accuracy for common parts.
- 99% sync success rate across marketplaces with automatic retry telemetry.
- Pick session completion time reduced by 50% versus legacy manual process.
- Weekly active operator adoption across 5% of target reseller market (~500 teams).

## Roadmap & Initiative Tracking

- Active initiatives and refactors live in `docs/plans/` (e.g., catalog refactor, BrickOwl service testing). Treat these as living documents; archive completed plans alongside release notes.
- Major user flows are documented in `docs/flows/` and should be updated as workflows evolve.
- Architecture decisions and coding standards remain in `docs/architecture/` and must stay in sync with implementation.

## Glossary

- **BrickOps Catalog:** Internal datastore seeded from BrickLink XML plus ongoing refresh jobs.
- **Brickognize:** Third-party vision API for LEGO part identification.
- **Ground Truth Inventory:** BrickLink store counts, treated as authoritative for sync.
- **Pick Session:** Guided workflow for fulfilling one or more orders with optimized routing and issue tracking.
- **StoreOperationResult:** Standard payload for marketplace mutations capturing success, retry hints, and rollback metadata.

---

_Last updated: 2025-11-12. Review quarterly or when product direction changes materially._
