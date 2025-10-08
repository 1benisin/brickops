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
