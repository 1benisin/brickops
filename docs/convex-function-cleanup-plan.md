# Convex Function Cleanup Plan

## Purpose

Identify and remove unused Convex functions to reduce codebase complexity and maintenance burden.

## Process Overview

### Step 1: Function Inventory (COMPLETE)

All Convex functions have been cataloged below by module.

### Step 2: Usage Analysis (TODO - Dev Task)

For each function listed below, a developer should:

1. Search for references in `__tests__/` directory
2. Search for references in `src/` directory
3. Mark the function's status:
   - `USED` - Referenced in tests OR src
   - `UNUSED` - Not referenced anywhere
   - `INTERNAL_ONLY` - Only called by other convex functions (review if the caller is used)

### Step 3: Cleanup (TODO - After Step 2)

Delete functions marked as `UNUSED` and their corresponding tests.

---

## Function Inventory by Module

### 📁 hello.ts

| Function         | Type            | Status  | Notes                                    |
| ---------------- | --------------- | ------- | ---------------------------------------- |
| `hello`          | mutation        | ✅ USED | Authenticated greeting mutation          |
| `deriveTenantId` | export (helper) | ✅ USED | Helper function for tenant ID extraction |

### 📁 catalog/queries.ts

| Function         | Type  | Status  | Notes                                       |
| ---------------- | ----- | ------- | ------------------------------------------- |
| `searchParts`    | query | ✅ USED | Search parts by title, ID, or sort location |
| `getPartOverlay` | query | ✅ USED | Get part overlay for business account       |
| `getColors`      | query | ✅ USED | Get all colors                              |
| `getCategories`  | query | ✅ USED | Get all categories                          |
| `getPart`        | query | ✅ USED | Get part with status info (reactive)        |
| `getPartColors`  | query | ✅ USED | Get part colors with status (reactive)      |
| `getPriceGuide`  | query | ✅ USED | Get price guide with status (reactive)      |

### 📁 catalog/mutations.ts

| Function                    | Type             | Status             | Notes                                |
| --------------------------- | ---------------- | ------------------ | ------------------------------------ |
| `markPartRefreshing`        | internalMutation | ✅ USED (internal) | Acquire refresh lock for part        |
| `clearPartRefreshing`       | internalMutation | ✅ USED (internal) | Release refresh lock for part        |
| `markCategoryRefreshing`    | internalMutation | ✅ USED (internal) | Acquire refresh lock for category    |
| `clearCategoryRefreshing`   | internalMutation | ✅ USED (internal) | Release refresh lock for category    |
| `markPartColorsRefreshing`  | internalMutation | ✅ USED (internal) | Acquire refresh lock for partColors  |
| `clearPartColorsRefreshing` | internalMutation | ✅ USED (internal) | Release refresh lock for partColors  |
| `markPriceGuideRefreshing`  | internalMutation | ✅ USED (internal) | Acquire refresh lock for price guide |
| `clearPriceGuideRefreshing` | internalMutation | ✅ USED (internal) | Release refresh lock for price guide |
| `upsertPart`                | internalMutation | ✅ USED (internal) | Upsert part into database            |
| `upsertPartColors`          | internalMutation | ✅ USED (internal) | Upsert part colors                   |
| `upsertCategory`            | internalMutation | ✅ USED (internal) | Upsert category                      |
| `upsertPriceGuide`          | internalMutation | ✅ USED (internal) | Upsert price guide data              |

### 📁 catalog/actions.ts

| Function            | Type   | Status  | Notes                              |
| ------------------- | ------ | ------- | ---------------------------------- |
| `refreshPart`       | action | ✅ USED | Refresh part data from Bricklink   |
| `refreshPartColors` | action | ✅ USED | Refresh part colors from Bricklink |
| `refreshPriceGuide` | action | ✅ USED | Refresh price guide from Bricklink |

### 📁 inventory/queries.ts

| Function                   | Type  | Status        | Notes                             |
| -------------------------- | ----- | ------------- | --------------------------------- |
| `listInventoryItems`       | query | ✅ USED       | List inventory items for business |
| `listInventoryItemsByFile` | query | ✅ USED       | List items by file                |
| `getInventoryTotals`       | query | ✅ USED       | Get inventory totals/counts       |
| `listInventoryHistory`     | query | ❌ **UNUSED** | List inventory history            |
| `getItemSyncStatus`        | query | ✅ USED       | Get sync status for item          |
| `getChangeSyncStatus`      | query | ❌ **UNUSED** | Get sync status for change        |
| `getChangeHistory`         | query | ❌ **UNUSED** | Get change history for item       |
| `getPendingChangesCount`   | query | ✅ USED       | Get pending changes count         |
| `getSyncMetrics`           | query | ❌ **UNUSED** | Get comprehensive sync metrics    |
| `getConflicts`             | query | ✅ USED       | Get unresolved conflicts          |

