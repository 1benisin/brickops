# Bricklink API

## API Base URL

https://api.bricklink.com/api/store/v1

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

- [OAuth parameters](?page=auth) should be included in every request.
- In PUT or POST, you represent the resource object you wish to update using URL encoded JSON.
- Optional parameters should be provided as a query string using URL encoded form.

## Response

BrickLink API supports returning resource representations as JSON with the following structures:

| Property Name    | Value   | Description                                                                                                                                                                                             | Notes                               |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| meta             | Object  | Extra information about the response                                                                                                                                                                    |                                     |
| meta.code        | Integer | API result code. (2xx if successful, any other number otherwise)                                                                                                                                        | [Result code](?page=error-handling) |
| meta.message     | String  | More granular information about the result                                                                                                                                                              |                                     |
| meta.description | String  | Detailed description about the result                                                                                                                                                                   |                                     |
| data             | Object  | Requested information. Depending on the type of request you made, the HTTP response message body may be empty (typically for DELETE messages). If the body is not empty, it will always be JSON object. |                                     |

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

# Authentication & Authorization

## Make the request with OAuth protocol parameters

All requests to BrickLink REST API require you to authenticate using OAuth 1.0 like - but simpler flow. You can authorize your requests with your credentials provided after registration.

- The parameters are sent in either the HTTP Authorization header or query part of the URL with JSON format.
- All parameter names and values are escaped using the [RFC3986](http://tools.ietf.org/html/rfc3986) percent-encoding (%xx) mechanism.

#### Prameter Details

| Property name          | Value  | Note                                                                                       |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------ |
| oauth_version          | String | Must be **1.0**                                                                            |
| oauth_consumer_key     | String | The consumer key                                                                           |
| oauth_token            | String | The access token                                                                           |
| oauth_timestamp        | String | The timestamp is expressed in the number of seconds since January 1, 1970 00:00:00 GMT     |
| oauth_nonce            | String | A random string, uniquely generated for each request                                       |
| oauth_signature_method | String | Must be **HMAC-SHA1**                                                                      |
| oauth_signature        | String | The signature as defined in [Signing Requests](http://oauth.net/core/1.0/#signing_process) |

#### Example

The request for the orders you received is:

```
https://api.bricklink.com/api/store/v1/orders?direction=in

Authorization: OAuth realm="",
oauth_consumer_key="7CCDCEF257CF43D89A74A7E39BEAA1E1",
oauth_token="AC40C8C32A1748E0AE1EFA13CCCFAC3A",
oauth_signature_method="HMAC-SHA1",
oauth_signature="0IeNpR5N0kTEBURcuUMGTDPKU1c%3D",
oauth_timestamp="1191242096",
oauth_nonce="kllo9940pd9333jh",
oauth_version="1.0"
```

And if using query parameters:

```
https://api.bricklink.com/api/store/v1/orders?direction=in&Authorization=%7B%22oauth_signature%22%3A%22KVkfRqcGuEpqN7%252F57aLZVi9lS9k%3D%22%2C%22oauth_nonce%22%3A%22flBnl2yp3vk%22%2C%22oauth_version%22%3A%221.0%22%2C%22oauth_consumer_key%22%3A%227CCDCEF257CF43D89A74A7E39BEAA1E1%22%2C%22oauth_signature_method%22%3A%22HMAC-SHA1%22%2C%22oauth_token%22%3A%22AC40C8C32A1748E0AE1EFA13CCCFAC3A%22%2C%22oauth_timestamp%22%3A%221397119302%22%7D
```

You can verify the signature of the request on the link below:

- Online: [http://oauth.googlecode.com/svn/code/javascript/example/signature.html](http://oauth.googlecode.com/svn/code/javascript/example/signature.html)
- Java code: [BLAuthTest.zip](//static2.bricklink.com/api/BLAuthTest.zip)

# Error Handling

## Result Code

Errors are returned using standard HTTP error code syntax. Any additional info is JSON-formatted and included in the body of the return call.

- A value of 2xx indicates that no errors occurred, and the transaction was successful.
- A value other than 2xx indicates an error.

| Code | Message                      | Description                                                                                                                                                  |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200  | OK                           | A request has been successfully fulfilled.                                                                                                                   |
| 201  | OK_CREATED                   | A request has been successfully fulfilled and resulted in a creation of a new resource.                                                                      |
| 204  | OK_NO_CONTENT                | A request has been successfully processed but does not need to return any data.                                                                              |
| 400  | INVALID_URI                  | A request has been made to a malformed URL.                                                                                                                  |
| 400  | INVALID_REQUEST_BODY         | A request has been made with a malformed JSON body.                                                                                                          |
| 400  | PARAMETER_MISSING_OR_INVALID | One of the parameters specified is invalid or missing.                                                                                                       |
| 401  | BAD_OAUTH_REQUEST            | Bad OAuth request (wrong consumer key, bad nonce, expired timestamp, etc.). Error message should indicate which one and why.                                 |
| 403  | PERMISSION_DENIED            | The user is not permitted to make the given request.                                                                                                         |
| 404  | RESOURCE_NOT_FOUND           | The resource you requested does not exist.                                                                                                                   |
| 405  | METHOD_NOT_ALLOWED           | The request method is not permitted.                                                                                                                         |
| 415  | UNSUPPORTED_MEDIA_TYPE       | The server refused to service the request because the entity of the request is in a format not supported by the requested resource for the requested method. |
| 422  | RESOURCE_UPDATE_NOT_ALLOWED  | Your post/put request was denied (attempt to update an order status to unavailable value...).                                                                |
| 500  | INTERNAL_SERVER_ERROR        | An unexpected error has occurred in the API.                                                                                                                 |

# Order: Resource Representations

## Order

#### Resource

| Property name                 | Value                | Description                                                                                                                                                                                                                      | Note                                                                                                |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| order_id                      | String               | Unique identifier for this order for internal use                                                                                                                                                                                |                                                                                                     |
| date_ordered                  | Timestamp            | The time the order was created                                                                                                                                                                                                   |                                                                                                     |
| date_status_changed           | Timestamp            | The time the order status was last modified                                                                                                                                                                                      |                                                                                                     |
| seller_name                   | String               | The username of the seller in BL                                                                                                                                                                                                 |                                                                                                     |
| store_name                    | String               | The store name displayed on BL store pages                                                                                                                                                                                       |                                                                                                     |
| buyer_name                    | String               | The username of the buyer in BL                                                                                                                                                                                                  |                                                                                                     |
| buyer_email                   | String               | E-mail address of the buyer                                                                                                                                                                                                      |                                                                                                     |
| buyer_order_count             | Integer              | Total count of all orders placed by the buyer in the seller's store. Includes the order just placed and also purged orders                                                                                                       |                                                                                                     |
| require_insurance             | Boolean              | Indicates whether the buyer requests insurance for this order                                                                                                                                                                    |                                                                                                     |
| status                        | String               | The status of an order                                                                                                                                                                                                           | [Available status](http://www.bricklink.com/help.asp?helpID=41&q=order+status)                      |
| is_invoiced                   | Boolean              | Indicates whether the order invoiced                                                                                                                                                                                             |                                                                                                     |
| is_filed                      | Boolean              | Indicates whether the order is filed                                                                                                                                                                                             |                                                                                                     |
| drive_thru_sent               | Boolean              | Indicates whether "Thank You, Drive Thru!" email has been sent                                                                                                                                                                   |                                                                                                     |
| salesTax_collected_by_bl      | Boolean              | Indicates if sales tax are collected by BL or not                                                                                                                                                                                |                                                                                                     |
| remarks                       | String               | User remarks for this order                                                                                                                                                                                                      |                                                                                                     |
| total_count                   | Integer              | The total number of items included in this order                                                                                                                                                                                 |                                                                                                     |
| unique_count                  | Integer              | The unique number of items included in this order                                                                                                                                                                                |                                                                                                     |
| total_weight                  | Fixed Point Number   | The total weight of the items ordered <br>\- It applies the seller's custom weight when present to override the catalog weight <br>\- 0 if the order includes at least one item without any weight information or incomplete set |                                                                                                     |
| payment                       | Object               | Information related to the payment of this order                                                                                                                                                                                 |                                                                                                     |
| payment.method                | String               | The payment method for this order                                                                                                                                                                                                |                                                                                                     |
| payment.currency_code         | String               | Currency code of the payment                                                                                                                                                                                                     | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217)                                                   |
| payment.date_paid             | Timestamp            | The time the buyer paid                                                                                                                                                                                                          |                                                                                                     |
| payment.status                | String               | Payment status                                                                                                                                                                                                                   | [Available status](http://www.bricklink.com/help.asp?helpID=121)                                    |
| shipping                      | Object               | Information related to the shipping                                                                                                                                                                                              |                                                                                                     |
| shipping.method               | String               | Shipping method name                                                                                                                                                                                                             |                                                                                                     |
| shipping.method_id            | String               | Shipping method ID                                                                                                                                                                                                               |                                                                                                     |
| shipping.tracking_no          | String               | Tracking numbers for the shipping                                                                                                                                                                                                |                                                                                                     |
| shipping.tracking_link        | String               | URL for tracking the shipping                                                                                                                                                                                                    | API-only field. It is not shown on the BrickLink pages.                                             |
| shipping.date_shipped         | Timestamp            | Shipping date                                                                                                                                                                                                                    | API-only field. It is not shown on the BrickLink pages.                                             |
| shipping.address              | Object               | The object representation of the shipping address                                                                                                                                                                                |                                                                                                     |
| shipping.address.name         | Object               | An object representation of a person's name                                                                                                                                                                                      |                                                                                                     |
| shipping.address.name.full    | String               | The full name of this person, including middle names, suffixes, etc.                                                                                                                                                             |                                                                                                     |
| shipping.address.name.first   | String               | The family name (last name) of this person                                                                                                                                                                                       | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.name.last    | String               | The given name (first name) of this person                                                                                                                                                                                       | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.full         | String               | The full address in not-well-formatted                                                                                                                                                                                           |                                                                                                     |
| shipping.address.address1     | String               | The first line of the address                                                                                                                                                                                                    | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.address2     | String               | The second line of the address                                                                                                                                                                                                   | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.country_code | String               | The country code                                                                                                                                                                                                                 | [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) (exception: UK instead of GB) |
| shipping.address.city         | String               | The city                                                                                                                                                                                                                         | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.state        | String               | The state                                                                                                                                                                                                                        | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.postal_code  | String               | The postal code                                                                                                                                                                                                                  | It is provided only if a buyer updated his/her address and name as a normalized form                |
| shipping.address.phone_number | String               | The buyer's phone number                                                                                                                                                                                                         | It is provided only if a buyer included his/her phone number with their shipping address            |
| cost                          | Object               | Cost information for this order                                                                                                                                                                                                  |                                                                                                     |
| cost.currency_code            | String               | The currency code of the transaction                                                                                                                                                                                             | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217)                                                   |
| cost.subtotal                 | Fixed Point Number   | The total price for the order exclusive of shipping and other costs <br>(This must equal the sum of all the items)                                                                                                               |                                                                                                     |
| cost.grand_total              | Fixed Point Number   | The total price for the order inclusive of tax, shipping and other costs                                                                                                                                                         |                                                                                                     |
| cost.salesTax_collected_by_BL | Fixed Point Number   | Sales tax collected by BL, if that applies                                                                                                                                                                                       |                                                                                                     |
| cost.final_total              | Fixed Point Number   | Grand total - Sales tax collected by BL                                                                                                                                                                                          |                                                                                                     |
| cost.etc1                     | Fixed Point Number   | Extra charge for this order (tax, packing, etc.)                                                                                                                                                                                 |                                                                                                     |
| cost.etc2                     | Fixed Point Number   | Extra charge for this order (tax, packing, etc.)                                                                                                                                                                                 |                                                                                                     |
| cost.insurance                | Fixed Point Number   | Insurance cost                                                                                                                                                                                                                   |                                                                                                     |
| cost.shipping                 | Fixed Point Number   | Shipping cost                                                                                                                                                                                                                    |                                                                                                     |
| cost.credit                   | Fixed Point Number   | Credit applied to this order                                                                                                                                                                                                     |                                                                                                     |
| cost.coupon                   | Fixed Point Number   | Amount of coupon discount                                                                                                                                                                                                        |                                                                                                     |
| cost.vat_rate                 | Fixed Point Number   | VAT percentage applied to this order                                                                                                                                                                                             | Upcoming Feature                                                                                    |
| cost.vat_amount               | Fixed Point Number   | Total amount of VAT included in the grand_total price                                                                                                                                                                            | Upcoming Feature                                                                                    |
| ~cost.disp_currency_code~     | ~String~             | ~The display currency code of the user~                                                                                                                                                                                          | deprecated                                                                                          |
| ~cost.disp_subtotal~          | ~Fixed Point Number~ | ~The subtotal price in display currency of the user~                                                                                                                                                                             | deprecated                                                                                          |
| ~cost.disp_grand_total~       | ~Fixed Point Number~ | ~The grand total price in display currency of the user~                                                                                                                                                                          | deprecated                                                                                          |
| disp_cost                     | Object               | Cost information for this order in DISPLAY currency                                                                                                                                                                              |                                                                                                     |
| disp_cost.currency_code       | String               | The display currency code of the user                                                                                                                                                                                            | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217)                                                   |
| disp_cost.subtotal            | Fixed Point Number   | The subtotal price in DISPLAY currency                                                                                                                                                                                           |                                                                                                     |
| disp_cost.grand_total         | Fixed Point Number   | The grand total price in DISPLAY currency                                                                                                                                                                                        |                                                                                                     |
| disp_cost.etc1                | Fixed Point Number   | Extra charge for this order (tax, packing, etc.) in DISPLAY currency                                                                                                                                                             |                                                                                                     |
| disp_cost.etc2                | Fixed Point Number   | Extra charge for this order (tax, packing, etc.) in DISPLAY currency                                                                                                                                                             |                                                                                                     |
| disp_cost.insurance           | Fixed Point Number   | Insurance cost in DISPLAY currency                                                                                                                                                                                               |                                                                                                     |
| disp_cost.shipping            | Fixed Point Number   | Shipping cost in DISPLAY currency                                                                                                                                                                                                |                                                                                                     |
| disp_cost.credit              | Fixed Point Number   | Credit applied to this order in DISPLAY currency                                                                                                                                                                                 |                                                                                                     |
| disp_cost.coupon              | Fixed Point Number   | Amount of coupon discount in DISPLAY currency                                                                                                                                                                                    |                                                                                                     |
| disp_cost.vat_rate            | Fixed Point Number   | VAT percentage applied to this order                                                                                                                                                                                             | Upcoming Feature                                                                                    |
| disp_cost.vat_amount          | Fixed Point Number   | Total amount of VAT included in the grand_total price in DISPLAY currency                                                                                                                                                        | Upcoming Feature                                                                                    |

#### Example

```
{
    "order_id":3905404,
    "date_ordered":"2013-10-29T17:59:06.373Z",
    "date_status_changed":"2014-02-26T01:26:55.467Z",
    "seller_name":"covariance",
    "store_name":"skbrickshop",
    "buyer_name":"sklee",
    "buyer_email":"sklee@fakemail.com",
    "require_insurance":false,
    "status":"PENDING",
    "is_invoiced":true,
    "remarks":"my remarks",
    "total_count":1,
    "unique_count":1,
    "total_weight":"1.03",
    "buyer_order_count":2,
    "is_filed":false,
    "drive_thru_sent":true,
    "payment":{
        "method":"PayPal.com",
        "currency_code":"EUR",
        "date_paid":"2014-02-26T01:29:28.147Z",
        "status":"Sent"
    },
    "shipping":{
        "method_id":17862,
        "method":"PostBox",
        "tracking_link":"12323132",
        "address":{
            "name":{
                "full":"Seulki Lee"
            },
        "full":"fake address",
        "country_code":"KR"
        }
    },
    "cost":{
        "currency_code":"EUR",
        "subtotal":"10.1210",
        "grand_total":"13.1210",
        "etc1":"0.0000",
        "etc2":"0.0000",
        "insurance":"0.0000",
        "shipping":"3.0000",
        "credit":"0.0000",
        "coupon":"0.0000",
        "vat_rate":"19.00",
        "vat_amount":"2.0949"
    },
    "disp_cost":{
        "currency_code":"EUR",
        "subtotal":"10.1210",
        "grand_total":"13.1210",
        "etc1":"0.0000",
        "etc2":"0.0000",
        "insurance":"0.0000",
        "shipping":"3.0000",
        "credit":"0.0000",
        "coupon":"0.0000",
        "vat_rate":"19.00",
        "vat_amount":"2.0949"
    }
}
```

## Order Item

#### Resource

| Property name         | Value              | Description                                                                                      | Note                                                                             |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| inventory_id          | Integer            | The ID of the store inventory that includes the item                                             |                                                                                  |
| item                  | Object             | An object representation of the item                                                             |                                                                                  |
| item.no               | String             | Item's identification number in BL catalog                                                       |                                                                                  |
| item.name             | String             | The name of the item                                                                             |                                                                                  |
| item.type             | String             | The type of the item                                                                             | MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| item.category_id      | Integer            | The main category of the item                                                                    |                                                                                  |
| color_id              | Integer            | The ID of the color of the item                                                                  |                                                                                  |
| color_name            | String             | Color name of the item                                                                           | Upcoming feature                                                                 |
| quantity              | Integer            | The number of items purchased in this order                                                      |                                                                                  |
| new_or_used           | String             | Indicates whether the item is new or used                                                        | N: New, U: Used                                                                  |
| completeness          | String             | Indicates whether the set is complete or incomplete <br>(This value is valid only for SET type)  | C: Complete, B: Incomplete, S: Sealed                                            |
| unit_price            | Fixed Point Number | The original price of this item per sale unit                                                    |                                                                                  |
| unit_price_final      | Fixed Point Number | The unit price of this item after applying tiered pricing policy                                 |                                                                                  |
| disp_unit_price       | Fixed Point Number | The original price of this item per sale unit in display currency of the user                    |                                                                                  |
| disp_unit_price_final | Fixed Point Number | The unit price of this item after applying tiered pricing policy in display currency of the user |                                                                                  |
| currency_code         | String             | The currency code of the price                                                                   | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217)                                |
| disp_currency_code    | String             | The display currency code of the user                                                            | [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217)                                |
| remarks               | String             | User remarks of the order item                                                                   |                                                                                  |
| description           | String             | User description of the order item                                                               |                                                                                  |
| weight                | Fixed Point Number | The weight of the item that overrides the catalog weight                                         | Upcoming feature                                                                 |

#### Example

```
{
    "inventory_id":50133258,
        "item": {
            "no":"7644-1",
            "name":"MX-81 Hypersonic Operations Aircraft",
            "type":"SET",
            "categoryID":34
        },
        "color_id":0,
        "quantity":1,
        "new_or_used":"N",
        "completeness":"S",
        "unit_price":"139.9900",
        "unit_price_final":"139.9900",
        "disp_unit_price":"139.9900",
        "disp_unit_price_final":"139.9900",
        "currency_code":"USD",
        "disp_currency_code":"USD",
        "description":"",
        "remarks":""
}
```

## Order Message

#### Resource

| Property name | Value     | Description                              | Note |
| ------------- | --------- | ---------------------------------------- | ---- |
| subject       | String    | The subject of the message               |      |
| body          | String    | The contents of the message              |      |
| from          | String    | The username of who sends the message    |      |
| to            | String    | The username of who receives the message |      |
| dateSent      | Timestamp | The time the message was sent            |      |

#### Example

```
{
    "subject":"Regarding BrickLink Order #3986441",
    "body":"Hello...",
    "from":"covariance1",
    "to":"sklee",
    "dateSent":"2013-10-04T14:54:30.947Z"
}
```

## Order Problem

#### Resource

| Property name | Value  | Description                      | Note                                            |
| ------------- | ------ | -------------------------------- | ----------------------------------------------- |
| type          | String | The type of the problem          | FILE_NPB, REMOVE_NPB                            |
| message       | String | Your comment about the problem   |                                                 |
| reason_id     | String | The reason why you file the case | [Available reasons](?page=order-problem-reason) |

#### Example

```
{
    "type":"FILE_NPB",
    "message":"buyer is not responding for 10 days",
    "reason_id":"6",
}
```

# Order

# Get Orders

This method retrieves a list of orders you received or placed.

#### Request

| Method | URI     |
| ------ | ------- |
| GET    | /orders |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                                                                                                                                                                                      |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| direction      | String  | Y        | The direction of the order to get. Acceptable values are: <br>\- "out": Gets placed orders. <br>\- "in": Gets received orders. (default)                                                                                                                                                         |
| status         | String  | Y        | The status of the order to include or exclude. <br>\- If you don't specify this value, this method retrieves orders in any status. <br>\- You can pass a comma-separated string to specify multiple status to include/exclude. <br>\- You can add a minus(-) sign to specify a status to exclude |
| filed          | Boolean | Y        | Indicates whether the result retries filed or un-filed orders. Acceptable values are: <br>\- "true" <br>\- "false": (default)                                                                                                                                                                    |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of the the summary of an order resource as "data" in the response body.

Each entry in the list includes followings:

- order_id
- date_ordered
- seller_name
- store_name
- buyer_name
- total_count
- unique_count
- status
- payment.method
- payment.status
- payment.date_paid
- payment.currency_code
- cost.subtotal
- cost.grandtotal
- cost.currency_code

To retrieve additional properties, see the [Get Order](?page=get-order).

#### Example

- GET /orders
  - Retrieves a list of received orders
- GET /orders?direction=out
  - Retrieves a list of placed orders
- GET /orders?status=pending,completed
  - Retrieves PENDING or COMPLETED received orders
- GET /orders?status=-purged
  - Retrieves a list of received orders not in PURGED status
- GET /orders?filed=true&status=completed
  - Retrieves a list of received and filed orders in COMPETED status

# Get Order

This method retrieves the details of a specific order.

#### Request

| Method | URI                |
| ------ | ------------------ |
| GET    | /orders/{order_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                |
| -------------- | ------- | -------- | -------------------------- |
| order_id       | Integer | N        | The ID of the order to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns an [order resource](?page=resource-representations-order) as "data" in the response body.

#### Example

- GET /orders/1234
  - Retrieves order # 1234

# Get Order Items

This method retrieves a list of items for the specified order.

#### Request

| Method | URI                      |
| ------ | ------------------------ |
| GET    | /orders/{order_id}/items |

#### Parameters

| Parameter Name | Value   | Optional | Description         |
| -------------- | ------- | -------- | ------------------- |
| order_id       | Integer | N        | The ID of the order |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [items](?page=resource-representations-order) batch list as "data" in the response body. An inner list indicates that items included in one batch of the order ([order item batch](http://www.bricklink.com/help.asp?helpID=62)).

#### Example

- GET /orders/1234/items
  - Retrieves a list of items for order #1234

# Get Order Messages

This method retrieves a list of messages for the specified order that the user receives as a seller.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| GET    | /orders/{order_id}/messages |

#### Parameters

| Parameter Name | Value   | Optional | Description         |
| -------------- | ------- | -------- | ------------------- |
| order_id       | Integer | N        | The ID of the order |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [order message resource](?page=resource-representations-order) as "data" in the response body.

#### Example

- GET /orders/1234/messages
  - Retrieves a list of messages for order #1234

# Get Order Feedback

This method retrieves a list of feedback for the specified order.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| GET    | /orders/{order_id}/feedback |

#### Parameters

| Parameter Name | Value   | Optional | Description         |
| -------------- | ------- | -------- | ------------------- |
| order_id       | Integer | N        | The ID of the order |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [feedback resource](?page=resource-representations-feedback) as "data" in the response body.

#### Example

- GET /orders/1234/feedback
  - Retrieves a list of feedback for order #1234

# Update Order

This method updates properties of a specific order.

#### Request

| Method | URI                |
| ------ | ------------------ |
| PUT    | /orders/{order_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                   |
| -------------- | ------- | -------- | ----------------------------- |
| order_id       | Integer | N        | The ID of the order to update |

#### Request body

In the request body, supply an [order resource](?page=resource-representations-order). The order resource object can include:

- cost.credit
- cost.insurance
- cost.etc1
- cost.etc2
- cost.shipping
- shipping.date_shipped
- shipping.tracking_no
- shipping.tracking_link
- shipping.method_id
- remarks
- is_filed

Any attempt to update other fields that are not listed above would be ignored.

Cost fields will only be updated if the order is in unpaid status. Otherwise they will be ignored.

If sales tax are to be collected by BL, every change made to the costs will recalculate the sales tax.

```
{
    "shipping": {
        "date_shipped": "Timestamp",
        "tracking_no": "String",
        "tracking_link": "String",
        "method_id": "Integer"
    },
    "cost": {
        "shipping": "String",
        "insurance": "String",
        "credit": "String",
        "etc1": "String",
        "etc2": "String"
    },
    "is_filed" : "Boolean",
    "remarks" : "String"
}
```

#### Response

If successful, this method returns an [order resource](?page=resource-representations-order) as data in the response body.

#### Example

- PUT /orders/1234
  - Updates order #1234

# Update Order Status

This method updates the status of a specific order.

#### Request

| Method | URI                       |
| ------ | ------------------------- |
| PUT    | /orders/{order_id}/status |

#### Parameters

| Parameter Name | Value   | Optional | Description                          |
| -------------- | ------- | -------- | ------------------------------------ |
| order_id       | Integer | N        | The ID of the order to update status |

#### Request body

In the request body, supply a patch object with the following structure:

| Property Name | Value  | Description                                  | Notes                                                           |
| ------------- | ------ | -------------------------------------------- | --------------------------------------------------------------- |
| field         | String | The field name of the resource to be updated | Must be "status"                                                |
| value         | String | The new status value                         | [Available status](http://www.bricklink.com/help.asp?helpID=41) |

```
{
    "field" : "status",
    "value" : "PENDING"
}
```

#### Response

If successful, this method returns an empty "data".

#### Example

- PUT /orders/1234/status
  - Updates status of order #1234

# Update Payment Status

This method updates the payment status of a specific order.

#### Request

| Method | URI                               |
| ------ | --------------------------------- |
| PUT    | /orders/{order_id}/payment_status |

#### Parameters

| Parameter Name | Value   | Optional | Description                                  |
| -------------- | ------- | -------- | -------------------------------------------- |
| order_id       | Integer | N        | The ID of the order to update payment status |

#### Request body

In the request body, supply a patch object with the following structure:

| Property Name | Value  | Description                                  | Notes                                                            |
| ------------- | ------ | -------------------------------------------- | ---------------------------------------------------------------- |
| field         | String | The field name of the resource to be updated | Must be "payment_status"                                         |
| value         | String | The new status value                         | [Available status](http://www.bricklink.com/help.asp?helpID=121) |

```
{
    "field" : "payment_status",
    "value" : "Received"
}
```

#### Response

If successful, this method returns an empty "data".

#### Example

- PUT /orders/1234/payment_status
  - Updates payment status of order #1234

# Send Drive Thru

Send "Thank You, Drive Thru!" e-mail to a buyer

#### Request

| Method | URI                           |
| ------ | ----------------------------- |
| POST   | /orders/{order_id}/drive_thru |

#### Parameters

| Parameter Name | Value   | Optional | Description                                           |
| -------------- | ------- | -------- | ----------------------------------------------------- |
| order_id       | Integer | N        | The ID of the order to update payment status          |
| mail_me        | Boolean | Y        | Indicates that whether you want to cc yourself or not |

#### Request body

Do not supply a request body with this method

#### Response

If successful, this method returns an empty "data".

#### Example

- POST /orders/1234/drive_thru?mail_me=true
  - Send "Thank You, Drive Thru!" e-mail for order 1234 to a buyer and yourself

# Store Inventory: Resource Representations

## Inventory

#### Resource

| Property name    | Value              | Description                                                                                     | Note                                                                             |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| inventory_id     | Integer            | The ID of the inventory                                                                         |                                                                                  |
| item             | Object             | An object representation of the item                                                            |                                                                                  |
| item.no          | String             | Item's identification number in BrickLink catalog                                               |                                                                                  |
| item.name        | String             | The name of this item                                                                           |                                                                                  |
| item.type        | String             | The type of the item                                                                            | MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| item.category_id | Integer            | The main category of the item                                                                   |                                                                                  |
| color_id         | Integer            | The ID of the color of the item                                                                 |                                                                                  |
| color_name       | String             | Color name of the item                                                                          |                                                                                  |
| quantity         | Integer            | The number of items included in this inventory                                                  |                                                                                  |
| new_or_used      | String             | Indicates whether the item is new or used                                                       | N: New, U: Used                                                                  |
| completeness     | String             | Indicates whether the set is complete or incomplete <br>(This value is valid only for SET type) | C: Complete, B: Incomplete, S: Sealed                                            |
| unit_price       | Fixed Point Number | The original price of this item per sale unit                                                   |                                                                                  |
| bind_id          | Integer            | The ID of the parent lot that this lot is bound to                                              |                                                                                  |
| description      | String             | A short description for this inventory                                                          |                                                                                  |
| remarks          | String             | User remarks on this inventory                                                                  |                                                                                  |
| bulk             | Integer            | Buyers can buy this item only in multiples of the bulk amount                                   |                                                                                  |
| is_retain        | Boolean            | Indicates whether the item retains in inventory after it is sold out                            |                                                                                  |
| is_stock_room    | Boolean            | Indicates whether the item appears only in owner’s inventory                                    |                                                                                  |
| stock_room_id    | String             | Indicates the stockroom that the item to be placed when the user uses multiple stockroom        | A, B, C                                                                          |
| date_created     | Timestamp          | The time this lot is created                                                                    |                                                                                  |
| my_cost          | Fixed Point Number | [My Cost](http://www.bricklink.com/help.asp?helpID=1109) value to tracking the cost of item     |                                                                                  |
| sale_rate        | Integer            | [Sale](http://www.bricklink.com/help.asp?helpID=46) value to adjust item price                  | Must be less than 100. 20 for 20% sale                                           |
| tier_quantity1   | Integer            | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option                                                        |
| tier_quantity2   | Integer            | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option, Must be greater than tier_quantity1                   |
| tier_quantity3   | Integer            | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option, Must be greater than tier_quantity2                   |
| tier_price1      | Fixed Point Number | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option. Must be less than unit_price                          |
| tier_price2      | Fixed Point Number | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option, Must be less than tier_price1                         |
| tier_price3      | Fixed Point Number | A parameter for [Tiered pricing](http://www.bricklink.com/help.asp?helpID=131)                  | 0 for no tier sale option, Must be less than tier_price2                         |
| my_weight        | Fixed Point Number | Custom weight of the item                                                                       | Upcoming                                                                         |

#### Example

```
{
    "inventory_id":50592684,
    "item": {
        "no":"bel004",
        "name":"Belville Accessories - Complete Sprue - Perfume Bottles (same as 6932)",
        "type":"PART",
        "categoryID":48
    },
    "color_id":5,
    "quantity":12,
    "new_or_used":"U",
    "unit_price":"1.2000",
    "bind_id":0,
    "description":"",
    "remarks":"",
    "bulk":1,
    "is_retain":false,
    "is_stock_room":false,
    "date_created":"2013-12-18T05:00:00.000Z",
    "sale_rate":10,
    "my_cost":"1.0000",
    "tier_quantity1":10,
    "tier_price1":"1.0000",
    "tier_quantity2":20,
    "tier_price2":"0.8000",
    "tier_quantity3":0,
    "tier_price3":"0.0000"
}
```

# Store Inventory

# Get Store Inventories

This method retrieves a list of inventories you have.

## Request

| Method | URI          |
| ------ | ------------ |
| GET    | /inventories |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| item_type      | String  | Y        | The type of the item to include or exclude <br>\- If you don't specify this value, this method retrieves inventories with any type of item. <br>\- You can pass a comma-separated string to specify multiple item types to include/exclude. <br>\- You can add a minus( - ) sign to specify a type to exclude                                                                                                                                                                                            |
| status         | String  | Y        | The status of the inventory to include or exclude <br>\- Available values are: <br>\-- "Y" : available <br>\-- "S" : in stockroom A <br>\-- "B" : in stockroom B <br>\-- "C" : in stockroom C <br>\-- "N" : unavailable <br>\-- "R" : reserved <br>\- If you don't specify this value, this method retrieves inventories in any status. <br>\- You can pass a comma-separated string to specify multiple status to include/exclude. <br>\- You can add a minus( - ) sign to specify a status to exclude. |
| category_id    | Integer | Y        | The ID of the category to include or exclude <br>\- If you don't specify this value, this method retrieves inventories with any category of item. <br>\- You can pass a comma-separated string to specify multiple categories to include/exclude. <br>\- You can add a minus( - ) sign to specify a category to exclude. <br>\- You can only specify the main category of the item.                                                                                                                      |
| color_id       | Integer | Y        | The ID of the color to include or exclude <br>\- If you don't specify this value, this method retrieves inventories with any color of item. <br>\- You can pass a comma-separated string to specify multiple colors to include/exclude. <br>\- You can add a minus( - ) sign to specify a color to exclude.                                                                                                                                                                                              |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of the the summary of a [store inventory resource](?page=resource-representations-inventory) as "data" in the response body.

#### Example

- GET /inventories
  - Retrieves a list of inventories
- GET /inventories?item_type=part,set
  - Retrieves inventories of PART or SET
- GET /inventories?category_id=123
  - Retrieves inventories of category ID #123
- GET /inventories?status=-R
  - Retrieves a list of inventories not in RESERVED status
- GET /inventories?status=B
  - Retrieves a list of inventories in stockroom B
- GET /inventories?color_id=1&item_type=part
  - Retrieves inventories of color ID #123 and PART

# Get Store Inventory

This method retrieves information about a specific inventory.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| GET    | /inventories/{inventory_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                    |
| -------------- | ------- | -------- | ------------------------------ |
| inventory_id   | Integer |          | The ID of the inventory to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [store inventory resource](?page=resource-representations-inventory) as "data" in the response body.

#### Example

- GET /inventories/1234
  - Retrieves a specific inventories with inventory ID #1234

# Create Store Inventory

Creates a new inventory with an item.

#### Request

| Method | URI           |
| ------ | ------------- |
| POST   | /inventories/ |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

In the request body, supply a [store inventory resource](?page=resource-representations-inventory). The store inventory resource should include:

- item.no
- item.type
- color_id
- quantity
- unit_price
- new_or_used
- completeness (only when item.type is "set")
- description
- remarks
- bulk
- is_retain
- is_stock_room
- stock_room_id (only when is_sock_room is "true")
- my_cost
- sale_rate
- tier_quantity1
- tier_price1
- tier_quantity2
- tier_price2
- tier_quantity3
- tier_price3

Note that to set tier price options, all 6 values must be entered

#### Response

If successful, this method returns a [store inventory resource](?page=resource-representations-inventory) as "data" in the response body.

#### Example

- POST /inventories
  - Creates a new inventory

# Create Store Inventories

Creates multiple inventories in a single request. Note that you can create an inventory only with items in the BL Catalog.

#### Request

| Method | URI           |
| ------ | ------------- |
| POST   | /inventories/ |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

In the request body, supply a [store inventory resource](?page=resource-representations-inventory). The store inventory resource should includes:

- item.no
- item.type
- color_id
- quantity
- unit_price
- new_or_used
- completeness (only when item.type is "set")
- description
- remarks
- bulk
- is_retain
- is_stock_room
- stock_room_id (only when is_sock_room is "true")
- my_cost
- sale_rate
- tier_quantity1
- tier_price1
- tier_quantity2
- tier_price2
- tier_quantity3
- tier_price3

Note that to set tier price options, all 6 values must be entered

#### Response

If successful, this method returns an empty "data".

#### Example

- POST /inventories
  - Creates new inventories

# Update Store Inventory

This method updates properties of the specified inventory.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| PUT    | /inventories/{inventory_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                       |
| -------------- | ------- | -------- | --------------------------------- |
| inventory_id   | Integer |          | The ID of the inventory to update |

#### Request body

In the request body, supply a [store inventory resource](?page=resource-representations-inventory). The store inventory resource should include:

- quantity (has to have a + (plus) or - (minus) sign in front of it. You can only add or subtract quantity, not set it to a new value because quantity can change when buyers submit orders in your store.)
- unit_price
- description
- remarks
- bulk
- is_retain
- is_stock_room
- stock_room_id (only when is_sock_room is "true")
- my_cost
- sale_rate
- tier_quantity1
- tier_price1
- tier_quantity2
- tier_price2
- tier_quantity3
- tier_price3

Note that to set tier price options, all 6 values must be entered

#### Response

If successful, this method returns a [store inventory resource](?page=resource-representations-inventory) as "data" in the response body.

#### Example

- PUT /inventories/1234
  - Updates inventory #1234

# Delete Store Inventory

This method deletes the specified inventory.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| DELETE | /inventories/{inventory_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                       |
| -------------- | ------- | -------- | --------------------------------- |
| inventory_id   | Integer |          | The ID of the inventory to delete |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns an empty "data".

#### Example

- DELETE /inventories/1234
  - Deletes inventory #1234

# Catalog: Resource Representations

## Item

#### Resource

| Property name | Value              | Description                                       | Note                                                                                  |
| ------------- | ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| no            | String             | Item's identification number in BrickLink catalog |                                                                                       |
| name          | String             | The name of the item                              |                                                                                       |
| type          | String             | The type of the item                              | MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX      |
| category_id   | Integer            | The main category of the item                     |                                                                                       |
| alternate_no  | String             | Alternate item number                             | [Alternate item number](http://www.bricklink.com/help.asp?helpID=599)                 |
| image_url     | String             | Image link for this item                          |                                                                                       |
| thumbnail_url | String             | Image thumbnail link for this item                |                                                                                       |
| weight        | Fixed Point Number | The weight of the item in grams                   | with 2 decimal places                                                                 |
| dim_x         | String             | Length of the item                                | [Item dimensions](http://www.bricklink.com/help.asp?helpID=261) with 2 decimal places |
| dim_y         | String             | Width of the item                                 | [Item dimensions](http://www.bricklink.com/help.asp?helpID=261) with 2 decimal places |
| dim_z         | String             | Height of the item                                | [Item dimensions](http://www.bricklink.com/help.asp?helpID=261) with 2 decimal places |
| year_released | Integer            | Item year of release                              |                                                                                       |
| description   | String             | Short description for this item                   |                                                                                       |
| is_obsolete   | Boolean            | Indicates whether the item is obsolete            |                                                                                       |
| language_code | String             | Item language code                                | [Item language](https://www.bricklink.com/help.asp?helpID=2004)                       |

#### Example

```
{
    "no":"3305-1",
    "name":"World Team Player",
    "type":"SET",
    "image_url":"http://bltest.ubifun.com/SL/3305-1.jpg",
    "thumbnail_url":"http://bltest.ubifun.com/S/3305-1.gif",
    "weight":"3.92",
    "dim_x":"0.00",
    "dim_y":"0.00",
    "dim_z":"0.00",
    "year_released":1998,
    "is_obsolete":false,
    "category_id":473
}
```

## Superset Entry

#### Resource

| Property name                | Value   | Description                                                                 | Note                                                                             |
| ---------------------------- | ------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| color_id                     | Integer | The ID of the color of the item                                             |                                                                                  |
| entries\[\]                  | List    | A list of the items that include the specified item                         |                                                                                  |
| entries\[\].item             | Object  | An object representation of the super item that includes the specified item |                                                                                  |
| entries\[\].item.no          | String  | Item's identification number in BrickLink catalog                           |                                                                                  |
| entries\[\].item.name        | String  | The name of the item                                                        |                                                                                  |
| entries\[\].item.type        | String  | The type of the item                                                        | MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| entries\[\].item.category_id | Integer | The main category of the item                                               |                                                                                  |
| entries\[\].quantity         | Integer | Indicates that how many specified items are included in this super item     |                                                                                  |
| entries\[\].appear_as        | String  | Indicates how an entry in an inventory appears as                           | A: Alternate, C: Counterpart, E: Extra, R: Regular                               |

#### Example

```
{
    "color_id":6,
    "entries": [
        {
            "item": {
                "no":"555-1",
                "name":"Hospital",
                "type":"SET",
                "categoryID":277
            },
            "quantity":1,
            "appears_as":"R"
        },
        {
            "item": {
                "no":"363-1",
                "name":"Hospital with Figures",
                "type":"SET",
                "categoryID":277
            },
            "quantity":1,
            "appears_as":"R"
        }
    ]
}
```

## Subset Entry

#### Resource

| Property name                | Value   | Description                                                                                           | Note                                                                             |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| match_no                     | Integer | A identification number given to a matching group that consists of regular items and alternate items. | 0 if there is no matching of alternative item                                    |
| entries\[\]                  | List    | A list of the items included in the specified item                                                    |                                                                                  |
| entries\[\].item             | Object  | An object representation of the item that is included in the specified item                           |                                                                                  |
| entries\[\].item.no          | String  | Item's identification number in BrickLink catalog                                                     |                                                                                  |
| entries\[\].item.name        | String  | The name of the item                                                                                  |                                                                                  |
| entries\[\].item.type        | String  | The type of the item                                                                                  | MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| entries\[\].item.category_id | Integer | The main category of the item                                                                         |                                                                                  |
| entries\[\].color_id         | Integer | The ID of the color of the item                                                                       |                                                                                  |
| entries\[\].quantity         | Integer | The number of items that are included in                                                              |                                                                                  |
| entries\[\].extra_quantity   | Integer | The number of items that are appear as "extra" item                                                   |                                                                                  |
| entries\[\].is_alternate     | Boolean | Indicates that the item is appear as "alternate" item in this specified item                          |                                                                                  |
| entries\[\].is_counterpart   | Boolean | Indicates that the item is appear as "counterpart" item in this specified item                        |                                                                                  |

#### Example

```
{
    "match_no":1,
    "entries": [
        {
            "item": {
                "no":"3001old",
                "name":"Brick 2 x 4 without Cross Supports",
                "type":"PART",
                "categoryID":5
            },
            "color_id":5,
            "quantity":1,
            "extra_quantity":0,
            "is_alternate":false,
            "is_counterpart":false
        },
        {
            "item": {
                "no":"3001old",
                "name":"Brick 2 x 4 without Cross Supports",
                "type":"PART",
                "categoryID":5
            },
            "color_id":7,
            "quantity":1,
            "extra_quantity":0,
            "is_alternate":true,
            "is_counterpart":false
        }
    ]
}
```

## Price Guide

#### Resource

| Property name                                         | Value              | Description                                                                             | Note                              |
| ----------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- | --------------------------------- |
| item                                                  | Object             | An object representation of the item                                                    |                                   |
| item.no                                               | String             | Item's identification number in BL catalog                                              |                                   |
| item.type                                             | String             | The type of the item                                                                    |                                   |
| new_or_used                                           | String             | Indicates whether the price guide is for new or used                                    | N: New, U: Used                   |
| currency_code                                         | String             | The currency code of the price                                                          |                                   |
| min_price                                             | Fixed Point Number | The lowest price of the item (in stock / that was sold for last 6 months )              |                                   |
| max_price                                             | Fixed Point Number | The highest price of the item (in stock / that was sold for last 6 months )             |                                   |
| avg_price                                             | Fixed Point Number | The average price of the item (in stock / that was sold for last 6 months )             |                                   |
| qty_avg_price                                         | Fixed Point Number | The average price of the item (in stock / that was sold for last 6 months ) by quantity |                                   |
| unit_quantity                                         | Integer            | The number of times the item has been sold for last 6 months                            |                                   |
| The number of store inventories that include the item |
| total_quantity                                        | Integer            | The number of items has been sold for last 6 months                                     |                                   |
| The total number of the items in stock                |
| price_detail\[\]                                      | List               | A list of objects that represent the detailed information of the price                  | see [Price Detail](#Price-Detail) |

#### Example

```
{
    "item": {
        "no":"7644-1",
        "type":"SET"
    },
    "new_or_used":"N",
    "currency_code":"USD",
    "min_price":"96.0440",
    "max_price":"695.9884",
    "avg_price":"162.3401",
    "qty_avg_price":"155.3686",
    "unit_quantity":298,
    "total_quantity":359,
    "price_detail": [

    ]
}
```

## Price Detail

#### Resource

- Current Items for Sale:

  | Property name      | Value              | Description                                                                          | Note                    |
  | ------------------ | ------------------ | ------------------------------------------------------------------------------------ | ----------------------- |
  | quantity           | Integer            | The number of the items in the store inventory                                       |                         |
  | qunatity           | ~Integer~          | ~The number of the items in the store inventory~                                     | To be deprecated. Typo. |
  | unit_price         | Fixed Point Number | The original price of this item per sale unit                                        |                         |
  | shipping_available | String             | Indicates whether or not the seller ships to your country(based on the user profile) |                         |

- Last 6 Months Sales:

  | Property name       | Value              | Description                                    | Note                                                                                                |
  | ------------------- | ------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
  | quantity            | Integer            | The number of the items in the store inventory |                                                                                                     |
  | unit_price          | Fixed Point Number | The original price of this item per sale unit  |                                                                                                     |
  | seller_country_code | String             | The country code of the seller's location      | [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) (exception: UK instead of GB) |
  | buyer_country_code  | String             | The country code of the buyer's location       | [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) (exception: UK instead of GB) |
  | date_ordered        | Timestamp          | The time the order was created                 |                                                                                                     |

#### Example

```
{
    "quantity":2,
    "qunatity":2,
    "unit_price":"96.0440",
    "shipping_available":true
}
```

```
{
    "quantity":1,
    "unit_price":"98.2618",
    "seller_country_code":"CZ",
    "buyer_country_code":"HK",
    "date_ordered":"2013-12-30T14:59:01.850Z"
}
```

## Known Color

#### Resource

| Property name | Value   | Description                         | Note |
| ------------- | ------- | ----------------------------------- | ---- |
| color_id      | Integer | Color ID                            |      |
| quantity      | Integer | The quantity of items in that color |      |

#### Example

```
{
    "color_id":"1",
    "quantity":"10"
}
```

# Catalog

# Get Item

This method returns information about the specified item in BrickLink catalog.

#### Request

| Method | URI                |
| ------ | ------------------ |
| GET    | /items/{type}/{no} |

#### Parameters

| Parameter Name | Value  | Optional | Description                                                                                                                              |
| -------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| type           | String | N        | The type of the item to get. Acceptable values are: <br>MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| no             | String | N        | Identification number of the item to get                                                                                                 |

#### Request body

Do not supply a request body with this method.

#### Example

- GET /items/part/1234
  - Retrieves PART #1234
- GET /items/set/1-1
  - Retrieves SET #1-1

# Get Item Image

This method returns image URL of the specified item by colors.

#### Request

| Method | URI                                  |
| ------ | ------------------------------------ |
| GET    | /items/{type}/{no}/images/{color_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                              |
| -------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| type           | String  | N        | The type of the item to get. Acceptable values are: <br>MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| no             | String  | N        | Identification number of the item to get                                                                                                 |
| color_id       | Integer | N        |                                                                                                                                          |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [catalog item](?page=resource-representations-catalog) as "data" in the response body.

- thumbnail_url
- type
- no

# Get Supersets

This method returns a list of items that include the specified item.

#### Request

| Method | URI                          |
| ------ | ---------------------------- |
| GET    | /items/{type}/{no}/supersets |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                       |
| -------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| type           | String  | N        | The type of the item. Acceptable values are: <br>MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| no             | String  | N        | Identification number of the item                                                                                                 |
| color_id       | Integer | Y        | The color of the item                                                                                                             |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [superset entries](?page=resource-representations-catalog) as "data" in the response body.

#### Example

- GET /items/part/3001old/supersets
  - Retrieves a list of items that include the PART #3001old
- GET /items/part/3001old/supersets?color_id=1
  - Retrieves a list of items that include the PART #3001old with color #1

# Get Subsets

This method returns a list of items that are included in the specified item.

#### Request

| Method | URI                        |
| ------ | -------------------------- |
| GET    | /items/{type}/{no}/subsets |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                       |
| -------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| type           | String  | N        | The type of the item. Acceptable values are: <br>MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX |
| no             | String  | N        | Identification number of the item                                                                                                 |
| color_id       | Integer | Y        | The color of the item(This value is valid only for PART type)                                                                     |
| box            | Boolean | Y        | Indicates whether the set includes the original box                                                                               |
| instruction    | Boolean | Y        | Indicates whether the set includes the original instruction                                                                       |
| break_minifigs | Boolean | Y        | Indicates whether the result breaks down minifigs as parts                                                                        |
| break_subsets  | Boolean | Y        | Indicates whether the result breaks down sets in set                                                                              |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a nested list of [subset entries](?page=resource-representations-catalog) as "data" in the response body. Note that the result is grouped by matching. An inner list indicates one matching group of items.

#### Example

- GET /items/set/7644-1/subsets
  - Retrieves a list of items that are included in the SET #7644-1
- GET /items/set/7644-1/subsets?instruction=true&break_minifigs=false
  - Retrieves a list of items that are included in the SET #7644-1 including the instruction and breaking down minifigs as parts

# Get Price Guide

This method returns the price statistics of the specified item in BrickLink catalog. ~Note that returned price does not include VAT~

#### Request

| Method | URI                      |
| ------ | ------------------------ |
| GET    | /items/{type}/{no}/price |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| type           | String  | N        | The type of the item. Acceptable values are: <br>MINIFIG, PART, SET, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX                                                                                                                                                                                                  |
| no             | String  | N        | Identification number of the item                                                                                                                                                                                                                                                                                                  |
| color_id       | Integer | Y        | The color of the item                                                                                                                                                                                                                                                                                                              |
| guide_type     | String  | Y        | Indicates that which statistics to be provided. Acceptable values are: <br>\- "sold": Gets the price statistics of "Last 6 Months Sales" <br>\- "stock": Gets the price statistics of "Current Items for Sale" (default)                                                                                                           |
| new_or_used    | String  | Y        | Indicates the condition of items that are included in the statistics. Acceptable values are: <br>\- "N": new item (default) <br>\- "U": used item                                                                                                                                                                                  |
| country_code   | String  | Y        | The result includes only items in stores which are located in specified country. <br>\- If you don't specify both country_code and region, this method retrieves the price information regardless of the store's location                                                                                                          |
| region         | String  | Y        | The result includes only items in stores which are located in specified region. <br>\- Available values are: asia, africa, north_america, south_america, middle_east, europe, eu, oceania <br>\- If you don't specify both country_code and region, this method retrieves the price information regardless of the store's location |
| currency_code  | String  | Y        | This method returns price in the specified currency code <br>\- If you don't specify this value, price is retrieved in the base currency of the user profile's                                                                                                                                                                     |
| vat            | String  | Y        | Indicates that price will include VAT for the items of VAT enabled stores. Available values are: <br>\- "N": Exclude VAT (default) <br>\- "Y": Include VAT <br>\- "O": Include VAT as Norway settings                                                                                                                              |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [price guide resource](?page=resource-representations-catalog) as "data" in the response body.

#### Example

- GET /items/part/3001old/price
  - Retrieves price statistics(currently for sale) of PART #3001old in new condition
- GET /items/part/3001old/price?new_or_used=U
  - Retrieves price statistics(currently for sale) of PART #3001old in used condition
- GET /items/part/3001old/price?guide_type=sold
  - Retrieves price statistics(last 6 months sales) of PART #3001old in new condition
- GET /items/part/3001old/price?guide_type=sold&country_code=US
  - Retrieves price statistics(last 6 months sales) of PART #3001old in new condition that are ordered from stores which are located in US.
- GET /items/part/3001old/price?region=asia
  - Retrieves price statistics(currently for sale) of PART #3001old in new condition that are currently for sale in stores which are located in Asia.
- GET /items/part/3001old/price?currency_code=USD
  - Retrieves price statistics(currently for sale in USD) of PART #3001old in new condition

# Get Known Colors

This method returns currently known colors(ex: the column at the far right in this [page](http://www.bricklink.com/catalogItem.asp?P=3001)) of the item

#### Request

| Method | URI                       |
| ------ | ------------------------- |
| GET    | /items/{type}/{no}/colors |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [known color](?page=resource-representations-catalog) as "data" in the response body.

# Feedback: Resource Representations

## Feedback

#### Resource

| Property name | Value     | Description                                                       | Note                                |
| ------------- | --------- | ----------------------------------------------------------------- | ----------------------------------- |
| feedback_id   | Integer   | An identification of the feedback                                 |                                     |
| order_id      | Integer   | The ID of the order associated with the feedback                  |                                     |
| from          | String    | The username of who posts this feedback                           |                                     |
| to            | String    | The username of who receives this feedback                        |                                     |
| date_rated    | Timestamp | The time the feedback was posted                                  |                                     |
| rating        | Integer   | The rating for a transaction (scale 0 to 2)                       | 0: Praise, 1: Neutral, 2: Complaint |
| rating_of_bs  | String    | Indicates whether the feedback is written for a seller or a buyer | S: Seller, B: Buyer                 |
| comment       | String    | A comment associated with the feedback                            |                                     |
| reply         | String    | A reply for this feedback                                         |                                     |

#### Example

```
{
    "feedback_id":6628516,
    "order_id":3986441,
    "from":"covariance1",
    "to":"sklee",
    "date_rated":"2013-12-17T07:25:00.000Z",
    "rating":0,
    "rating_of_bs":"S",
    "comment":"Excellent! Thank you!"
}
```

# Feedback

# Get Feedback List

This method gets a list of feedback you received or posted.

#### Request

| Method | URI       |
| ------ | --------- |
| GET    | /feedback |

#### Parameters

| Parameter Name | Value  | Optional | Description                                                                                                                                     |
| -------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| direction      | String | Y        | The direction of the feedback to get. Acceptable values are: <br>\- "out": Gets posted feedback. <br>\- "in": Gets received feedback. (default) |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [feedback resource](?page=resource-representations-feedback) as "data" in the response body.

#### Example

- GET /feedback
  - Retrieves a list of feedback you received
- GET /feedback?direction=out
  - Retrieves a list of feedback you posted

# Get Feedback

This method gets a specified feedback.

#### Request

| Method | URI                     |
| ------ | ----------------------- |
| GET    | /feedback/{feedback_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                   |
| -------------- | ------- | -------- | ----------------------------- |
| feedback_id    | Integer | N        | The ID of the feedback to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns [feedback resource](?page=resource-representations-feedback) as "data" in the response body.

#### Example

- GET /feedback/1234\* Retrieves a specific feedback with feedback ID #1234

# Post Feedback

This method posts a new feedback about the transaction.

#### Request

| Method | URI       |
| ------ | --------- |
| POST   | /feedback |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

In the request body, supply [feedback resource](?page=resource-representations-feedback). The feedback resource object should include:

- order_id
- rating
- comment

#### Response

If successful, this method returns [feedback resource](?page=resource-representations-feedback) as "data" in the response body.

#### Example

- POST /feedback
  - Creates a new feedback

# Reply Feedback

This method creates a reply to the specified feedback you received.

#### Request

| Method | URI                           |
| ------ | ----------------------------- |
| POST   | /feedback/{feedback_id}/reply |

#### Parameters

| Parameter Name | Value   | Optional | Description                            |
| -------------- | ------- | -------- | -------------------------------------- |
| feedback_id    | Integer | N        | The ID of the feedback to post a reply |

#### Request body

In the request body, supply [feedback resource](?page=resource-representations-feedback). The feedback resource object should include:

- reply

#### Response

If successful, this method returns an empty "data".

#### Example

- POST /feedback/1234/reply
  - Creates a new reply for feedback #1234

# Color: Resource Representations

## Color

#### Resource

| Property name | Value   | Description                                            | Note |
| ------------- | ------- | ------------------------------------------------------ | ---- |
| color_id      | Integer | ID of the color                                        |      |
| color_name    | String  | The name of the color                                  |      |
| color_code    | String  | HTML color code of this color                          |      |
| color_type    | String  | The name of the color group that this color belongs to |      |

#### Example

```
{
    "color_id":10,
    "color_name":"Dark Gray",
    "color_code":"6b5a5a",
    "color_type":"Solid"
}
```

# Color

# Get Color List

This method retrieves a list of the colors defined within BrickLink catalog.

#### Request

| Method | URI     |
| ------ | ------- |
| GET    | /colors |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [color resource](?page=resource-representations-color) as "data" in the response body.

#### Example

- GET /colors
  - Retrieves a list of colors defined within BrickLink catalog

# Get Color

This method retrieves information about a specific color.

#### Request

| Method | URI                |
| ------ | ------------------ |
| GET    | /colors/{color_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                |
| -------------- | ------- | -------- | -------------------------- |
| color_id       | Integer | N        | The ID of the color to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [color resource](?page=resource-representations-color) as "data" in the response body.

#### Example

- GET /colors/123
  - Retrieves color #123

# Category: Resource Representations

## Category

#### Resouce

| Property name | Value   | Description                                                                          | Note |
| ------------- | ------- | ------------------------------------------------------------------------------------ | ---- |
| category_id   | Integer | The ID of the category                                                               |      |
| category_name | String  | The name of the category                                                             |      |
| parent_id     | Integer | The ID of the parent category in category hierarchies ( 0 if this category is root ) |      |

#### Example

```
{
    "category_id":10,
    "category_name":"Container",
    "parent_id":0
}
```

# Category

# Get Category List

This method retrieves a list of the categories defined within BrickLink catalog.

#### Request

| Method | URI         |
| ------ | ----------- |
| GET    | /categories |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [category resource](?page=resource-representations-category) as "data" in the response body.

#### Example

- GET /categories\* Retrieves a list of categories defined within BrickLink catalog

# Get Category

This method retrieves information about a specific category.

#### Request

| Method | URI                       |
| ------ | ------------------------- |
| GET    | /categories/{category_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                   |
| -------------- | ------- | -------- | ----------------------------- |
| category_id    | Integer | N        | The ID of the category to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [category resource](?page=resource-representations-category) as "data" in the response body.

#### Example

- GET /categories/123\* Retrieves category #123

# Push Notification: Resource Representations

## Notification

#### Resource

| Property name | Value     | Description                                      | Note                     |
| ------------- | --------- | ------------------------------------------------ | ------------------------ |
| event_type    | String    | The type of the event                            | Order, Message, Feedback |
| resource_id   | Integer   | The ID of the resource associated with the event |                          |
| timestamp     | Timestamp | The time the event occurred                      |                          |

#### Example

```
{
    "event_type":"Order",
    "resource_id":3986441,
    "timestamp":"2013-12-17T08:20:02.177Z"
}
```

# Push Notificiation

# Get Notifications

This method returns a list of unread push notifications. If you provided callback URLs to get notifications, you don't need to call this method.

A notification to be created when:

- Order
  - You received a new order.
  - Buyer updates an order status.
  - Items of an order are updated (added or deleted).
- Message
  - You received a new message.
- Feedback
  - You received a new feedback or reply.

**However, assure that it does not guarantee delivery of all events.**

#### Request

| Method | URI            |
| ------ | -------------- |
| GET    | /notifications |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [push notification](?page=resource-representations-push) resources as "data" in the response body.

#### Example

- GET /notifications
  - Retrieves a list of unread push notifications

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

# Setting: Resource Representations

## Store Shipping Method

#### Resource

| Property name | Value   | Description                                                          | Note |
| ------------- | ------- | -------------------------------------------------------------------- | ---- |
| method_id     | Integer | Shipping method id                                                   |      |
| name          | String  | Display name for shipping method                                     |      |
| note          | String  | A description of the shipping method that can be displayed to buyers |      |
| insurance     | Boolean |                                                                      |      |
| is_default    | Boolean |                                                                      |      |
| area          | String  | I: international <br>D: domestic <br>B: both                         |      |
| is_available  | String  |                                                                      |      |

# Setting

# Get Shipping Method List

This method retrieves a list of shipping method you registered.

#### Request

| Method | URI                        |
| ------ | -------------------------- |
| GET    | /settings/shipping_methods |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of [shipping method resource](?page=resource-representations-setting) as "data" in the response body.

#### Example

- GET /settings/shipping_methods
  - Retrieves a list of shipping method you registered.

# Get Shipping Method

This method retrieves the specified shipping method of your store.

#### Request

| Method | URI                                    |
| ------ | -------------------------------------- |
| GET    | /settings/shipping_methods/{method_id} |

#### Parameters

| Parameter Name | Value   | Optional | Description                          |
| -------------- | ------- | -------- | ------------------------------------ |
| method_id      | Integer | N        | The ID of the shipping method to get |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [shipping method resource](?page=resource-representations-setting) as "data" in the response body.

#### Example

- GET /settings/shipping_methods/123
  - Retrieves shipping method 123.

# Member: Resource Representations

## Rating

#### Resource

| Property name | Value                      | Description | Note |
| ------------- | -------------------------- | ----------- | ---- |
| user_name     | String                     |             |      |
| rating        | List                       |             |      |
| rating\[\]    | List                       |             |      |
|               | PRAISE, NEUTRAL, COMPLAINT |             |      |

## Note

#### Resource

| Property name | Value   | Description | Note |
| ------------- | ------- | ----------- | ---- |
| note_id       | Integer |             |      |
| user_name     | String  |             |      |
| note_text     | String  |             |      |
| date_noted    | String  |             |      |

# Member

# Get Member Rating

This method retrieves feedback ratings of a specific member.

#### Request

| Method | URI                         |
| ------ | --------------------------- |
| GET    | /members/{username}/ratings |

#### Parameters

| Parameter Name | Value  | Optional | Description           |
| -------------- | ------ | -------- | --------------------- |
| username       | String | Y        | username in BrickLink |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a list of the the [rating resource](?page=resource-representations-member) as "data" in the response body.

#### Example

- GET /members/bluser/ratings
  - Retrieves feedback ratings of "bluser"

# Get Member Note

This method retrieves your notes on a member.

#### Request

| Method | URI                          |
| ------ | ---------------------------- |
| GET    | /members/{username}/my_notes |

#### Parameters

| Parameter Name | Value  | Optional | Description           |
| -------------- | ------ | -------- | --------------------- |
| username       | String | Y        | username in BrickLink |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [note resource](?page=resource-representations-member) as "data" in the response body.

#### Example

- GET /members/bluser/notes
  - Retrieves your notes on user "bluser"

# Create Member Note

Creates new member notes about the specified user.

#### Request

| Method | URI                          |
| ------ | ---------------------------- |
| POST   | /members/{username}/my_notes |

#### Parameters

Do not supply a request parameter with this method.

#### Request body

In the request body, supply a [note resource](?page=resource-representations-member).

#### Response

If successful, this method returns a [note resource](?page=resource-representations-member) as "data" in the response body.

#### Example

- POST /members/bluser/notes
  - Creates new notes on user "bluser"

# Update Member Note

This method updates properties of your member notes on the specified user.

#### Request

| Method | URI                          |
| ------ | ---------------------------- |
| PUT    | /members/{username}/my_notes |

#### Parameters

| Parameter Name | Value  | Optional | Description           |
| -------------- | ------ | -------- | --------------------- |
| username       | String | Y        | username in BrickLink |

#### Request body

In the request body, supply a [note resource](?page=resource-representations-member).

#### Response

If successful, this method returns a [note resource](?page=resource-representations-member) as "data" in the response body.

#### Example

- PUT /members/bluser/notes
  - Updates notes on user "bluser"

# Delete Member Note

This method deletes the notes on the specified user.

#### Request

| Method | URI                          |
| ------ | ---------------------------- |
| DELETE | /members/{username}/my_notes |

#### Parameters

| Parameter Name | Value  | Optional | Description           |
| -------------- | ------ | -------- | --------------------- |
| username       | String | Y        | username in BrickLink |

#### Request body

Do not supply a request body with this method..

#### Response

If successful, this method returns an empty "data".

#### Example

- DELETE /members/bluser/notes
  - Deletes notes on user "bluser"

# Item Mapping: Resource Representations

## Item Mapping

#### Resource

| Property name | Value   | Description                                       | Note |
| ------------- | ------- | ------------------------------------------------- | ---- |
| item          | Object  | An object representation of the item              |      |
| item.no       | String  | Item's identification number in BrickLink catalog |      |
| item.type     | String  | The type of the item                              | PART |
| color_id      | Integer | Color ID of the item                              |      |
| color_name    | String  | Color name of the item                            |      |
| element_id    | String  | Element ID of the item in specific color          |      |

# Item Mapping

**Please note the following:**

- It does not guarantee that you can get the complete mapping of items
- It provides item mappings only for PARTs
- Item mapping may not be one-to-one

# Get ElementID

This method returns Part-Color-Code (A.K.A ElementID) of the specified item

#### Request

| Method | URI                       |
| ------ | ------------------------- |
| GET    | /item_mapping/{type}/{no} |

#### Parameters

| Parameter Name | Value   | Optional | Description                                                                                |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| type           | String  | N        | The type of an item to get. Acceptable values are: PART                                    |
| no             | String  | N        | Identification number of an item to get                                                    |
| color_id       | Integer | Y        | Color ID of an item. If not specified, API retrieves element IDs of an item in any colors. |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [item mapping resource](?page=resource-representations-mapping) as "data" in the response body.

#### Example

- GET /item_mapping/part/1234
  - Retrieves a list of element IDs of PART #1234 in any colors
- GET /item_mapping/part/1234?color_id=1
  - Retrieves element ID of PART #1234 with color #1

# Get Item Number

This method returns BL Catalog Item Number by Part-Color-Code (A.K.A ElementID)

#### Request

| Method | URI                        |
| ------ | -------------------------- |
| GET    | /item_mapping/{element_id} |

#### Parameters

| Parameter Name | Value  | Optional | Description                              |
| -------------- | ------ | -------- | ---------------------------------------- |
| element_id     | String | N        | Element ID of the item in specific color |

#### Request body

Do not supply a request body with this method.

#### Response

If successful, this method returns a [item mapping resource](?page=resource-representations-mapping) as "data" in the response body.

#### Example

- GET /item_mapping/1234
  - Retrieves a list of item number, color id mapping of elementID #1234
