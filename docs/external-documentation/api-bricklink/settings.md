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