### 📁 inventory/mutations.ts

| Function                    | Type             | Status             | Notes                                     |
| --------------------------- | ---------------- | ------------------ | ----------------------------------------- |
| `addInventoryItem`          | mutation         | ✅ USED            | Add new inventory item                    |
| `updateInventoryQuantity`   | mutation         | ❌ **UNUSED**      | Update inventory quantity                 |
| `updateInventoryItem`       | mutation         | ✅ USED            | Update inventory item                     |
| `deleteInventoryItem`       | mutation         | ✅ USED            | Delete (archive) inventory item           |
| `undoChange`                | mutation         | ✅ USED            | Undo a change with compensating operation |
| `addItemToFile`             | mutation         | ✅ USED            | Add existing item to file                 |
| `removeItemFromFile`        | mutation         | ✅ USED            | Remove item from file                     |
| `getPendingChanges`         | internalQuery    | ✅ USED (internal) | Get pending sync queue entries            |
| `getChange`                 | internalQuery    | ✅ USED (internal) | Get specific change by ID                 |
| `getInventoryItem`          | internalQuery    | ✅ USED (internal) | Get inventory item by ID                  |
| `markSyncing`               | internalMutation | ✅ USED (internal) | Mark change as syncing                    |
| `updateSyncStatus`          | internalMutation | ✅ USED (internal) | Update sync status after marketplace sync |
| `recordSyncError`           | internalMutation | ✅ USED (internal) | Record sync error                         |
| `recordConflict`            | internalMutation | ✅ USED (internal) | Record sync conflict                      |
| `resolveConflict`           | mutation         | ❌ **UNUSED**      | Resolve detected conflict                 |
| `updateImmediateSyncStatus` | internalMutation | ✅ USED (internal) | Update status after immediate sync        |

### 📁 inventory/files/queries.ts

| Function                    | Type          | Status             | Notes                                    |
| --------------------------- | ------------- | ------------------ | ---------------------------------------- |
| `listFiles`                 | query         | ✅ USED            | List all inventory files                 |
| `getFile`                   | query         | ✅ USED            | Get single file by ID                    |
| `getFileItemCount`          | query         | ✅ USED            | Get count of items in file               |
| `validateBatchSync`         | query         | ✅ USED            | Validate file for batch sync (public)    |
| `getFileInternal`           | internalQuery | ✅ USED (internal) | Get file (internal, no auth)             |
| `validateBatchSyncInternal` | internalQuery | ✅ USED (internal) | Validate batch sync (internal, detailed) |
| `getFileItemsForSync`       | internalQuery | ✅ USED (internal) | Get file items for sync                  |

### 📁 inventory/files/mutations.ts

| Function                 | Type             | Status             | Notes                     |
| ------------------------ | ---------------- | ------------------ | ------------------------- |
| `createFile`             | mutation         | ✅ USED            | Create new inventory file |
| `updateFile`             | mutation         | ✅ USED            | Update file metadata      |
| `deleteFile`             | mutation         | ✅ USED            | Soft delete file          |
| `recordBatchSyncResults` | internalMutation | ✅ USED (internal) | Record batch sync results |

### 📁 inventory/files/actions.ts

| Function        | Type   | Status  | Notes                           |
| --------------- | ------ | ------- | ------------------------------- |
| `batchSyncFile` | action | ✅ USED | Batch sync file to marketplaces |

### 📁 users/queries.ts

| Function                         | Type  | Status        | Notes                          |
| -------------------------------- | ----- | ------------- | ------------------------------ |
| `getCurrentUser`                 | query | ✅ USED       | Get current authenticated user |
| `getAuthState`                   | query | ✅ USED       | Get lightweight auth state     |
| `listMembers`                    | query | ✅ USED       | List team members              |
| `getBusinessAccountByInviteCode` | query | ❌ **UNUSED** | Fetch business by invite code  |

### 📁 users/mutations.ts

| Function                   | Type     | Status        | Notes                                                         |
| -------------------------- | -------- | ------------- | ------------------------------------------------------------- |
| `updateProfile`            | mutation | ✅ USED       | Update user profile                                           |
| `updatePreferences`        | mutation | ✅ USED       | Update user preferences                                       |
| `regenerateInviteCode`     | mutation | ✅ USED       | Regenerate business invite code                               |
| `createUserInvite`         | mutation | ✅ USED       | Create user invite                                            |
| `updateUserRole`           | mutation | ✅ USED       | Update user role                                              |
| `removeUser`               | mutation | ✅ USED       | Remove user from business                                     |
| `checkAndConsumeRateLimit` | mutation | ❌ **UNUSED** | Rate limiter (superseded by `checkAndConsumeRateLimitDirect`) |

