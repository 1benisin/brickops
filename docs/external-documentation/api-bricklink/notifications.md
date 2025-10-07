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
