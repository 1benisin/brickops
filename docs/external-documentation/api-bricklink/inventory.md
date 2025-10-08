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
