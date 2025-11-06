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
