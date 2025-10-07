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