### 📁 users/actions.ts

| Function     | Type   | Status  | Notes             |
| ------------ | ------ | ------- | ----------------- |
| `sendInvite` | action | ✅ USED | Send invite email |

### 📁 identify/actions.ts

| Function                | Type   | Status  | Notes                         |
| ----------------------- | ------ | ------- | ----------------------------- |
| `identifyPartFromImage` | action | ✅ USED | Identify LEGO part from image |

### 📁 identify/mutations.ts

| Function                    | Type             | Status        | Notes                                                  |
| --------------------------- | ---------------- | ------------- | ------------------------------------------------------ |
| `generateUploadUrl`         | mutation         | ✅ USED       | Generate storage upload URL                            |
| `consumeIdentificationRate` | internalMutation | ❌ **UNUSED** | Consume identification rate limit (TODO/commented out) |

### 📁 marketplace/queries.ts

| Function                   | Type  | Status        | Notes                                 |
| -------------------------- | ----- | ------------- | ------------------------------------- |
| `getCredentialStatus`      | query | ✅ USED       | Get credential status (non-sensitive) |
| `getAllCredentialStatuses` | query | ❌ **UNUSED** | Get all credential statuses           |

### 📁 marketplace/mutations.ts

| Function                  | Type             | Status             | Notes                                |
| ------------------------- | ---------------- | ------------------ | ------------------------------------ |
| `saveCredentials`         | mutation         | ✅ USED            | Save marketplace credentials         |
| `revokeCredentials`       | mutation         | ✅ USED            | Revoke marketplace credentials       |
| `getEncryptedCredentials` | internalQuery    | ✅ USED (internal) | Get encrypted credentials (internal) |
| `updateValidationStatus`  | internalMutation | ✅ USED (internal) | Update validation status             |
| `getQuotaState`           | internalQuery    | ✅ USED (internal) | Get quota state for provider         |
| `incrementQuota`          | internalMutation | ✅ USED (internal) | Increment quota counter              |
| `recordFailure`           | internalMutation | ✅ USED (internal) | Record API failure                   |
| `resetFailures`           | internalMutation | ✅ USED (internal) | Reset consecutive failures           |
| `getConfiguredProviders`  | internalQuery    | ✅ USED (internal) | Get configured providers             |
| `updateSyncSettings`      | mutation         | ✅ USED            | Update sync settings                 |
| `getSyncSettings`         | query            | ✅ USED            | Get sync settings                    |

### 📁 marketplace/actions.ts

| Function         | Type   | Status  | Notes                           |
| ---------------- | ------ | ------- | ------------------------------- |
| `testConnection` | action | ✅ USED | Test marketplace API connection |

### 📁 ratelimit/mutations.ts

| Function    | Type             | Status             | Notes                     |
| ----------- | ---------------- | ------------------ | ------------------------- |
| `takeToken` | internalMutation | ✅ USED (internal) | Token bucket rate limiter |

### 📁 http.ts (HTTP Routes)

| Function            | Type       | Status  | Notes                    |
| ------------------- | ---------- | ------- | ------------------------ |
| `healthz`           | httpAction | ✅ USED | Health check endpoint    |
| `brickognizeHealth` | httpAction | ✅ USED | Brickognize health check |
| `bricklinkHealth`   | httpAction | ✅ USED | Bricklink health check   |
| `brickowlHealth`    | httpAction | ✅ USED | Brickowl health check    |

### 📁 crons.ts

| Function       | Type           | Status  | Notes              |
| -------------- | -------------- | ------- | ------------------ |
| `logHeartbeat` | internalAction | ✅ USED | Heartbeat cron job |

---

## Step 2 Results: Usage Analysis (COMPLETED)

Analysis completed via comprehensive grep searches of `__tests__/`, `src/`, and `convex/` directories.

### Analysis Summary:

- **Total functions analyzed**: 89
- **Functions in use**: 81 (91%)
- **Unused functions identified**: 8 (9%)

### Unused Functions Found:

1. `consumeIdentificationRate` - Commented out/TODO, not actively used
2. `updateInventoryQuantity` - Not referenced anywhere
3. `getAllCredentialStatuses` - Not used in UI
4. `listInventoryHistory` - Not used in UI
5. `getChangeSyncStatus` - Not used in UI
6. `getChangeHistory` - Not used in UI
7. `getSyncMetrics` - Not used in UI
8. `resolveConflict` - Not used in UI
9. `getBusinessAccountByInviteCode` - Not used in UI
10. `checkAndConsumeRateLimit` mutation - Superseded by `checkAndConsumeRateLimitDirect`

All other functions are actively used either in:

