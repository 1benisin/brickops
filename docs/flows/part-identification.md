# Part Identification Flow

## Overview

User captures a photo of a LEGO part and uses Brickognize API to identify it. Results are displayed with confidence scores, and user can select a match.

## Flow Steps

**User** - Navigates to `/identify` page (or opens identification dialog from inventory)

**User** - Grants camera permissions (if first time)

**Frontend** - Requests camera access via `getUserMedia()`

**Frontend** - Initializes video stream

**User** - Positions part in camera view

**User** - Clicks capture button

**Frontend** - Captures frame from video stream
  - Converts video frame to canvas
  - Validates minimum dimensions (640x480)
  - Converts canvas to JPEG blob (quality 0.9)

**Frontend** - Generates upload URL via `api.files.generateUploadUrl`

**Frontend** - Uploads image to Convex storage

**Convex** - Returns `storageId`

**Frontend** - Calls `api.identify.actions.identifyPartFromImage` with `storageId`

**Convex** - Validates user authentication and business account

**Convex** - Retrieves image from storage as `ArrayBuffer`

**Convex** - Creates `FormData` with image blob

**Convex** - Calls Brickognize API:
  - Endpoint: `POST /predict/`
  - Body: `multipart/form-data` with `query_image` field
  - Headers: API key (from environment)

**Brickognize API** - Analyzes image and returns identification results:
  - `listing_id`: Unique identifier for this identification
  - `bounding_box`: Image coordinates of detected part
  - `items`: Array of identified parts with:
    - `id`: Part number
    - `name`: Part name
    - `type`: "part" | "set" | "minifig"
    - `category`: Category name
    - `score`: Confidence score (0-1)
    - `img_url`: Thumbnail image URL
    - `external_sites`: Links to Bricklink, etc.

**Convex** - Transforms results to internal format:
  - Maps items to `IdentificationResultItem[]`
  - Calculates `topScore` (highest confidence)
  - Flags `lowConfidence` if `topScore < CONFIDENCE_THRESHOLD` (85%)

**Convex** - Cleans up uploaded image from storage

**Convex** - Returns identification result to frontend

**Frontend** - Displays results in `IdentificationResultsList`:
  - Shows all identified parts with confidence scores
  - Highlights top match
  - Shows low confidence warning if applicable
  - Displays part images and names

**User** - Reviews identification results

**User** - Selects a part from results (or retakes photo if low confidence)

**Frontend** - Opens `AddPartToInventoryDialog` with selected part number (if from inventory flow)

**Frontend** - Or displays part details (if from identify page)

## Related Files

- `src/app/(authenticated)/identify/page.tsx` - Standalone identify page
- `src/components/identify/CameraIdentificationPanel.tsx` - Camera interface
- `src/components/inventory/dialogs/SearchOrCaptureDialog.tsx` - Unified search/capture dialog
- `convex/identify/actions.ts::identifyPartFromImage` - Identification action
- `src/lib/services/part-identification-service.ts` - Frontend service
- `docs/external-documentation/api-brickognize.md` - Brickognize API docs

## Notes

- Confidence threshold is 85% (auto-accept above, manual review below)
- Image is deleted from storage after identification
- Results include multiple matches ranked by confidence
- External links (Bricklink) are provided for each match
- Identification can be used standalone or as part of add inventory flow
- Camera permissions are requested on first use
- Minimum capture dimensions: 640x480 (actual capture: 1280x?)

