# Order Normalization Test Gaps (Phase 0)

- No automated coverage for `convex/orders/normalizers/bricklink.ts` or `brickowl.ts`; normalization behaviour is only indirectly exercised via manual testing.
- No regression snapshots guard the current normalized order/order item shapes for BrickLink or BrickOwl.
- `convex/orders/ingestion.ts` lacks integration tests that assert normalized payloads insert consistent order and item documents.
- Shared helper routines (`toTimestamp`, `toNumber`, `ensureOrderId`) have no dedicated unit tests despite being critical for both providers.

## Planned Regression Coverage (Phase 6)

- Add snapshot-style tests for BrickLink and BrickOwl normalizers using the captured fixtures to prevent drift during refactor.
- Introduce unit tests for shared normalization helpers covering timestamps, numeric parsing, and order id validation.
- Add ingestion integration test that feeds normalized payloads and verifies downstream persistence without mutation of normalized data.
