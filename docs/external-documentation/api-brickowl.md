# Brickowl API

The API can be used to access your account programmatically. You will be able to do things such as downloading and processing orders or synchronising your inventory with your own website.

To access the API you first need an [API Key](/user/677841/api_keys). Once you have the API key you can make a request to any of the methods listed below that your key has permission for. The API is rated limited to 600 requests per minute for most requests, or 200 requests per minute for bulk/batch.

## Credential Management

- Generate a key from the Brickowl account settings (`/user/<account-id>/api_keys`).
- Store it as `BRICKOWL_API_KEY` in the Convex environment for each deployment (`npx convex env set`).
- Enforce server-side usage only and respect provider rate limits (600 rpm standard, 200 rpm bulk).

For `GET` request the key and any parameters should be added as parameters onto the request, for example https://api.brickowl.com/v1/order/view?key=KEY&order\_id=100.  
For `POST` requests, the key and any parameters should be in the body of the request and have a content type of `application/x-www-form-urlencoded`

If you are making a tool, it may be helpful to know that you can provide a link to any item in the catalog with the URL format https://www.brickowl.com/boid/BOIDHERE.

## Affiliate Stores

This API is for use by our affiliate partners, stores that have opted in can have their details retrieved through this API

### Stores

GET https://api.brickowl.com/v1/affiliate/stores

Get a list of all the stores that have opted in to your affiliate scheme

---

### Lots

GET https://api.brickowl.com/v1/affiliate/lots

Retrieve the stores lots

##### Arguments

- store_id - The stores unique ID
- type (Optional) - Filter by item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging

---

### Lots by ID

GET https://api.brickowl.com/v1/affiliate/item\_lots

Retrieve lots for an item identified by an id

##### Arguments

- type - Filter by item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging
- id - ID
- id_type - Specify the ID Type

---

## Bulk

Batch multiple requests together into one bulk request to save on request overhead

### Batch

POST https://api.brickowl.com/v1/bulk/batch

Batch up to 50 requests in one go

##### Arguments

- requests - JSON Array of endpoints with arguments in the format {"requests": \[{"endpoint":"catalog/search","request_method":"GET","params":\[{"query":"Vendor"}\]}, {"endpoint":"catalog/search","request_method":"GET","params":\[{"query":"Laser"}\]}\]}. Or for POST {"requests": \[{"endpoint":"inventory/update","request_method":"POST","params":\[{"lot_id":"IDHERE","absolute_quantity":2}\]}\]}

---

## Catalog

The catalog API allows you to retrieve information about items in the catalog. To access this API [contact us](/contact)

### List

GET https://api.brickowl.com/v1/catalog/list

Get a list of all the items in the catalog

##### Arguments

- type (Optional) - Filter by item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging
- brand (Optional) - Filter by brand

---

### Lookup

GET https://api.brickowl.com/v1/catalog/lookup

Retrieve details about an item in the catalog by BOID

##### Arguments

- boid - A BOID

---

### Availability

GET https://api.brickowl.com/v1/catalog/availability

Retrieve pricing and availability information for an item in the catalog by BOID

##### Arguments

- boid - A BOID
- quantity (Optional) - The minimum quantity required, greater than 0
- country - 2 digit country code for shipping destination

---

### ID Lookup

GET https://api.brickowl.com/v1/catalog/id\_lookup

Retrieve the possible BOIDs for another ID such as a set number or design ID

##### Arguments

- id - ID
- type - Filter by item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging
- id_type (Optional) - Filter by ID type. For example, use item_no, design_id, bl_item_no or set_number

---

### Bulk

GET https://api.brickowl.com/v1/catalog/bulk

Retrieve bulk catalog dumps. This API should only be used when instructed to do so

##### Arguments

- type - Bulk type

---

### Lookup (Bulk)

GET https://api.brickowl.com/v1/catalog/bulk\_lookup

Retrieve details about multiple items in the catalog at once

##### Arguments

- boids - A comma separated list of BOIDs. Maximum amount: 100

---

### Search

GET https://api.brickowl.com/v1/catalog/search

Search, browse and filter the catalog

##### Arguments

- query - Your search term. To browse use the term 'All'
- page (Optional) - Page number, usually 1 - 50
- missing_data (Optional) - Missing data filter. You can get the possible values from this query https://www.brickowl.com/search/catalog?query=All&show\_missing=1 on the left

---

### Inventory

GET https://api.brickowl.com/v1/catalog/inventory

Retrieve an items inventory

##### Arguments

- boid - BOID

---

### Condition List

GET https://api.brickowl.com/v1/catalog/condition\_list

Retrieve a list of the conditions a lot can have

