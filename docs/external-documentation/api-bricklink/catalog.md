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
