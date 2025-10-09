# Epic 3 Inventory Management

**Epic Goal:** Build inventory upload functionality for bulk import of existing inventory data and comprehensive inventory management features to enable users to migrate their existing inventory and efficiently manage large inventories.

## Story 3.1: User Marketplace Credentials (BYOK) on Settings

As a **user**,
I want **to securely connect my own BrickLink and BrickOwl API credentials**,
so that **BrickOps can manage my marketplace inventories and orders on my behalf**.

### Acceptance Criteria

1. **3.1.1:** Settings page provides dedicated sections for BrickLink and BrickOwl credentials with clear labels and helper text explaining these are the user's marketplace credentials (distinct from BrickOps internal service credentials).
2. **3.1.2:** Credentials are stored securely using best practices: encrypted at rest, never returned in plaintext after save, masked/redacted in all logs and UI, and only accessible server-side.
3. **3.1.3:** Provide a "Test connection" action per marketplace that validates credentials with the provider and surfaces actionable error messages without exposing secrets.
4. **3.1.4:** Support credential lifecycle operations: create, update/rotate (partial updates allowed), and revoke/delete per marketplace provider.
5. **3.1.5:** RBAC is enforced: only authorized users (e.g., account owner/admin) can view or modify marketplace credential configuration.
6. **3.1.6:** Show non-sensitive state in UI: configured/not-configured, last updated timestamp, last validation result status.
7. **3.1.7:** Maintain an audit log entry whenever marketplace credentials are created, rotated, or revoked (who, when, which provider; no secrets logged).
8. **3.1.8:** Environment separation and safety: support sandbox/test modes where available; feature flag to disable outbound calls in development.

> Notes:
>
> - BrickLink typically requires OAuth 1.0a tokens; BrickOwl typically uses API keys. Store provider-specific fields accordingly and validate format before save.
> - Consider using a centralized secrets mechanism (e.g., KMS/KeyVault) and envelope encryption for at-rest storage.

## Story 3.2: BrickLink Client (Inventory Lots + Mappers)

As a **system**,
I want **a robust BrickLink client with inventory lot CRUD and data mappers**,
so that **we can synchronize our users' store inventory to/from BrickLink in a reliable and maintainable way**.

### Acceptance Criteria

1. **3.2.1:** Implement a typed BrickLink client that authenticates with user-provided credentials and supports required OAuth 1.0a signing.
2. **3.2.2:** Provide CRUD operations for store inventory lots: create lot, read/get lot(s), update lot, delete lot; include list/pagination support where the API allows.
3. **3.2.3:** Implement data mappers to transform BrickLink request/response payloads into our Convex `inventories` schema shapes and back (including fields like part identifier, condition, quantity, price, location, remarks/notes, status).
4. **3.2.4:** Support bulk operations where BrickLink API enables them; if not supported natively, provide chunked/sequenced operations with progress and partial-failure reporting.
5. **3.2.5:** Add resiliency: handle rate limits and transient failures via exponential backoff, retry policies, and idempotency (dedupe by request keys).
6. **3.2.6:** Provide structured logging (with correlation IDs) and metrics around request counts, latency, errors, and throttle events; no secrets in logs.
7. **3.2.7:** Include unit tests using HTTP mocking to validate signing, mapping correctness, error handling, and rate-limit behavior.

> Notes:
>
> - Expose a minimal, cohesive interface that the Convex layer can call (e.g., `createLot`, `getLot`, `updateLot`, `deleteLot`, `listLots`, `bulkUpdateLots`).

## Story 3.3: BrickOwl Client (Inventory Lots + Mappers)

As a **system**,
I want **a robust BrickOwl client with inventory lot CRUD and data mappers**,
so that **we can synchronize our users' store inventory to/from BrickOwl in a reliable and maintainable way**.

### Acceptance Criteria

1. **3.3.1:** Implement a typed BrickOwl client that authenticates with user-provided credentials (API key/secret formats as applicable).
2. **3.3.2:** Provide CRUD operations for store inventory lots: create lot, read/get lot(s), update lot, delete lot; include list/pagination support where the API allows.
3. **3.3.3:** Implement data mappers to transform BrickOwl request/response payloads into our Convex `inventories` schema shapes and back.
4. **3.3.4:** Support bulk operations where BrickOwl API enables them; if not supported natively, provide chunked/sequenced operations with progress and partial-failure reporting.
5. **3.3.5:** Add resiliency: handle rate limits and transient failures via exponential backoff, retry policies, and idempotency where possible.
6. **3.3.6:** Provide structured logging and metrics similar to the BrickLink client; no secrets in logs.
7. **3.3.7:** Include unit tests using HTTP mocking to validate mapping correctness and failure handling.

> Notes:
>
> - Expose the same cohesive interface as BrickLink to keep the Convex layer implementation symmetric.

## Story 3.4: Convex Orchestration Layer (Queries, Mutations, Actions)

As a **system**,
I want **a Convex layer that frontends our clients and orchestrates syncing**,
so that **the frontend can manage our canonical inventory while the system reliably syncs to BrickLink and BrickOwl**.

### Acceptance Criteria

