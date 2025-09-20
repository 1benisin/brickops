# Brickognize API

- **Purpose**: Automated LEGO® part, set, and minifigure identification from camera images with confidence scoring
- **Documentation**: https://brickognize.com/api/docs
- **API Version**: 1.0.0
- **Base URL**: https://brickognize.com/api
- **Authentication**: API Key headers
- **Contact**: piotr.rybak@brickognize.com

### Key Endpoints

#### Image Recognition (Legacy API)

- **POST /predict/parts/** - Identify LEGO parts from image
- **POST /predict/sets/** - Identify LEGO sets from image
- **POST /predict/figs/** - Identify LEGO minifigures from image
- **POST /predict/** - General prediction (deprecated)

#### Health & Monitoring

- **GET /health/** - API health check for uptime monitoring

#### Feedback

- **POST /feedback/** - Submit prediction feedback (deprecated)

### Request/Response Format

**Image Upload**: All prediction endpoints accept `multipart/form-data` with:

- `query_image` (binary): Image file to analyze

**Response Schema**:

```json
{
  "listing_id": "res-d492bca0",
  "bounding_box": {
    "left": 0,
    "upper": 0,
    "right": 320,
    "lower": 240,
    "image_width": 768,
    "image_height": 1024,
    "score": 0.99
  },
  "items": [
    {
      "id": "3001",
      "name": "Brick 2 x 4",
      "img_url": "https://storage.googleapis.com/brickognize-static/thumbnails/part/3001/0.webp",
      "external_sites": [
        {
          "name": "bricklink",
          "url": "https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001"
        }
      ],
      "category": "Brick",
      "type": "part",
      "score": 0.9
    }
  ]
}
```

### Integration Notes

- **Confidence Threshold**: 85% auto-accept; below requires manual verification
- **Rate Limits**: Check API documentation for current limits
- **Image Requirements**: Supported formats and size limits per API docs
- **Error Handling**: Returns 422 for validation errors with detailed error messages
- **Legacy Status**: Current endpoints are marked as deprecated; monitor for API updates

### Error Responses

**Validation Error (422)**:

```json
{
  "detail": [
    {
      "loc": ["field_name"],
      "msg": "error message",
      "type": "error_type"
    }
  ]
}
```

- **Purpose**: Marketplace operations, inventory synchronization, catalog passthrough, and order management
- **Documentation**: https://www.bricklink.com/v3/api.page
- **API Version**: v1
- **Base URL**: https://api.bricklink.com/api/store/v1
- **Authentication**: OAuth 1.0a with HMAC-SHA1 signature
- **Contact**: API support through BrickLink platform

### General Notes

- **SSL Only**: All requests must be done over SSL
- **UTF-8 Encoding**: Every string passed to and from the API must be UTF-8 encoded
- **Date Format**: All timestamps are in ISO 8601 format: `yyyy-MM-dd'T'HH:mm:ss.SSSZ`
- **Rounding Policy**: Uses 4 decimal places for all financial calculations
- **Request Format**: OAuth parameters in Authorization header or query string, JSON for PUT/POST
- **Response Format**: JSON with `meta` (status info) and `data` (requested content) objects

### Authentication

**OAuth 1.0a Parameters**:

- `oauth_version`: Must be "1.0"
- `oauth_consumer_key`: Consumer key
- `oauth_token`: Access token
- `oauth_timestamp`: Seconds since January 1, 1970 GMT
- `oauth_nonce`: Random string, unique per request
- `oauth_signature_method`: Must be "HMAC-SHA1"
- `oauth_signature`: RFC3986 percent-encoded signature

**Example Authorization Header**:

```
Authorization: OAuth realm="",
oauth_consumer_key="7CCDCEF257CF43D89A74A7E39BEAA1E1",
oauth_token="AC40C8C32A1748E0AE1EFA13CCCFAC3A",
oauth_signature_method="HMAC-SHA1",
oauth_signature="0IeNpR5N0kTEBURcuUMGTDPKU1c%3D",
oauth_timestamp="1191242096",
oauth_nonce="kllo9940pd9333jh",
oauth_version="1.0"
```

### Key Endpoints

#### Orders

- **GET /orders** - Retrieve orders (received/placed)
  - Parameters: `direction` (in/out), `status`, `filed`
- **GET /orders/{order_id}** - Get specific order details
- **GET /orders/{order_id}/items** - Get order items
- **GET /orders/{order_id}/messages** - Get order messages
- **GET /orders/{order_id}/feedback** - Get order feedback
- **PUT /orders/{order_id}** - Update order properties
- **PUT /orders/{order_id}/status** - Update order status
- **PUT /orders/{order_id}/payment_status** - Update payment status
- **POST /orders/{order_id}/drive_thru** - Send "Thank You" email

#### Store Inventory

- **GET /inventories** - Retrieve store inventories
  - Parameters: `item_type`, `status`, `category_id`, `color_id`
- **GET /inventories/{inventory_id}** - Get specific inventory
- **POST /inventories** - Create new inventory
- **PUT /inventories/{inventory_id}** - Update inventory
- **DELETE /inventories/{inventory_id}** - Delete inventory

#### Catalog

- **GET /items/{type}/{no}** - Get item information
- **GET /items/{type}/{no}/images/{color_id}** - Get item image URL
- **GET /items/{type}/{no}/supersets** - Get items containing this item
- **GET /items/{type}/{no}/subsets** - Get items contained in this item
- **GET /items/{type}/{no}/price** - Get price guide data
- **GET /items/{type}/{no}/colors** - Get known colors for item

#### Feedback

- **GET /feedback** - Get feedback list (received/posted)
- **GET /feedback/{feedback_id}** - Get specific feedback
- **POST /feedback** - Post new feedback
- **POST /feedback/{feedback_id}/reply** - Reply to feedback

#### Colors & Categories

- **GET /colors** - Get color list
- **GET /colors/{color_id}** - Get specific color
- **GET /categories** - Get category list
- **GET /categories/{category_id}** - Get specific category

#### Other Resources

- **GET /notifications** - Get push notifications
- **GET /coupons** - Manage coupons
- **GET /settings/shipping_methods** - Get shipping methods
- **GET /members/{username}/ratings** - Get member ratings
- **GET /item_mapping/{type}/{no}** - Get element ID mappings

### Request/Response Format

**Standard Response Structure**:

```json
{
  "meta": {
    "code": "200",
    "message": "OK",
    "description": "OK"
  },
  "data": {
    // Requested content
  }
}
```

**Order Resource Example**:

```json
{
  "order_id": 3905404,
  "date_ordered": "2013-10-29T17:59:06.373Z",
  "date_status_changed": "2014-02-26T01:26:55.467Z",
  "seller_name": "covariance",
  "store_name": "skbrickshop",
  "buyer_name": "sklee",
  "buyer_email": "sklee@fakemail.com",
  "status": "PENDING",
  "is_invoiced": true,
  "total_count": 1,
  "unique_count": 1,
  "total_weight": "1.03",
  "payment": {
    "method": "PayPal.com",
    "currency_code": "EUR",
    "date_paid": "2014-02-26T01:29:28.147Z",
    "status": "Sent"
  },
  "shipping": {
    "method_id": 17862,
    "method": "PostBox",
    "address": {
      "name": {
        "full": "Seulki Lee"
      },
      "full": "fake address",
      "country_code": "KR"
    }
  },
  "cost": {
    "currency_code": "EUR",
    "subtotal": "10.1210",
    "grand_total": "13.1210",
    "shipping": "3.0000"
  }
}
```

### Error Handling

**HTTP Status Codes**:

- `200` - OK: Request successful
- `201` - OK_CREATED: Resource created
- `204` - OK_NO_CONTENT: Success, no content
- `400` - INVALID_URI / INVALID_REQUEST_BODY / PARAMETER_MISSING_OR_INVALID
- `401` - BAD_OAUTH_REQUEST: Authentication failed
- `403` - PERMISSION_DENIED: Not authorized
- `404` - RESOURCE_NOT_FOUND: Resource doesn't exist
- `405` - METHOD_NOT_ALLOWED: HTTP method not permitted
- `415` - UNSUPPORTED_MEDIA_TYPE: Content type not supported
- `422` - RESOURCE_UPDATE_NOT_ALLOWED: Update request denied
- `500` - INTERNAL_SERVER_ERROR: Server error

### Integration Notes

- **Rate Limits**: Check current API documentation for limits
- **Item Types**: PART, SET, MINIFIG, BOOK, GEAR, CATALOG, INSTRUCTION, UNSORTED_LOT, ORIGINAL_BOX
- **Condition Codes**: N (New), U (Used), C (Complete), B (Incomplete), S (Sealed)
- **Status Codes**: PENDING, UPDATED, PROCESSING, READY, PAID, PACKED, SHIPPED, RECEIVED, COMPLETED, OCR, NPB, NPX, NRS, NSS, CANCELLED, PURGED
- **Payment Status**: None, Sent, Received, Returned, Bounced, Completed
- **Currency**: ISO 4217 format (USD, EUR, etc.)
- **Country Codes**: ISO 3166-1 alpha-2 (exception: UK instead of GB)

### Error Responses

**Validation Error (400)**:

```json
{
  "meta": {
    "code": "400",
    "message": "PARAMETER_MISSING_OR_INVALID",
    "description": "One of the parameters specified is invalid or missing"
  }
}
```
