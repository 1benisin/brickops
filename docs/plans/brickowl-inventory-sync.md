# BrickOwl Inventory Sync Implementation Plan

## Overview

This plan outlines the implementation of create, update, and delete inventory operations for BrickOwl marketplace, following the same patterns established for Bricklink.

## Current State Analysis

### Bricklink Implementation (Reference)

Bricklink has a complete, working implementation:

#### 1. **Store Client Methods** (`convex/marketplaces/bricklink/storeClient.ts`)

- **`createInventory(payload, options?)`**:

  - Takes `BricklinkInventoryCreateRequest` (mapped from Convex)
  - Calls `POST /inventories`
  - Returns `StoreOperationResult` with `marketplaceId` (inventory_id)
  - Supports dry-run mode
  - Includes rollback data in response

- **`updateInventory(inventoryId, payload, options?)`**:

  - Takes inventory ID and `BricklinkInventoryUpdateRequest` (mapped from Convex)
  - Uses delta-based quantity updates (`"+5"`, `"-3"` format)
  - Calls `PUT /inventories/{inventory_id}`
  - Returns `StoreOperationResult`
  - Validates payload before execution
  - Supports dry-run mode

- **`deleteInventory(inventoryId, options?)`**:
  - Takes inventory ID
  - Calls `DELETE /inventories/{inventory_id}`
  - Returns `StoreOperationResult`
  - Validates inventory ID
  - Supports dry-run mode

#### 2. **Mappers** (`convex/marketplaces/bricklink/storeMappers.ts`)

- **`mapConvexToBricklinkCreate(convexInventory)`**: Maps Convex inventory to Bricklink create payload
- **`mapConvexToBricklinkUpdate(convexInventory, previousQuantity?)`**:
  - Maps Convex inventory to Bricklink update payload
  - **CRITICAL**: Calculates quantity delta using `previousQuantity` anchor
  - Always includes all fields (price, condition, description, remarks)

#### 3. **Sync Layer Integration** (`convex/inventory/sync.ts`)

- **`syncCreate()`**: Uses `mapConvexToBricklinkCreate()` to prepare payload
- **`syncUpdate()`**:
  - Gets `marketplaceId` from inventory item's sync status
  - Uses `mapConvexToBricklinkUpdate(item, previousQuantity)` with anchor quantity
  - Falls back to create if no `marketplaceId` exists
- **`syncDelete()`**: Gets `marketplaceId` from sync status, calls delete

#### 4. **Sync Worker Integration** (`convex/inventory/syncWorker.ts`)

- **`callMarketplaceAPI()`**:
  - **Create**: Uses `mapConvexToBricklinkCreate()` for Bricklink
  - **Update**: Uses `mapConvexToBricklinkUpdate(item, anchorAvailable)` with anchor from `lastSyncedAvailable`
  - **Delete**: Gets `marketplaceId` from sync status

### BrickOwl Current State

#### ✅ Already Implemented

1. **Store Client Methods** (`convex/marketplaces/brickowl/storeClient.ts`):

   - ✅ `createInventory(payload, options?)` - Fully implemented
   - ✅ `updateInventory(identifier, payload, options?)` - Method exists but needs proper mapper integration
   - ✅ `deleteInventory(identifier, options?)` - Fully implemented

2. **Mappers** (`convex/marketplaces/brickowl/storeMappers.ts`):
   - ✅ `mapConvexToBrickOwlCreate(convexInventory)` - Implemented
   - ✅ `mapConvexToBrickOwlUpdate(convexInventory, previousQuantity?, useAbsolute?)` - Implemented but not used properly

#### ❌ Missing/Incorrect Integration

1. **Sync Layer** (`convex/inventory/sync.ts`):

   - ❌ Line 272: `syncUpdate()` passes raw `args.newData` instead of using `mapConvexToBrickOwlUpdate()`
   - ❌ Missing `previousQuantity` calculation for BrickOwl updates

