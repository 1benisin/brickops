# Phase 1 – Schema Gap Assessment

## BrickOwl

**Schema coverage today**
- `boOrderResponseSchema` enumerates most known order payload fields but treats every alias as optional raw strings/numbers; no `.transform` steps exist.
- `boOrderItemResponseSchema` captures item fields but leaves quantities/prices as strings and omits status coercion.

**Gaps vs. provider implementation**
- Order ID resolution combines `order_id`, `id`, `orderId`, `orderID`, and `uuid` via `ensureOrderId`; schema currently exposes these separately without a canonical transform.
- External order key falls back to `order_number` or `store_id` string interpolation — logic absent from schema.
- Timestamp handling for `created`, `created_at`, `order_time`, `updated`, `updated_at`, `payment_time`, and `shipping.date_shipped` depends on `toTimestamp`; schema leaves them as string/number unions.
- Status normalization maps dozens of string/number aliases to the canonical `OrderStatus`, defaulting to `PENDING`; schema only validates the raw string/number without mapping.
- Buyer data pulls from both `buyer` and `customer` objects; schema does not consolidate or expose typed buyer fields.
- Numeric parsing (`buyer_order_count`, `total_items`, `unique_items`, totals, weights, method ids) relies on `toNumber`; schema keeps string unions and does not default missing values to `undefined` consistently.
- Payment currency derives from `payment.currency`, `payment.currency_code`, `currency`, or `currency_code`; schema lacks a transform to set a single output.
- Payment date (`payment.date_paid`) and `rawOrder.payment_time` are read but `boPaymentSchema` omits `date_paid` entirely.
- Shipping aliases (`tracking_id`, `tracking_no`, `tracking_url`, `tracking_link`) are flattened manually; schema only includes `tracking_id`/`tracking_url` and misses the other variants.
- Shipping address is stringified JSON in the provider; schema currently leaves it as nested objects without a helper.
- Item quantity/price fields consider `quantity`, `qty`, `total_quantity`, `price`, `unit_price`, and `final_price`; schema has the raw fields but no cross-field transform or defaulting to zero.
- Item ID fallbacks (`boid`, `item_no`, `external_id`, `lot_id`, `order_item_id`) live in provider logic, not schema.
- Condition normalization maps strings like `"New"`, `"n"`, `"u"`; schema keeps arbitrary strings.

**Transforms to move into schema layer**
- Canonical order/item identity resolution (including fallbacks and string trimming).
- Status normalization to project-specific enum with structured error when unknown.
- Timestamp parsing for all date-like fields.
- Numeric parsing with graceful `undefined` on invalid input.
- Payment/shipping currency + method id normalization.
- Item quantity/price coercion and zero default when missing.
- Condition + completeness normalization.
- Shipping address serialization (likely via shared helper returning stringified JSON).

**Schema updates required**
- Extend `boPaymentSchema` to allow `date_paid`.
- Add shipping alias fields (`tracking_no`, `tracking_link`) and overall order-level `payment_time`.
- Consider explicit enums or `z.nativeEnum` for known status codes if upstream set is finite.

## BrickLink

**Schema coverage today**
- `blOrderResponseSchema` already enforces required fields but keeps timestamps and monetary values as strings.
- `blOrderItemResponseSchema` enforces structural shape (nested `item`, `color_id`, etc.) yet prices/weights remain strings.

**Gaps vs. provider implementation**
- Status handling converts alert codes (`OCR`, `NPB`, `NPX`, `NRS`, `NSS`) to `HOLD` and validates against `ORDER_STATUS_VALUES`; schema allows any string.
- Timestamps (`date_ordered`, `date_status_changed`, `payment.date_paid`, `shipping.date_shipped`) are strings; provider converts to epoch milliseconds.
- Monetary/quantity fields (`total_weight`, `cost.*`, item `unit_price`, `unit_price_final`, `weight`) require numeric coercion.
- Shipping method id is coerced to string; schema leaves as `string | number`.
- Item condition maps `"N"/"U"` to `"new"/"used"`; schema simply constrains values to the BrickLink `blConditionSchema` (`"N" | "U"`), so consumers still need to perform the conversion.
- Item location falls back to `remarks?.trim()` with default `"UNKNOWN"`; schema has no notion of derived location.
- Provider serializes shipping address to JSON string, while schema leaves nested object untouched.

**Transforms to move into schema layer**
- Status mapping (including alert statuses → `HOLD`) and validation against canonical enum.
- Timestamp parsing to epoch milliseconds for order, payment, and shipping timestamps.
- Monetary/quantity coercion with safe `undefined` handling for invalid numbers.
- String coercion for IDs (`resource_id`, `shipping.method_id`, `inventory_id`).
- Condition mapping from BrickLink codes to project condition enum.
- Defaulting `location` from remarks with trim logic.

**Schema updates required**
- Consider deriving `blOrderResponseSchema` status type from shared `OrderStatus` enum to prevent drift.
- Introduce transforms/`z.preprocess` for numeric and timestamp fields so downstream code can rely on numbers.

## Shared Helper Opportunities

- Timestamp parsing (`toTimestamp`) and numeric parsing (`toNumber`) are duplicated across providers; centralizing them under a normalization utilities module will reduce duplication and keep behaviour consistent.
- Order/item identifier resolution (`ensureOrderId`, fallback sequences, string trimming) can be shared helpers invoked inside schema transforms.
- Condition normalization logic can live in shared helpers accepting provider-specific inputs (e.g., BrickOwl strings, BrickLink `"N"/"U"`).
- Shipping address serialization, currency code normalization, and safe JSON stringification are reusable primitives for both marketplaces and potential future providers.
- Structured error creation (`throw new Error(...)`) needs replacing with a shared `createNormalizationError(code, details)` helper per Phase 5 to ensure consistent failure semantics.