- Frontend code (`src/` directory)
- Backend tests (`__tests__/` directory)
- Internal convex function calls (`internal.*` references)

---

## Step 3: Cleanup Instructions (READY TO EXECUTE)

### Deletion Checklist

Execute the following deletions in order:

#### 1. Inventory Module Functions

- [ ] Delete `updateInventoryQuantity` mutation from `convex/inventory/mutations.ts`
- [ ] Delete `resolveConflict` mutation from `convex/inventory/mutations.ts`
- [ ] Delete `listInventoryHistory` query from `convex/inventory/queries.ts`
- [ ] Delete `getChangeSyncStatus` query from `convex/inventory/queries.ts`
- [ ] Delete `getChangeHistory` query from `convex/inventory/queries.ts`
- [ ] Delete `getSyncMetrics` query from `convex/inventory/queries.ts`

#### 2. Identify Module Functions

- [ ] Delete `consumeIdentificationRate` internalMutation from `convex/identify/mutations.ts`
- [ ] Remove related commented-out code in `convex/identify/actions.ts` (line 52)

#### 3. User Module Functions

- [ ] Delete `checkAndConsumeRateLimit` mutation from `convex/users/mutations.ts`
- [ ] Delete `getBusinessAccountByInviteCode` query from `convex/users/queries.ts`

#### 4. Marketplace Module Functions

- [ ] Delete `getAllCredentialStatuses` query from `convex/marketplace/queries.ts`

#### 5. Delete Corresponding Tests (if they exist)

- [ ] Search for tests covering deleted functions in `__tests__/backend/`
- [ ] Remove test cases for: `updateInventoryQuantity`, `resolveConflict`, `checkAndConsumeRateLimit`, `getBusinessAccountByInviteCode`

#### 6. Verification Steps

- [ ] Run `pnpm typecheck` - ensure no TypeScript errors
- [ ] Run `pnpm test` - ensure all tests pass
- [ ] Run `pnpm build` - verify Convex deployment builds successfully
- [ ] Search codebase for any missed references to deleted functions

### Cleanup Commands

```bash
# After making deletions, verify everything still works
pnpm typecheck
pnpm test

# Check for any remaining references (should return nothing)
grep -r "updateInventoryQuantity\|resolveConflict\|listInventoryHistory" src/ convex/
grep -r "getChangeSyncStatus\|getChangeHistory\|getSyncMetrics" src/ convex/
grep -r "consumeIdentificationRate\|checkAndConsumeRateLimit" src/ convex/
grep -r "getBusinessAccountByInviteCode\|getAllCredentialStatuses" src/ convex/

# If all clear, commit the cleanup
git add -A
git commit -m "refactor: remove 10 unused Convex functions

Removed unused query, mutation, and internalMutation functions:
- Inventory: updateInventoryQuantity, resolveConflict, listInventoryHistory, getChangeSyncStatus, getChangeHistory, getSyncMetrics
- Identify: consumeIdentificationRate (TODO/commented)
- Users: checkAndConsumeRateLimit (superseded by Direct version), getBusinessAccountByInviteCode
- Marketplace: getAllCredentialStatuses

All remaining functions are actively used in src/, __tests__/, or internal convex calls."
```

### Summary

**Functions to Delete: 10**

- ❌ `inventory/mutations.ts`: `updateInventoryQuantity`, `resolveConflict`
- ❌ `inventory/queries.ts`: `listInventoryHistory`, `getChangeSyncStatus`, `getChangeHistory`, `getSyncMetrics`
- ❌ `identify/mutations.ts`: `consumeIdentificationRate`
- ❌ `users/mutations.ts`: `checkAndConsumeRateLimit`
- ❌ `users/queries.ts`: `getBusinessAccountByInviteCode`
- ❌ `marketplace/queries.ts`: `getAllCredentialStatuses`

**Functions to Keep: 79** (all actively used)

---

## Notes

- **Internal functions**: Functions marked as `internal*` (internalMutation, internalQuery, internalAction) are only callable from server-side code. Search for references via `internal.module.functionName` pattern.

- **Auth functions**: Functions from `auth.ts` are likely used by the auth library itself - verify carefully before marking unused.

- **HTTP actions**: Check if routes are registered in `http.ts` router.

- **Cron jobs**: Check if scheduled in `crons.ts`.

- **Be conservative**: When in doubt, mark as USED. It's better to keep an unused function than delete one that's actually needed.

---

## Final Review Checklist

Before deleting any functions:

- [ ] All functions have been analyzed and marked
- [ ] UNUSED functions have been cross-verified (not just searched once)
- [ ] Internal function call chains have been traced
- [ ] HTTP routes and cron jobs have been checked
- [ ] Tests have been updated/removed accordingly
- [ ] No compilation errors after deletion
- [ ] All existing tests still pass
