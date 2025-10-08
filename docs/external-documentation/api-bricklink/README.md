# Bricklink API Documentation

This directory contains the Bricklink API documentation organized by resource type.

## API Base URL

https://api.bricklink.com/api/store/v1

## General Information

- [Authentication & Authorization](./authentication.md)
- [Error Handling](./error-handling.md)

## Resources

### Order Management

- **[Orders](./orders.md)** - Complete order lifecycle management
  - `GET /orders` - Retrieve orders list
  - `GET /orders/{order_id}` - Get specific order details
  - `GET /orders/{order_id}/items` - Get order items
  - `GET /orders/{order_id}/messages` - Get order messages
  - `GET /orders/{order_id}/feedback` - Get order feedback
  - `PUT /orders/{order_id}` - Update order
  - `PUT /orders/{order_id}/status` - Update order status
  - `PUT /orders/{order_id}/payment_status` - Update payment status
  - `POST /orders/{order_id}/drive_thru` - Send drive thru email

### Inventory Management

- **[Store Inventory](./inventory.md)** - Store inventory operations
  - `GET /inventories` - Get store inventories list
  - `GET /inventories/{inventory_id}` - Get specific inventory
  - `POST /inventories` - Create new inventory
  - `PUT /inventories/{inventory_id}` - Update inventory
  - `DELETE /inventories/{inventory_id}` - Delete inventory

### Catalog Operations

- **[Catalog](./catalog.md)** - Catalog item information and relationships
  - `GET /items/{type}/{no}` - Get item details
  - `GET /items/{type}/{no}/images/{color_id}` - Get item images
  - `GET /items/{type}/{no}/supersets` - Get items that include this item
  - `GET /items/{type}/{no}/subsets` - Get items included in this item
  - `GET /items/{type}/{no}/price` - Get price guide
  - `GET /items/{type}/{no}/colors` - Get known colors for item

### Customer Interaction

- **[Feedback](./feedback.md)** - Feedback management system
  - `GET /feedback` - Get feedback list
  - `GET /feedback/{feedback_id}` - Get specific feedback
  - `POST /feedback` - Create new feedback
  - `POST /feedback/{feedback_id}/reply` - Reply to feedback

### Reference Data

- **[Colors](./colors.md)** - Color information

  - `GET /colors` - Get all colors
  - `GET /colors/{color_id}` - Get specific color

- **[Categories](./categories.md)** - Category information
  - `GET /categories` - Get all categories
  - `GET /categories/{category_id}` - Get specific category

### Communication

- **[Push Notifications](./notifications.md)** - Push notification system
  - `GET /notifications` - Get unread notifications

### Marketing

- **[Coupons](./coupons.md)** - Coupon management
  - `GET /coupons` - Get coupons list
  - `GET /coupons/{coupon_id}` - Get specific coupon
  - `POST /coupons` - Create new coupon
  - `PUT /coupons/{coupon_id}` - Update coupon
  - `DELETE /coupons/{coupon_id}` - Delete coupon

### Store Configuration

- **[Settings](./settings.md)** - Store settings and configuration
  - `GET /settings/shipping_methods` - Get shipping methods
  - `GET /settings/shipping_methods/{method_id}` - Get specific shipping method

### Member Management

- **[Members](./members.md)** - Member information and notes
  - `GET /members/{username}/ratings` - Get member ratings
  - `GET /members/{username}/my_notes` - Get your notes on member
  - `POST /members/{username}/my_notes` - Create member note
  - `PUT /members/{username}/my_notes` - Update member note
  - `DELETE /members/{username}/my_notes` - Delete member note

### Item Identification

- **[Item Mapping](./item-mapping.md)** - Item number and Element ID mapping
  - `GET /item_mapping/{type}/{no}` - Get Element ID from item number
  - `GET /item_mapping/{element_id}` - Get item number from Element ID

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
