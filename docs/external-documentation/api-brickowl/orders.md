The orders API allows you to download and process your stores orders and orders you have placed in stores

### List

GET https://api.brickowl.com/v1/order/list

Get a list of your orders

##### Arguments

- status (Optional) - Order status filter, use the formatted name or the numeric ID
  - 0 - Pending
  - 1 - Payment Submitted
  - 2 - Payment Received
  - 3 - Processing
  - 4 - Processed
  - 5 - Shipped
  - 6 - Received
  - 7 - On Hold
  - 8 - Cancelled
- order_time (Optional) - Unix Timestamp to limit the orders returned to those with a timestamp greater than or equal to the one provided
- limit (Optional) - Limit the amount of results returned. Default 500. Limit 5,000.
- list_type (Optional) - Order list type
  - store - Store orders
  - customer - Orders you have placed
- sort_by (Optional) - Sorting
  - created - Sort by order creation time (default)
  - updated - Sort by order update time

---

### View

GET https://api.brickowl.com/v1/order/view

Retrieve full order details

##### Arguments

- order_id - The order ID

---

### Items

GET https://api.brickowl.com/v1/order/items

Retrieve order items

##### Arguments

- order_id - The order ID

---

### Tracking

POST https://api.brickowl.com/v1/order/tracking

Attach a shipping tracking information to the order

##### Arguments

- order_id - The order ID
- tracking_id - Tracking ID / URL

---

### Note

POST https://api.brickowl.com/v1/order/note

Edit the seller note on an order

##### Arguments

- order_id - The order ID
- note - Seller note

---

### Tax Schemes

GET https://api.brickowl.com/v1/order/tax\_schemes

Get a list of possible tax schemes that can be applied to orders

---

### Notify

POST https://api.brickowl.com/v1/order/notify

You can set an IP address to be notified instantly when an order is placed via a HTTP request. The request will be placed to http://IP_ADDR:42500/brick_owl_order_notify. You will need to setup an appropriate webserver to receive the request. This service is not guaranteed, so you will also need to check at an interval. The request will contain GET parameters of order_id and store_id. It does not contain order data. To remove the notification, submit an empty string for the ip parameter.

##### Arguments

- ip - The IP address to be notified

---

### Leave Feedback

POST https://api.brickowl.com/v1/order/feedback

Leave feedback for an order

##### Arguments

- order_id - The order ID
- comment (Optional) - The feedback comment. Maximum of 120 characters long
- rating - The feedback rating
  - 1 - Positive
  - 0 - Neutral
  - \-1 - Negative

---

### Set Status

POST https://api.brickowl.com/v1/order/set\_status

Change the status of the order

##### Arguments

- order_id - The order ID
- status_id - Order Status ID
  - 1 - Payment Submitted
  - 2 - Payment Received
  - 3 - Processing
  - 4 - Processed
  - 5 - Shipped
  - 6 - Received
  - 7 - On Hold

---
