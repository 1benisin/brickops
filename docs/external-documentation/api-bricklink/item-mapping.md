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
