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

> BrickLink returns the complete result set for this endpoint; there is no pagination support.

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