1. **3.4.1:** Provide Convex queries/mutations for managing our canonical `inventories` data (create/update/delete/read) for authenticated users with RBAC enforcement.
2. **3.4.2:** Implement an `inventoryChangeLog` that records every inventory mutation with sufficient detail to support rollbacks (who, when, what changed, previous values, correlation ID).
3. **3.4.3:** Ensure atomicity: mutations update the `inventories` table and append an `inventoryChangeLog` entry in the same transaction.
4. **3.4.4:** Implement Convex actions/workflows that consume the change log and enqueue sync operations to BrickLink and BrickOwl, track per-change sync status, and retry with backoff on transient failures.
5. **3.4.5:** Provide idempotency for sync actions (deduplicate by change ID) and conflict handling if a marketplace rejects an update (surface status and reason back to UI).
6. **3.4.6:** Expose progress/status endpoints/queries so the UI can present sync state per inventory item and per change.
7. **3.4.7:** Provide a rollback capability that replays the inverse of a specific change (and enqueues compensating updates to marketplaces); guard with RBAC and audit logging.
8. **3.4.8:** Add observability: structured logs and metrics around queue depth, success/failure rates, retry counts, and latency; no secrets in logs.

> Notes:
>
> - Consider feature flags to gate external syncing per environment.
> - Ensure consistent mapping by delegating to the BrickLink/BrickOwl clients' data mappers.

## Story 3.5: Inventory Change History and Rollback UI

As a **user**,
I want **to view my complete inventory change history and rollback changes when needed**,
so that **I can track all inventory modifications, correct mistakes, and maintain full accountability over my inventory operations**.

### Acceptance Criteria

1. **3.5.1:** Provide a dedicated "Inventory Change History" UI accessible from the inventory management section showing all `inventoryChangeLog` entries for the user's business account with most recent changes displayed first (paginated).
2. **3.5.2:** Display comprehensive change details per entry: timestamp, actor (user who made the change), change type (create/update/adjust/delete), item identifier, delta values, reason/notes, and sync status to marketplaces.
3. **3.5.3:** Implement append-only audit logging: every change creates an immutable log entry, and undo operations create new compensating entries that reference the original change (never delete or modify existing logs).
4. **3.5.4:** Support undo functionality with explicit tracking: when a user undoes a change, create a new log entry marked as `isUndo: true` with `undoesLogId` referencing the original log, and update the original log with `undoneByLogId` to mark it as undone.
5. **3.5.5:** Allow users to undo an undo (effectively a redo): treating undo-of-undo as another compensating action with proper reference chain tracking in the audit log.
6. **3.5.6:** Provide visual indicators in the UI: show "[UNDONE]" badge on entries that have been reversed, "[UNDO]" badge on undo operations, and display the reference chain (e.g., "Undid change #123").
7. **3.5.7:** Implement "Undo" action buttons per change entry (where applicable) that prompt for a reason, execute the compensating operation on local inventory and enqueue marketplace syncs, then create the undo audit log entry atomically.
8. **3.5.8:** Prevent duplicate undos: disable undo button and show status if a change has already been undone (check `undoneByLogId` field).
9. **3.5.9:** Enforce RBAC on undo operations: only authorized users (with appropriate permissions) can perform rollbacks; audit who initiated each undo.
10. **3.5.10:** Provide filtering and search capabilities: filter by date range, change type, actor, item, or undo status; search by item identifier or reason text.
11. **3.5.11:** Show sync status per change: indicate if marketplace sync is pending, completed, or failed; surface any sync errors with actionable messages.
12. **3.5.12:** Ensure complete audit trail for compliance: all undo operations are logged with who performed the undo, when, and why; no logs are ever deleted or modified.

> Notes:
>
> - Schema should include `isUndo` (boolean), `undoesLogId` (reference to original log), `undoneByLogId` (set when this log is undone), and `reason` (user explanation) fields in `inventoryChangeLog`.
> - When processing an undo: (1) check if already undone, (2) execute compensating operation on inventory table, (3) enqueue marketplace sync, (4) create new undo log entry, (5) update original log with `undoneByLogId` — all in single transaction.
> - UI should clearly communicate the undo chain for transparency: "Alice created item → Bob deleted (undid Alice's create) → Alice created (undid Bob's undo)".
> - Consider displaying a timeline view or activity feed showing the evolution of specific inventory items through multiple changes and undos.

## Story 3.6: Inventory Upload and Import

As a **user**,
I want **to upload my existing inventory data in bulk**,
so that **I can quickly migrate my current inventory without manual entry**.

### Acceptance Criteria

1. **3.6.1:** User can upload XML files with inventory data
2. **3.6.2:** System validates uploaded data format and provides error feedback
3. **3.6.3:** System maps uploaded columns to inventory fields (part number, quantity, location, etc.)
4. **3.6.4:** User can preview and confirm data before import
5. **3.6.5:** System processes bulk import with progress indicators
6. **3.6.6:** System handles duplicate entries and provides resolution options
7. **3.6.7:** Import process completes within 30 seconds for 1000+ items

## Story 3.7: Advanced Inventory Management

As a **user**,
I want **comprehensive inventory management features**,
so that **I can efficiently organize and maintain large inventories**.

### Acceptance Criteria

1. **3.7.1:** User can organize inventory by location, category, or custom tags
2. **3.7.2:** User can perform bulk operations (edit, delete, status changes) on multiple items
3. **3.7.3:** System provides advanced filtering and sorting options
4. **3.7.4:** User can export inventory data in various formats
5. **3.7.5:** System maintains inventory history and change tracking
6. **3.7.6:** User can set low stock alerts and notifications
7. **3.7.7:** System provides inventory analytics and insights

## Story 3.8: Inventory Validation and Quality Control

As a **user**,
I want **inventory validation and quality control features**,
so that **I can maintain data accuracy and identify issues**.

### Acceptance Criteria

1. **3.8.1:** System validates part numbers against catalog database
2. **3.8.2:** System flags potential data inconsistencies or errors
3. **3.8.3:** User can review and correct flagged items
4. **3.8.4:** System provides data quality metrics and reports
5. **3.8.5:** System suggests corrections for common data entry errors
6. **3.8.6:** User can set up automated validation rules
7. **3.8.7:** System maintains data integrity across all operations