---

### Field Options List

GET https://api.brickowl.com/v1/catalog/field\_option\_list

Retrieve a list of the options a catalog field can have

##### Arguments

- type - Field type
  - category_0 - Category 0
  - eye_color - Eye Color
  - eyebrow_color - Eyebrow Color
  - facial_expression - Facial Expression
  - facial_hair_color - Facial Hair Color
  - facial_hair_type - Facial Hair Type
  - gender - Gender
  - material_type - Material Type
  - packaging_type - Packaging Type
  - remove_image - Remove Image
  - sides_printed - Sides Printed
  - sticker_sheet_color - Sticker Sheet Color
  - theme_0 - Theme 0
  - type - Type
- language (Optional) - Language of the response
  - en - English
  - fr - French
  - de - German
  - es - Spanish
  - da - Danish
  - nl - Dutch
  - it - Italian
  - bg - Bulgarian
  - zh-hans - Chinese
  - cs - Czech
  - fi - Finnish
  - ja - Japanese
  - ko - Korean
  - nb - Norwegian
  - pl - Polish
  - sv - Swedish
  - uk - Ukrainian

---

### Catalog Cart (Basic)

POST https://api.brickowl.com/v1/catalog/cart\_basic

Create a catalog cart using Design IDs and Lego Color IDs and get a total price in the currency of the country. The cart ID can be passed to /catalog_cart_load/ID for a user to access it

##### Arguments

- items - JSON structure in the format {"items":\[{"design_id":"3034","color_id":21,"qty":"1"},{"design_id":"3004","color_id":23,"qty":"2"}\]}
- condition - A minimum condition code for the items.
  - new - New
  - news - New (Sealed)
  - newc - New (Complete)
  - newi - New (Incomplete)
  - usedc - Used (Complete)
  - usedi - Used (Incomplete)
  - usedn - Used (Like New)
  - usedg - Used (Good)
  - useda - Used (Acceptable)
  - other - Other
- country - 2 digit country code for shipping destination

---

### Color List

GET https://api.brickowl.com/v1/catalog/color\_list

Retrieve a list of the colors

---

## Catalog Edit

Submit changes to the catalog

### Edit (Basic)

POST https://api.brickowl.com/v1/catalog\_edit/basic\_edit

Submit a change request for an item. Some fields are item or user specific, all fields will return appropriate error information

##### Arguments

- boid - BOID
- type - Submission type
  - base_name - Base Name (string)
  - basic_decoration_description - Basic Decoration Description (string)
  - category_0 - Category 0 (option)
  - cleaned_lego_name - Cleaned Lego Name (string)
  - delete - Delete (binary)
  - delete_scheduled - Delete Scheduled (binary)
  - description - Description (string)
  - eye_color - Eye Color (option)
  - eyebrow_color - Eyebrow Color (option)
  - facial_expression - Facial Expression (option)
  - facial_hair_color - Facial Hair Color (option)
  - facial_hair_type - Facial Hair Type (option)
  - first_available - First Available (number)
  - gender - Gender (option)
  - height - Height (number)
  - instructions_booklets - Instructions Booklets (number)
  - instructions_pages - Instructions Pages (number)
  - length - Length (number)
  - material_type - Material Type (option)
  - packaging_type - Packaging Type (option)
  - remove_image - Remove Image (option)
  - ship_height - Ship Height (number)
  - ship_length - Ship Length (number)
  - ship_width - Ship Width (number)
  - sides_printed - Sides Printed (option)
  - sticker_sheet_color - Sticker Sheet Color (option)
  - stud_height - Stud Height (number)
  - stud_length - Stud Length (number)
  - stud_width - Stud Width (number)
  - theme_0 - Theme 0 (option)
  - type - Type (option)
  - variant_child_assembly_mask - Variant Child Assembly Mask (string)
  - variant_child_decoration_mask - Variant Child Decoration Mask (string)
  - variant_desc - Variant Desc (string)
  - weight - Weight (number)
  - width - Width (number)
- value - Submission value
- auto_approve (Optional) - Auto-approve submission if your account has permission
  - 0
  - 1

---

### Inventory

POST https://api.brickowl.com/v1/catalog\_edit/inventory

Submit a change/create request for the inventory of an item

##### Arguments

- parent_boid - Parent item BOID
- child_boid - Child item BOID
- quantity - Quantity of child in parent
- sequence_id (Optional) - Sequence ID, optional, >= 0
- auto_approve (Optional) - Auto-approve submission if your account has permission
  - 0
  - 1

---

### Create Item

POST https://api.brickowl.com/v1/catalog\_edit/create

Submit an item creation request

