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
