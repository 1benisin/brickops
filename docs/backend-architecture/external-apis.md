# External APIs

## Brickognize API

- **Purpose:** Automated Lego part identification from camera images with confidence scoring for mobile and desktop use
- **Documentation:** https://brickognize.com/api/docs (user should verify current URL)
- **Base URL(s):** https://api.brickognize.com/v1
- **Authentication:** API Key-based authentication with request headers
- **Rate Limits:** 1,000 identifications per month per API key (free tier), paid tiers available

**Key Endpoints Used:**

- `POST /identify` - Submit image for part identification with confidence scoring
- `GET /identify/{requestId}` - Retrieve identification results for async processing
- `GET /usage` - Check current API usage and remaining quota

**Integration Notes:** Critical for FR1 requirement of 95%+ accuracy. Must implement image preprocessing for optimal results and handle confidence thresholds for manual verification workflows. Consider caching successful identifications to reduce API usage.

## Bricklink API

- **Purpose:** Marketplace operations, inventory synchronization, order management, and catalog data passthrough for comprehensive Lego parts database

- **Documentation:** https://www.bricklink.com/v3/api.page (user should verify current URL)
- **Base URL(s):** https://api.bricklink.com/api/store/v1
- **Authentication:** OAuth 1.0a with consumer key/secret and access token/secret
- **Rate Limits:** 5,000 requests per day per API key, with burst limits of 10 requests per minute

**Key Endpoints Used:**

- `GET /orders` - Import orders from Bricklink marketplace
- `PUT /orders/{orderId}` - Update order status (picked, shipped, etc.)
- `GET /items/{type}/{no}` - Fetch part details for catalog passthrough
- `GET /inventories` - Retrieve current inventory for ground truth validation
- `POST /inventories` - Create new inventory items
- `PUT /inventories/{inventoryId}` - Update inventory quantities and status
- `DELETE /inventories/{inventoryId}` - Remove inventory items

**Integration Notes:** Serves as authoritative inventory source during MVP (FR19). Must implement robust OAuth flow for user credential management. Critical for FR8 bidirectional synchronization and FR11 automatic inventory adjustment.

## Brickowl API

- **Purpose:** Secondary marketplace integration for order import and inventory synchronization to expand market reach

- **Documentation:** https://www.brickowl.com/api (user should verify current URL)
- **Base URL(s):** https://api.brickowl.com/v1
- **Authentication:** API Key-based authentication with Bearer token
- **Rate Limits:** 10,000 requests per month per API key, 100 requests per hour burst limit

**Key Endpoints Used:**

- `GET /orders` - Import orders from Brickowl marketplace
- `PUT /orders/{orderId}/status` - Update order processing status
- `GET /catalog/lookup` - Part number validation and catalog verification
- `GET /inventory` - Retrieve current inventory listings
- `POST /inventory` - Create new inventory listings
- `PUT /inventory/{listingId}` - Update inventory quantities and pricing

**Integration Notes:** Secondary marketplace supporting FR7 and FR8 bidirectional sync requirements. Lower rate limits require more aggressive caching and batch processing strategies. Must handle differences in data formats compared to Bricklink API.