##### Arguments

- type - Item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging
- name - Item name
- auto_approve (Optional) - Auto-approve submission if your account has permission
  - 0
  - 1

---

### Edit (File)

POST https://api.brickowl.com/v1/catalog\_edit/file

Submit a change request for an item that needs a file

##### Arguments

- boid - BOID
- type - Submission type
  - primary_image - Primary Image
- data - Base64 Encoded raw file data
- content_type - Content type of the file
  - image/png
  - image/x-png
  - image/jpeg
  - image/jpg
- auto_approve (Optional) - Auto-approve submission if your account has permission
  - 0
  - 1

---

### Create Taxonomy

POST https://api.brickowl.com/v1/catalog\_edit/create\_taxonomy

Create a taxonomy such as a category or theme

##### Arguments

- name
- description (Optional)
- parent_taxonomy_id (Optional) - ID of the parent taxonomy, for hierarchical structures
- taxonomy_type - Taxonomy type
  - theme - Theme
  - category - Category
- auto_approve (Optional) - Auto-approve submission if your account has permission
  - 0
  - 1

---

## Collection

The collection API allows you to view and update your collection

### Lots

GET https://api.brickowl.com/v1/collection/lots

Get a list of lots with details

---

### Update Lot

POST https://api.brickowl.com/v1/collection/update

Update a lots data. You must pass at least one update field

##### Arguments

- lot_id - Lot ID
- quantity (Optional) - The minimum quantity required, greater than 0
- price (Optional) - The price of the item. It must be a positive number or blank, it will be rounded to 3 digits of precision
- note (Optional) - Note
- condition (Optional) - Condition ID
  - new - New
  - news - New (Sealed)
  - newc - New (Complete)
  - newi - New (Incomplete)
  - usedc - Used (Complete)
  - usedi - Used (Incomplete)
  - usedn - Used (Like New)
  - usedg - Used (Good)
  - useda - Used (Acceptable)
  - other - Other

---

### Delete Lot

POST https://api.brickowl.com/v1/collection/delete\_lot

Deletes a collection lot

##### Arguments

- lot_id - Lot ID

---

### Create Lot

POST https://api.brickowl.com/v1/collection/create\_lot

Create a new lot. You must pass an item identifier. Parts need a color

##### Arguments

- boid - A BOID
- color_id (Optional) - A Brick Owl color ID. This is required for Parts, optional for Gear and not allowed for other item types

---

## Store Inventory

The store inventory API allows you to download and update your store inventory

### List

GET https://api.brickowl.com/v1/inventory/list

Get a list of your lots with details

##### Arguments

- type (Optional) - Filter by item type
  - Part
  - Set
  - Minifigure
  - Gear
  - Sticker
  - Minibuild
  - Instructions
  - Packaging
- active_only (Optional) - Include only items that are for sale and have a quantity > 0. 0 or 1. Default: 1
- external_id_1 (Optional) - Optional external lot identifier to return one lot
- lot_id (Optional) - Optional Brick Owl lot ID to return one lot

---

### Update

POST https://api.brickowl.com/v1/inventory/update

Update a lots data. You must pass only one identifier and at least one update field

##### Arguments

- external_id (Optional) - External lot identifier
- lot_id (Optional) - Brick Owl lot ID
- absolute_quantity (Optional) - The absolute new quantity
- relative_quantity (Optional) - A positive or negative amount to adjust the existing quantity by
- for_sale (Optional) - 0 or 1 specifying if an item should be available for sale or not. This works independently of the quantity field, it is usually used for in stock items that you don't want to sell at the moment
- price (Optional) - The price of the item. It must be a positive number, it will be rounded to 3 digits of precision
- sale_percent (Optional) - The sale percentage of the item. It must be a whole number between -95 and 95
- my_cost (Optional) - The price you paid for the item for your own records. It must be a positive number, it will be rounded to 3 digits of precision
- lot_weight (Optional) - A custom lot weight, set in grams. It must be a positive number, it will be rounded to 3 digits of precision
- personal_note (Optional) - Personal note
- public_note (Optional) - Public note
- bulk_qty (Optional) - Bulk Quantity. A positive number greater than one
- tier_price (Optional) - Tier prices. Maximum of three tier prices, in the following format 'tier1quantity:tier1price,tier2quantity:tier2price,tier3quantity:tier3price'. For example '100:0.05,200:0.04'. To remove tier pricing, use the value 'remove'
- condition (Optional) - Condition ID
  - new - New
  - news - New (Sealed)
  - newc - New (Complete)
  - newi - New (Incomplete)
  - usedc - Used (Complete)
  - usedi - Used (Incomplete)
  - usedn - Used (Like New)
  - usedg - Used (Good)
  - useda - Used (Acceptable)
  - other - Other