2. **Sync Worker** (`convex/inventory/syncWorker.ts`):
   - ❌ Line 329-340: `callMarketplaceAPI()` passes raw `args.item` instead of using `mapConvexToBrickOwlUpdate()`
   - ❌ Missing anchor quantity calculation for BrickOwl (similar to Bricklink's `anchorAvailable`)

## Development Context & Constraints

### Current Development State

1. **Test Accounts Only**:

   - We're in development and only have BrickOps marketplace test accounts
   - API exploration/testing will use these test accounts
   - All API calls should be made carefully to avoid issues with test data

2. **Inventory Condition Mapping**:

   - **BrickOps** uses simplified conditions: `"new"` or `"used"`
   - **Bricklink** statuses used: `"new"` and `"used - like new"` (mapped to `"new"` or `"used"` in BrickOps)
   - **BrickOwl** condition codes:
     - `"new"` → `"new"` (for BrickOps "new")
     - `"usedn"` → `"used"` (for BrickOps "used" - maps to "Used (Like New)" in BrickOwl)
   - **Note**: Current mapper uses `"usedc"` (Used Complete) but should use `"usedn"` (Used Like New) to match our inventory model

3. **Field Mapping**:
   - **BrickOwl `personal_note`** → **BrickOps `location`** (private internal location)
   - **BrickOwl `public_note`** → **BrickOps `notes`** (public-facing description)
   - This mapping is already correct in the current implementation

## API Documentation Gaps & Exploration

### Known Issues with BrickOwl API Documentation

1. **Missing Response Type Documentation**:

   - API docs don't specify what fields are returned in responses
   - We need to make actual API calls to document response structures
   - Current `BrickOwlInventoryResponse` interface is based on assumptions/testing

2. **Create vs Update Field Discrepancy**:

   - **Create endpoint** (docs): Only lists `boid`, `color_id`, `quantity`, `price`, `condition`, `external_id`
   - **Update endpoint** (docs): Has many more fields (`personal_note`, `public_note`, `bulk_qty`, `tier_price`, `my_cost`, `lot_weight`, etc.)
   - **Our implementation**: `CreateInventoryPayload` already includes extra fields (assumed they work)
   - **Need to verify**: Does create actually accept these fields even though docs don't mention them?

3. **Response Structure Unknown**:
   - Create response: What fields does it return? Just `lot_id`? Full inventory object?
   - Update response: What's the exact structure?
   - Delete response: What's returned on success?

### API Exploration Plan

**Phase 0: Document Actual API Behavior**

Before implementing sync fixes, we should:

1. **Create Test/Exploration Script**:

   - Make actual API calls to BrickOwl with real credentials
   - Log full request/response payloads
   - Document discovered response structures
   - Test if create accepts undocumented fields

2. **Update Internal Documentation**:

   - Document actual response types in `docs/external-documentation/api-brickowl/`
   - Create response type reference file
   - Update our TypeScript interfaces based on actual responses

3. **Verify Field Support**:

   - Test create with `personal_note`, `public_note`, `bulk_qty`, `tier_price`, `my_cost`, `lot_weight`
   - If they work, document them as supported (even if not in official docs)
   - If they don't work, remove them from `CreateInventoryPayload`

4. **Document Response Structures**:
   - Create: What does `POST /inventory/create` actually return?
   - Update: What does `POST /inventory/update` actually return?
   - Delete: What does `POST /inventory/delete` actually return?
   - List: Verify `GET /inventory/list` response structure matches our interface

### Recommended Approach

Since we can't easily test live API calls during development, we should:

1. **Add API exploration logging** to existing client methods:

   - Log full responses
   - Use this data to update our TypeScript interfaces
   - Document in internal docs

2. **Create test inventory items** in a test account:

   - Make create/update/delete calls
   - Capture actual responses
   - Update documentation

3. **Update response interfaces** based on findings:
   - Modify `BrickOwlInventoryResponse` if needed
   - Update `StoreOperationResult` if create/update return different structures
   - Document any discrepancies from official docs

## Implementation Plan

### Phase 0: API Exploration & Documentation (Optional but Recommended)

**Goal**: Document actual API behavior before implementation

**Note**: Use BrickOps test marketplace accounts for all API exploration

- [ ] Create test script to explore API responses
- [ ] Make test create/update/delete calls and log responses (using test accounts)
- [ ] Test if create accepts undocumented fields
- [ ] Document actual response structures
- [ ] Update TypeScript interfaces based on findings
- [ ] Update internal documentation
- [ ] Verify condition mapping works correctly with `"new"` and `"usedn"` (Used Like New)

### Phase 1: Fix Sync Layer (`convex/inventory/sync.ts`)

**File**: `convex/inventory/sync.ts`

**Changes Required**:

1. **Import mapper** (already imported, verify it's there):

```typescript
import {
  mapConvexToBrickOwlCreate,
  mapConvexToBrickOwlUpdate,
} from "../marketplaces/brickowl/storeMappers";
```

2. **Fix `syncUpdate()` function** (lines 238-281):
   - Currently passes raw `args.newData` for BrickOwl (line 272)
   - Should use `mapConvexToBrickOwlUpdate()` similar to Bricklink pattern
   - Need to calculate `previousQuantity` from `previousData`

**Current Code** (lines 269-274):

```typescript
const payload =
  marketplace === "bricklink"
    ? mapConvexToBricklinkUpdate(args.newData as Doc<"inventoryItems">, previousQuantity)
    : (args.newData as Record<string, unknown>);
```

**Should Become**:

```typescript
const payload =
  marketplace === "bricklink"
    ? mapConvexToBricklinkUpdate(args.newData as Doc<"inventoryItems">, previousQuantity)
    : mapConvexToBrickOwlUpdate(args.newData as Doc<"inventoryItems">, previousQuantity);
```

### Phase 2: Fix Sync Worker (`convex/inventory/syncWorker.ts`)

**File**: `convex/inventory/syncWorker.ts`

**Changes Required**:

1. **Import mapper** (add if missing):

```typescript
import { mapConvexToBrickOwlUpdate } from "../marketplaces/brickowl/storeMappers";
```

2. **Fix `callMarketplaceAPI()` update case** (lines 290-340):
   - Currently passes raw `args.item` for BrickOwl (line 331)
   - Should use `mapConvexToBrickOwlUpdate()` with anchor quantity
   - Calculate `anchorAvailable` for BrickOwl (same as Bricklink pattern)

**Current Code** (lines 329-340):

```typescript
} else {
  // BrickOwl: Pass full item data (no delta-based update yet)
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = await (client as any).updateInventory(marketplaceId, args.item, {
    idempotencyKey,
  });
  // ...
}
```

**Should Become**:

```typescript
} else {
  // BrickOwl update: Map with the anchor quantity (similar to Bricklink)
  const payload = mapConvexToBrickOwlUpdate(
    args.item,
    anchorAvailable, // Previous quantity (anchor)
    false, // Use relative_quantity mode (delta-based)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (client as any).updateInventory(marketplaceId, payload, {
    idempotencyKey,
  });
  // ...
}
```

### Phase 3: Verify Mapper Implementation

**File**: `convex/marketplaces/brickowl/storeMappers.ts`

**Verification Checklist**:

**Note**: Before finalizing, we should verify that `mapConvexToBrickOwlCreate()` includes only fields that the API actually accepts. The mapper currently includes fields (`personal_note`, `public_note`, `bulk_qty`, `tier_price`, `my_cost`, `lot_weight`) that aren't documented in the create endpoint docs. We should test if these work or remove them.

**Important**: Condition mapping needs to be updated:

- Current mapper uses `"usedc"` (Used Complete) for used items
- Should use `"usedn"` (Used Like New) to match our inventory model which only uses "new" and "used - like new"
- Update `mapConvexToBrickOwlCreate()` and `mapConvexToBrickOwlUpdate()` to use `"usedn"` instead of `"usedc"`

1. ✅ `mapConvexToBrickOwlUpdate()` exists and handles:

   - Quantity delta calculation (relative_quantity mode)
   - Price mapping
   - Condition mapping
   - Location → personal_note mapping
   - Notes → public_note mapping

2. **Verify Parameters**:

   - `convexInventory: Doc<"inventoryItems">` - Current state
   - `previousQuantity?: number` - Anchor quantity for delta calculation
   - `useAbsolute: boolean = false` - Use relative mode (delta) by default

3. **Verify Return Type**: `UpdateInventoryPayload` with:
   - `relative_quantity?: number` (when delta calculated)
   - `absolute_quantity?: number` (when useAbsolute=true)
   - Other fields (price, condition, personal_note, public_note, etc.)

### Phase 4: Verify Store Client Methods

**File**: `convex/marketplaces/brickowl/storeClient.ts`

**Verification Checklist**:

1. ✅ `createInventory()` - Already correct

   - Takes `CreateInventoryPayload`
   - Returns `StoreOperationResult` with `marketplaceId` (lot_id)
   - Supports idempotency keys

2. ✅ `updateInventory()` - Already correct

   - Takes `identifier` (lot_id or external_id) and `UpdateInventoryPayload`
   - Supports both `lot_id` and `external_id` lookup
   - Returns `StoreOperationResult`
   - Supports idempotency keys

3. ✅ `deleteInventory()` - Already correct
   - Takes `identifier` (lot_id or external_id)
   - Returns `StoreOperationResult`
   - Supports idempotency keys

## Key Differences: Bricklink vs BrickOwl

### Quantity Update Strategy

**Bricklink**:

- Always uses delta syntax: `"+5"`, `"-3"` (string format)
- Mapper calculates delta and formats as string with +/- prefix

**BrickOwl**:

- Supports two modes:
  1. `relative_quantity`: Number delta (e.g., `5`, `-3`)
  2. `absolute_quantity`: Exact quantity (e.g., `10`)
- Mapper uses `relative_quantity` by default (delta-based)
- Can switch to absolute mode if needed

### Identifier Strategy

**Bricklink**:

- Uses numeric `inventory_id` only
- Always passed as path parameter: `/inventories/{inventory_id}`

**BrickOwl**:

- Uses string `lot_id` or `external_id`
- Can use either identifier (passed in body, not path)
- `external_id` is set to Convex `_id` during create for future lookups

### API Endpoints

**Bricklink**:

- `POST /inventories` - Create
- `PUT /inventories/{inventory_id}` - Update
- `DELETE /inventories/{inventory_id}` - Delete

**BrickOwl**:

- `POST /inventory/create` - Create
- `POST /inventory/update` - Update (identifier in body)
- `POST /inventory/delete` - Delete (identifier in body)

## Implementation Steps

### Step 1: Update sync.ts

- [ ] Fix `syncUpdate()` to use `mapConvexToBrickOwlUpdate()`
- [ ] Ensure `previousQuantity` is calculated correctly
- [ ] Test with both create and update scenarios

### Step 2: Update syncWorker.ts

- [ ] Add import for `mapConvexToBrickOwlUpdate`
- [ ] Fix `callMarketplaceAPI()` update case to use mapper
- [ ] Use `anchorAvailable` for delta calculation (same as Bricklink)
- [ ] Test with outbox message processing

### Step 3: Verify Mapper Logic

- [ ] Review `mapConvexToBrickOwlUpdate()` implementation
- [ ] Ensure delta calculation matches Bricklink pattern
- [ ] Verify all fields are mapped correctly
- [ ] **Fix condition mapping**: Update `"usedc"` → `"usedn"` in both create and update mappers
  - Change `mapConvexToBrickOwlCreate()` to use `"usedn"` instead of `"usedc"`
  - Change `mapConvexToBrickOwlUpdate()` to use `"usedn"` instead of `"usedc"`
  - Update `mapConvexConditionToBrickOwl()` helper function
- [ ] **Verify field mappings**:
  - ✅ `personal_note` → `location` (already correct)
  - ✅ `public_note` → `notes` (already correct)
- [ ] **API Exploration**: Test if create endpoint accepts undocumented fields
  - Test `personal_note`, `public_note`, `bulk_qty`, `tier_price`, `my_cost`, `lot_weight` in create
  - If they don't work, remove from `CreateInventoryPayload` and `mapConvexToBrickOwlCreate()`
  - Document findings in internal docs

### Step 4: Integration Testing

- [ ] Test create operation end-to-end
- [ ] Test update operation with quantity changes
- [ ] Test update operation with price/location changes
- [ ] Test delete operation
- [ ] Verify sync status tracking works correctly

## Testing Checklist

### Create Operation

- [ ] New inventory item creates on BrickOwl
- [ ] `lotId` is stored in `marketplaceSync.brickowl.lotId`
- [ ] Sync status updates to "synced"
- [ ] Error handling works for invalid data

### Update Operation

- [ ] Quantity increase syncs correctly (delta calculation)
- [ ] Quantity decrease syncs correctly (negative delta)
- [ ] Price update syncs correctly
- [ ] Location update syncs correctly (personal_note)
- [ ] Notes update syncs correctly (public_note)
- [ ] Update falls back to create if no `lotId` exists
- [ ] Anchor quantity calculation works correctly

### Delete Operation

- [ ] Inventory item deleted from BrickOwl
- [ ] Sync status updates correctly
- [ ] Handles case where item was never synced

### Error Handling

- [ ] Invalid credentials handled gracefully
- [ ] Rate limiting errors handled
- [ ] Network errors retried appropriately
- [ ] Error messages stored in sync status

## Files to Modify

1. **`convex/inventory/sync.ts`** (2 changes)

   - Fix `syncUpdate()` function to use mapper
   - Ensure import statement exists

2. **`convex/inventory/syncWorker.ts`** (2 changes)

   - Fix `callMarketplaceAPI()` update case
   - Add import for mapper

3. **`convex/marketplaces/brickowl/storeMappers.ts`** (required changes + potential changes)

   - **Required fix**: Update condition mapping from `"usedc"` to `"usedn"` (Used Like New)
     - Fix `mapConvexToBrickOwlCreate()` - line 61
     - Fix `mapConvexToBrickOwlUpdate()` - line 134
     - Fix `mapConvexConditionToBrickOwl()` - line 172
   - Review implementation for correctness
   - **May need updates**: Remove fields from `CreateInventoryPayload` if API doesn't accept them
   - **May need updates**: Adjust `mapConvexToBrickOwlCreate()` if fields are unsupported

4. **`convex/marketplaces/brickowl/storeClient.ts`** (0 changes - verify only)

   - Methods already implemented correctly
   - **Consider**: Add response logging for API exploration

5. **`docs/external-documentation/api-brickowl/`** (new documentation)

   - Document actual API response structures
   - Document discovered field support (create vs update)
   - Create response type reference

## Summary

The BrickOwl store client already has all the necessary methods (`createInventory`, `updateInventory`, `deleteInventory`) implemented correctly. The mappers are also in place. The main issue is that the sync layer (`sync.ts`) and sync worker (`syncWorker.ts`) are not using the mappers properly for update operations.

**Key Fix**: Replace raw data passing with proper mapper calls:

- Use `mapConvexToBrickOwlUpdate(item, previousQuantity)` instead of passing raw item data
- Calculate `previousQuantity` from anchor quantity (same pattern as Bricklink)
- Ensure all fields are properly mapped through the mapper

**Important Caveat**: Due to incomplete BrickOwl API documentation:

1. **API Exploration Required**: We should verify what fields the create endpoint actually accepts (our `CreateInventoryPayload` includes fields not in the docs)
2. **Response Documentation**: We need to document actual API responses since they're not documented
3. **Field Verification**: Test if `personal_note`, `public_note`, `bulk_qty`, `tier_price`, `my_cost`, `lot_weight` work in create calls
4. **Internal Documentation**: Update our internal docs with discovered API behavior

This will make BrickOwl inventory sync work exactly like Bricklink, with proper delta-based quantity updates and full field mapping, once we verify the API's actual behavior.
