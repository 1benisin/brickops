# Coupon: Resource Representations

## Coupon

#### Resource

| Property name             | Value     | Description                                                                                                                                                                                                                                                                                                                                               | Note                                              |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| coupon_id                 | Integer   | Used to uniquely identify the coupon in your                                                                                                                                                                                                                                                                                                              |                                                   |
| date_issued               | Timestamp | Timestamp indicating when this coupon is created                                                                                                                                                                                                                                                                                                          |                                                   |
| date_expire               | Timestamp | Time until the coupon can be applied to                                                                                                                                                                                                                                                                                                                   |                                                   |
| seller_name               | String    | The username of the seller in BL                                                                                                                                                                                                                                                                                                                          |                                                   |
| buyer_name                | String    | The username of the buyer in BL                                                                                                                                                                                                                                                                                                                           |                                                   |
| store_name                | String    | The store name displayed on BL store pages                                                                                                                                                                                                                                                                                                                |                                                   |
| status                    | String    | Status of the coupon. Possible values are: <br>\- O: Open <br>\- A: Redeemed <br>\- D: Declined <br>\- E: Expired                                                                                                                                                                                                                                         |                                                   |
| remarks                   | String    | A description of the coupon that can be displayed to buyers                                                                                                                                                                                                                                                                                               |                                                   |
| order_id                  | Integer   | Order ID associated with this coupon                                                                                                                                                                                                                                                                                                                      |                                                   |
| currency_code             | String    | The three letter code for the currency used for the transaction                                                                                                                                                                                                                                                                                           | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217) |
| disp_currency_code        | String    | The three letter code for the currency used for displaying the price                                                                                                                                                                                                                                                                                      | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217) |
| discount_type             | String    | The type of discount. Possible values are: <br>\- F: Fixed amount coupon. The discount is expressed as a discrete monetary value <br>\- S: Percentage coupon. The discount is expressed as a percentage                                                                                                                                                   |                                                   |
| applies_to                | Object    | This object provides ability to restrict a PERCENTAGE coupon to a specific item type or condition                                                                                                                                                                                                                                                         |                                                   |
| applies_to.type           | String    | The type of restriction. Possible values are: <br>\- A: Discount will be applied to the total of all items in an order which are a specified item type (or all items regardless of the type if applies_to.item_type is not specified) <br>\- E: Discount will be applied to the total of all items in an order which are all except a specified item type |                                                   |
| applies_to.item_type      | String    | The type of items for which this discounts need to be applied ( or excluded )                                                                                                                                                                                                                                                                             |                                                   |
| applies_to.except_on_sale | Boolean   | Indicates that whether the discount of the coupon to exclude items on sale                                                                                                                                                                                                                                                                                |                                                   |
| discount_amount           | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| disp_discount_amount      | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| discount_rate             | Integer   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| max_discount_amount       | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| disp_max_discount_amount  | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_price1               | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| disp_tier_price1          | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_discount_rate1       | Integer   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_price2               | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| disp_tier_price2          | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_discount_rate2       | Integer   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_price3               | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| disp_tier_price3          | Decimal   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |
| tier_discount_rate3       | Integer   |                                                                                                                                                                                                                                                                                                                                                           |                                                   |

# Coupon

# Get Coupons

This method retrieves a list of coupons you received or created.

#### Request

| Method | URI      |
| ------ | -------- |
| GET    | /coupons |

#### Parameters

| Parameter Name | Value  | Optional | Description                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| direction      | String | Y        | The direction of the coupon to get. Acceptable values are: <br>\- "out": Gets created coupons (default) <br>\- "in": Gets received coupons                                                                                                                                                                                                                                                                                   |
| status         | String | Y        | The status of the store inventory to include or exclude <br>\- Available values are: <br>\-- "O" : open <br>\-- "S" : redeemed <br>\-- "D" : denied <br>\-- "E" : expired <br>\- If you don't specify this value, this method retrieves coupons in any status <br>\- You can pass a comma-separated string to specify multiple status to include/exclude <br>\- You can add a minus( - ) sign to specify a status to exclude |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of the the [coupon resource](?page=resource-representations-coupon) as "data" in the response body.

#### Example

- GET /coupons
  - Retrieves a list of created coupons
- GET /coupons?direction=in
  - Retrieves a list of received coupons
- GET /coupons?status=-E
  - Retrieves a list of store inventories not in EXPIRED status
- GET /coupons?status=O
  - Retrieves a list of coupons in OPEN status

# Get Coupon

This method retrieves a specific coupon.

#### Request

| Method | URI                  |
| ------ | -------------------- |
| GET    | /coupons/{coupon_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                 |
| -------------- | ------- | -------- | --------------------------- |
| coupon_id      | Integer |          | The ID of the coupon to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [coupon resource](?page=resource-representations-coupon) as "data" in the response body.

#### Example

- GET /coupons/1234
  - Retrieves a specific coupon with coupon ID #1234

# Create Coupon

Creates a new coupon for a buyer.

#### Request

| Method | URI      |
| ------ | -------- |
| POST   | /coupons |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

In the request body, supply a [coupon resource](?page=resource-representations-coupon).

#### Response

If successful, this method returns a [coupon resource](?page=resource-representations-coupon) as "data" in the response body.

#### Example

- POST /coupons
  - Creates a new coupon

# Update Coupon

This method updates properties of the specified coupon.

#### Request

| Method | URI                  |
| ------ | -------------------- |
| PUT    | /coupons/{coupon_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                    |
| -------------- | ------- | -------- | ------------------------------ |
| coupon_id      | Integer |          | The ID of the coupon to update |

#### Request body

In the request body, supply a [coupon resource](?page=resource-representations-coupon).

#### Response

If successful, this method returns a [coupon resource](?page=resource-representations-coupon) as "data" in the response body.

#### Example

- POST /coupons/1234
  - Updates coupon #1234

# Delete Coupon

This method deletes the specified coupon.

#### Request

| Method | URI                  |
| ------ | -------------------- |
| DELETE | /coupons/{coupon_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                    |
| -------------- | ------- | -------- | ------------------------------ |
| coupon_id      | Integer |          | The ID of the coupon to delete |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns an empty "data".

#### Example

- DELETE /coupons/1234
  - Deletes coupon #1234
