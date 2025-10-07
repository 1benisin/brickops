# Bricklink API Documentation

This directory contains the Bricklink API documentation organized by resource type.

## API Base URL

https://api.bricklink.com/api/store/v1

## General Information

- [Authentication & Authorization](./authentication.md)
- [Error Handling](./error-handling.md)

## Resources

- [Orders](./orders.md) - Order management and operations
- [Store Inventory](./inventory.md) - Inventory management
- [Catalog](./catalog.md) - Catalog item information
- [Feedback](./feedback.md) - Feedback management
- [Colors](./colors.md) - Color information
- [Categories](./categories.md) - Category information
- [Push Notifications](./notifications.md) - Push notification system
- [Coupons](./coupons.md) - Coupon management
- [Settings](./settings.md) - Store settings
- [Members](./members.md) - Member information
- [Item Mapping](./item-mapping.md) - Item number and Element ID mapping

## Credential Management

- Register the BrickOps integration in the Bricklink member portal to receive consumer credentials.
- Generate access tokens tied to the BrickOps store account.
- Store credentials in the Convex environment (`npx convex env set`):
  - `BRICKLINK_CONSUMER_KEY`
  - `BRICKLINK_CONSUMER_SECRET`
  - `BRICKLINK_ACCESS_TOKEN`
  - `BRICKLINK_TOKEN_SECRET`
- Rotate keys per Bricklink policy and restrict usage to server-side requests. Never log raw OAuth secrets.

## SSL Only

All requests are required to be done over SSL.

## UTF-8 Encoding

Every string passed to and from the BrickLink API needs to be UTF-8 encoded.

## Date Format

All timestamps in the API are strings in [ISO 8601](http://en.wikipedia.org/wiki/ISO_8601) format:

yyyy-MM-dd'T'HH:mm:ss.SSSZ
2013-12-01T18:05:46.123Z

## Rounding Policy

BrickLink API uses values with 4 decimal places for all financial calculations. Any value with greater precision will be rounded up to 4 places.

## Request

- [OAuth parameters](./authentication.md) should be included in every request.
- In PUT or POST, you represent the resource object you wish to update using URL encoded JSON.
- Optional parameters should be provided as a query string using URL encoded form.

## Response

BrickLink API supports returning resource representations as JSON with the following structures:

| Property Name    | Value   | Description                                                                                                                                                                                             | Notes                              |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| meta             | Object  | Extra information about the response                                                                                                                                                                    |                                    |
| meta.code        | Integer | API result code. (2xx if successful, any other number otherwise)                                                                                                                                        | [Result code](./error-handling.md) |
| meta.message     | String  | More granular information about the result                                                                                                                                                              |                                    |
| meta.description | String  | Detailed description about the result                                                                                                                                                                   |                                    |
| data             | Object  | Requested information. Depending on the type of request you made, the HTTP response message body may be empty (typically for DELETE messages). If the body is not empty, it will always be JSON object. |                                    |

```
{
				    "meta": {
				        "code": "200",
				        "message": "OK",
				        "description": "OK"
				    },
				    "data": {

				    }
				}
```

## Bricklink Data Exports (BrickOps Baseline)

- The repository includes Bricklink XML exports (parts, colors, categories, item types, codes, minifigures) under `docs/external-documentation/bricklink-data/`.
- Use these files to seed the BrickOps catalog tables during bootstrapping so the application can service catalog lookups before live API traffic is enabled.
- When refreshing stale entries, compare against the seed data, persist the new `lastFetchedFromBricklink` timestamps, and respect rate-limiting budgets by avoiding redundant pulls when the cached snapshot still satisfies queries.