- update_external_id_1 (Optional) - Change the first external ID associated with the lot

---

### Delete

POST https://api.brickowl.com/v1/inventory/delete

Deletes a lot. Please note this will remove the lot from customer carts and quotes

##### Arguments

- external_id (Optional) - External lot identifier
- lot_id (Optional) - Brick Owl lot ID

---

### Create

POST https://api.brickowl.com/v1/inventory/create

Create a new lot. You must pass an item identifier. Parts need a color

##### Arguments

- boid - A BOID
- color_id (Optional) - A Brick Owl color ID. This is required for Parts, optional for Gear/Minibuild, and not allowed for other item types
- quantity - The quantity of the lot, a whole number greater than zero
- price - The price of the lot. It must be a positive number, it will be rounded to 3 digits of precision
- condition - Condition ID
  - new - New
  - news - New (Sealed)
  - newc - New (Complete)
  - newi - New (Incomplete)
  - usedc - Used (Complete)
  - usedi - Used (Incomplete)
  - usedn - Used (Like New)
  - usedg - Used (Good)
  - useda - Used (Acceptable)
  - other - Other
- external_id (Optional) - An optional external ID for reference

---

## Invoice

The invoices API is to retieve information about invoices paid by an account

### Transactions

GET https://api.brickowl.com/v1/invoice/transactions

Retrieve a list of the invoice transactions

##### Arguments

- invoice_id - The invoice ID
- id_type - Type of invoice ID
  - public_invoice_id
  - stripe_charge_id

---

## Order

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

## Token (Deprecated)

This is for accessing details about a token

### Details

GET https://api.brickowl.com/v1/token/details

Retrieve details about the user who the API key belongs to. This will include store details if they have one

---

## User

This is for accessing information about the user associated with the API key.

### Get Token

POST https://api.brickowl.com/v1/user/get\_token

Get a users API token for wishlist edit. This API is only available on request.

##### Arguments

- username - Username
- application_name - Application Name

---

### Details

GET https://api.brickowl.com/v1/user/details

Retrieve details about the user who the API key belongs to. This will include store details if they have one

---

### Addresses

GET https://api.brickowl.com/v1/user/addresses

Retrieve the addresses associated with the user account

---

## Wishlist

The wishlist API allows you to view and update your wishlists

### Lists

GET https://api.brickowl.com/v1/wishlist/lists

Get a list of your wishlists

---

### Lots

GET https://api.brickowl.com/v1/wishlist/lots

Get a list of a specific wishlists lots with details

##### Arguments

- wishlist_id - The wishlists unique ID

---

### Update Lot

POST https://api.brickowl.com/v1/wishlist/update

Update a lots data. You must pass at least one update field

##### Arguments

- wishlist_id - The wishlists unique ID
- lot_id - Wishlist lot ID
- minimum_quantity (Optional) - The minimum quantity required, greater than 0
- maximum_price (Optional) - The price of the item. It must be a positive number or blank, it will be rounded to 3 digits of precision
- note (Optional) - Note
- minimum_condition (Optional) - Condition ID
  - new - New
  - news - New (Sealed)
  - newc - New (Complete)
  - newi - New (Incomplete)
  - usedc - Used (Complete)
  - usedi - Used (Incomplete)
  - usedn - Used (Like New)
  - usedg - Used (Good)
  - useda - Used (Acceptable)
  - other - Other

---

### Delete Lot

POST https://api.brickowl.com/v1/wishlist/delete\_lot

Deletes a wishlist lot

##### Arguments

- wishlist_id - The wishlists unique ID
- lot_id - Wishlist lot ID

---

### Create List

POST https://api.brickowl.com/v1/wishlist/create\_list

Create a new wishlist

##### Arguments

- name - A unique name for the wishlist
- description (Optional) - An optional description

---

### Update List

POST https://api.brickowl.com/v1/wishlist/update\_list

Update a wishlist

##### Arguments

- wishlist_id - The wishlists unique ID
- name - A unique name for the wishlist

---

### Delete List

POST https://api.brickowl.com/v1/wishlist/delete\_list

Delete a wishlist

##### Arguments

- wishlist_id - The wishlists unique ID

---

### Create Lot

POST https://api.brickowl.com/v1/wishlist/create\_lot

Create a new lot. You must pass an item identifier. Parts need a color

##### Arguments

- wishlist_id - The wishlists unique ID
- boid - A BOID
- color_id (Optional) - A Brick Owl color ID. This is required for Parts, optional for Gear and not allowed for other item types

---
