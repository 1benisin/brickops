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
