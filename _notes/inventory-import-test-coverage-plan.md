# Inventory Import Test Coverage Plan

> **Goal:** Improve test coverage for the BrickLink → BrickOps inventory import flow while keeping the codebase simple, readable, and low-entropy.

## Overview

The inventory import process has several critical gaps in test coverage. This plan breaks down the work into discrete, independently implementable steps.

### Current State Summary

| Component | Tested? | Priority |
|-----------|---------|----------|
| `mapBlToConvexInventory` | ❌ | High |
| `initialBricklinkInventoryImport` | ❌ | High |
| `ensureCatalogPart` orchestrator | ❌ | Medium |
| BrickLink response validation | ❌ | Medium |
| Large import handling | ❌ | Low |

---

## Implementation Steps

Each step is designed to be completed independently in a single session.

---

### Step 1: BrickLink Inventory Transformer Tests

**File to create:** `__tests__/backend/marketplaces/bricklink/inventory/transformers.test.ts`

**Scope:** Test `mapBlToConvexInventory` function in isolation.

**Test cases:**
1. Valid BrickLink response → correct Convex shape
2. Missing `item.no` → throws clear error
3. Missing `color_id` → throws clear error
4. Missing `quantity` → throws clear error
5. Missing `new_or_used` → throws clear error
6. Condition mapping: `"N"` → `"new"`, `"U"` → `"used"`
7. Optional fields: `unit_price`, `remarks`, `description`, `my_cost`, `sale_rate`
8. Edge case: `item.name` missing → falls back to `item.no`

**Pattern to follow:** Mirror the existing `__tests__/backend/marketplaces/brickowl/inventory/transformers.test.ts`

**Acceptance criteria:**
- All 8 test cases pass
- No mocking required (pure function)
- Test file < 100 lines

---

### Step 2: BrickLink Inventory Transformer - Additional Edge Cases

**File to modify:** `__tests__/backend/marketplaces/bricklink/inventory/transformers.test.ts`

**Scope:** Add edge case coverage for `mapConvexToBlCreate` and `mapConvexToBlUpdate`.

**Test cases:**
1. `mapConvexToBlCreate` - valid Convex item → correct BL payload
2. `mapConvexToBlCreate` - missing `partNumber` → throws
3. `mapConvexToBlCreate` - price formatting (4 decimal places)
4. `mapConvexToBlUpdate` - quantity delta calculation
5. `mapConvexToBlUpdate` - positive delta → `"+N"` format
6. `mapConvexToBlUpdate` - negative delta → `"-N"` format
7. `mapConvexToBlUpdate` - no previous quantity → no `quantity` field

**Acceptance criteria:**
- All test cases pass
- Consistent with Step 1 style
- Combined file < 150 lines

---

### Step 3: Import Action - Happy Path Test

**File to create:** `__tests__/backend/inventory/import.test.ts`

**Scope:** Test `initialBricklinkInventoryImport` with mocked dependencies.

**Test cases:**
1. Empty BrickLink inventory → returns `{ imported: 0, errors: [] }`
2. Single valid item → returns `{ imported: 1, errors: [] }`
3. Multiple valid items → returns correct `imported` count

**Mocking strategy:**
- Mock `getBLInventories` to return controlled test data
- Mock `ctx.runMutation` to verify correct args passed
- Mock `ctx.runAction` for `ensureCatalogPart` (no-op)

**Pattern to follow:** Use `createConvexTestContext` from `test-utils/convex-test-context.ts`

**Acceptance criteria:**
- Tests verify return value structure
- Tests verify mutation called with correct transformed data
- No flaky async behavior

---

### Step 4: Import Action - Error Handling Tests

**File to modify:** `__tests__/backend/inventory/import.test.ts`

**Scope:** Test error scenarios in `initialBricklinkInventoryImport`.

**Test cases:**
1. Transformer throws (invalid BL data) → error captured in `errors` array, import continues
2. Mutation throws → error captured, other items still processed
3. `ensureCatalogPart` throws → warning logged, import still succeeds
4. Mixed success/failure → correct counts in return value

**Acceptance criteria:**
- Errors don't halt the entire import
- Error messages are captured with part identifier
- Return value reflects actual success/failure counts

---

### Step 5: Catalog Ensure - Freshness Status Query Tests

**File to create:** `__tests__/backend/catalog/ensure.test.ts`

**Scope:** Test `getPartFreshnessStatus` and `getColorFreshnessStatus` queries.

**Test cases:**
1. Part not in DB → `partFresh: false`
2. Part exists and recent → `partFresh: true`
3. Part exists but stale → `partFresh: false`
4. Part colors missing → `colorsFresh: false`
5. Global colors missing BrickOwl mapping → `globalColorsFresh: false`
6. Prices missing → `pricesFresh: false`
7. All data fresh → `allFresh: true`
8. `forceRefresh: true` → all fields report stale

