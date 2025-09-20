# External APIs

## Brickognize API

- Purpose: Automated Lego part identification from camera images with confidence scoring
- Docs: https://brickognize.com/api/docs
- Auth: API Key headers
- Key Endpoint: POST /identify; GET /identify/{requestId}
- Notes: Confidence threshold 85% auto-accept; below requires manual verification

## Bricklink API

- Purpose: Marketplace operations, inventory synchronization, catalog passthrough
- Docs: https://www.bricklink.com/v3/api.page
- Auth: OAuth 1.0a
- Key Endpoints: GET /orders, PUT /orders/{id}, GET /items/{type}/{no}, inventory endpoints

## Brickowl API

- Purpose: Secondary marketplace integration
- Docs: https://www.brickowl.com/api
- Auth: Bearer token
- Key Endpoints: GET /orders, PUT /orders/{id}/status, catalog lookup, inventory CRUD
