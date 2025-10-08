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