**Acceptance criteria:**
- Pure query tests (no mocking external APIs)
- Use `createConvexTestContext` with seeded data
- Clear test data setup showing each scenario

---

### Step 6: Catalog Ensure - Step Progression Tests

**File to modify:** `__tests__/backend/catalog/ensure.test.ts`

**Scope:** Test `ensureCatalogPart` step state machine.

**Test cases:**
1. All data fresh → returns `{ status: "complete" }` immediately
2. Part stale → schedules self with `_step: "part"`
3. Part fresh, colors stale → schedules with `_step: "colors"`
4. Colors fresh, global colors stale → schedules with `_step: "global_colors"`
5. Global colors fresh, prices stale → schedules with `_step: "prices"`
6. `onComplete` callback fires when complete

**Mocking strategy:**
- Mock `ctx.runQuery` for freshness status
- Mock `ctx.scheduler.runAfter` to capture scheduled calls
- Mock external API calls (no real network)

**Acceptance criteria:**
- Tests verify correct step transitions
- No actual API calls made
- State machine logic is clear

---

### Step 7: Catalog Ensure - Rate Limit Retry Tests

**File to modify:** `__tests__/backend/catalog/ensure.test.ts`

**Scope:** Test rate limit handling in `ensureCatalogPart`.

**Test cases:**
1. Rate limit denied → schedules retry with `token.retryAfter` delay
2. Rate limit denied at max retries → throws error
3. Rate limit granted → proceeds to API call

**Mocking strategy:**
- Mock `consumeToken` to return `{ ok: false, retryAfter: 5000 }`
- Verify `ctx.scheduler.runAfter` called with correct delay

**Acceptance criteria:**
- Retry logic is tested without real rate limiting
- Max retry behavior is verified
- No flaky timing-based tests

---

### Step 8: Integration Test - Full Import Flow (Optional)

**File to create:** `__tests__/backend/inventory/import-integration.test.ts`

**Scope:** End-to-end test with minimal mocking.

**Test cases:**
1. Import 3 items → all persisted to DB with correct structure
2. Verify ledger entries created
3. Verify marketplace sync status set correctly
4. Verify catalog placeholder created for unknown parts

**Note:** This is a heavier test that exercises more of the real system. Consider if the unit tests from Steps 1-7 provide sufficient confidence.

**Acceptance criteria:**
- Uses real Convex test DB
- Mocks only external HTTP calls
- Verifies end-to-end data flow

---

## Implementation Order

**Recommended sequence:**

```
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7
                                                        ↓
                                              Step 8 (optional)
```

Steps 1-2 can be done first as they test pure functions with no dependencies.
Steps 3-4 depend on understanding the transformer behavior.
Steps 5-7 can be done in parallel with Steps 3-4 if desired.

---

## Guiding Principles

1. **Keep tests simple** - Each test should verify one behavior
2. **Mirror existing patterns** - Follow conventions in `__tests__/backend/`
3. **Minimize mocking** - Prefer testing pure functions; mock only at boundaries
4. **Readable assertions** - Use `toMatchObject` for partial matching
5. **No flaky tests** - Avoid timing-dependent assertions
6. **Low entropy** - Each test file should have a single, clear purpose

---

## Files That Will Be Created/Modified

| Step | File | Action |
|------|------|--------|
| 1 | `__tests__/backend/marketplaces/bricklink/inventory/transformers.test.ts` | Create |
| 2 | `__tests__/backend/marketplaces/bricklink/inventory/transformers.test.ts` | Modify |
| 3 | `__tests__/backend/inventory/import.test.ts` | Create |
| 4 | `__tests__/backend/inventory/import.test.ts` | Modify |
| 5 | `__tests__/backend/catalog/ensure.test.ts` | Create |
| 6 | `__tests__/backend/catalog/ensure.test.ts` | Modify |
| 7 | `__tests__/backend/catalog/ensure.test.ts` | Modify |
| 8 | `__tests__/backend/inventory/import-integration.test.ts` | Create (optional) |

---

## Reference Files

When implementing, refer to these existing files for patterns:

- **Transformer tests:** `__tests__/backend/marketplaces/brickowl/inventory/transformers.test.ts`
- **Action tests with mocking:** `__tests__/backend/inventory-sync-worker.test.ts`
- **Mutation tests with seeded data:** `__tests__/backend/inventory-lifecycle-colors.test.ts`
- **Test context utilities:** `test-utils/convex-test-context.ts`

---

## Success Criteria

After completing all steps:

- [ ] `mapBlToConvexInventory` has 100% branch coverage
- [ ] `mapConvexToBlCreate` and `mapConvexToBlUpdate` have 100% branch coverage
- [ ] `initialBricklinkInventoryImport` has happy path + error path coverage
- [ ] `getPartFreshnessStatus` query logic is fully tested
- [ ] `ensureCatalogPart` state machine transitions are verified
- [ ] Rate limit retry behavior is tested
- [ ] All new tests pass in CI
- [ ] No increase in test flakiness
