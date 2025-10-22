# Camera-Based Add to Inventory Workflow - Implementation Plan

## Overview

This plan outlines the implementation of a streamlined camera-based part identification workflow for the Inventory File Detail page. The workflow will allow users to quickly capture a photo, select from identification results, and add parts to their inventory file with minimal friction.

## User Experience Flow

```
[Click "Add Items" Button]
    ↓
[Camera Opens Immediately (no confirmations)]
    ↓
[User Takes Photo (single tap/click)]
    ↓
[Compact Results Display: Image, Title, Part#, Confidence%]
    ↓
[User Selects a Result (tap to confirm)]
    ↓
[Add Part Dialog Opens with Pre-populated Data]
    ↓
[User Adjusts Quantity/Location/Price/Condition]
    ↓
[Part Added to File]
```

## Architecture Components

### 1. **New Component: `CameraCapture.tsx`**

**Location:** `src/components/inventory/CameraCapture.tsx`

**Purpose:** Lightweight camera component for instant capture with no UI confirmations

**Key Features:**

- Auto-start camera stream on mount (request permissions if needed)
- Single-tap capture (no preview confirmation)
- Auto-upload to Convex storage
- Minimal UI: viewfinder + capture button only
- Show loading state during upload/identification
- Error handling for camera permissions/failures

**State Management:**

```typescript
type CaptureStage =
  | "requesting_permissions"
  | "initializing_camera"
  | "ready" // Camera ready, show capture button
  | "capturing" // Processing capture
  | "uploading" // Uploading to Convex
  | "identifying" // Calling Brickognize API
  | "complete" // Results ready
  | "error";

interface CameraCaptureState {
  stage: CaptureStage;
  stream: MediaStream | null;
  error: string | null;
  progress: number; // 0-100 for upload/identify
}
```

**Props:**

```typescript
interface CameraCaptureProps {
  businessAccountId: Id<"businessAccounts">;
  onResults: (results: PartIdentificationResult) => void;
  onCancel: () => void;
  onError: (error: string) => void;
}
```

**Implementation Notes:**

- Use `navigator.mediaDevices.getUserMedia()` for camera access
- Capture to canvas → blob → upload in one flow
- No captured image preview (trust the shot)
- Reuse existing `PartIdentificationService` for upload/identify
- Clean up camera stream on unmount or after successful capture

---

### 2. **New Component: `IdentificationResultsList.tsx`**

**Location:** `src/components/inventory/IdentificationResultsList.tsx`

**Purpose:** Compact, scrollable list of identification results

**Key Features:**

- Compact card layout for each result
- Essential info only: image, title, part number, confidence
- Mobile-optimized (vertical stack on small screens)
- Single tap/click to select (no confirmation dialog)
- Visual feedback on confidence (color-coded badges)

**Props:**

```typescript
interface IdentificationResultsListProps {
  results: PartIdentificationResult;
  onSelectResult: (item: PartIdentificationItem) => void;
  onRetake: () => void;
  capturedImageUrl?: string; // Optional: show original captured image
}
```

**UI Layout (Mobile-First):**

```
┌─────────────────────────────────┐
│  Your Captured Image (optional) │
│  [Image Preview - Compact]      │
├─────────────────────────────────┤
│  Select Identified Part:        │
├─────────────────────────────────┤
│ ┌─────┬─────────────────────┐  │
│ │ IMG │ Brick 1 x 2         │  │
│ │     │ Part: 3004          │  │
│ │     │ 95% Confidence      │  │
│ └─────┴─────────────────────┘  │
├─────────────────────────────────┤
│ ┌─────┬─────────────────────┐  │
│ │ IMG │ Brick 1 x 4         │  │
│ │     │ Part: 3010          │  │
│ │     │ 87% Confidence      │  │
│ └─────┴─────────────────────┘  │
├─────────────────────────────────┤
│ [None of These] [Retake Photo] │
└─────────────────────────────────┘
```

**Confidence Color Coding:**

- 90-100%: Green badge (High confidence)
- 70-89%: Yellow/Orange badge (Medium confidence)
- <70%: Red badge (Low confidence)

---

### 3. **Modified Component: `InventoryFileDetail.tsx`**

**Location:** `src/components/inventory/InventoryFileDetail.tsx` (already exists)

**Changes Needed:**

1. **Add Camera Workflow State:**

```typescript
type AddItemWorkflowStage = "idle" | "capturing" | "viewing_results" | "adding_to_inventory";

const [addItemStage, setAddItemStage] = useState<AddItemWorkflowStage>("idle");
const [identificationResults, setIdentificationResults] = useState<PartIdentificationResult | null>(
  null,
);
const [selectedIdentifiedPart, setSelectedIdentifiedPart] = useState<PartIdentificationItem | null>(
  null,
);
const [partDetailsForAdd, setPartDetailsForAdd] = useState<CatalogPartDetails | null>(null);
```

2. **Update "Add Items" Button Handler:**

```typescript
const handleAddItemsClick = () => {
  setAddItemStage("capturing");
  // This will trigger the camera capture component to mount
};
```

3. **Add Workflow Orchestration:**

```typescript
// When camera capture completes with results
const handleIdentificationComplete = (results: PartIdentificationResult) => {
  setIdentificationResults(results);
  setAddItemStage("viewing_results");
};

// When user selects an identification result
const handleResultSelected = async (item: PartIdentificationItem) => {
  setSelectedIdentifiedPart(item);

  // Fetch full part details from catalog
  try {
    const details = await getPartDetailsMutation({
      partNumber: item.id, // Brickognize returns part number as 'id'
      fetchFromBricklink: false,
    });
    setPartDetailsForAdd(details);
    setAddItemStage("adding_to_inventory");
  } catch (error) {
    // Handle error: part not in catalog, schedule fetch
    console.error("Failed to load part details:", error);
    // Show error to user, offer to retry after a moment
  }
};

// When user completes or cancels the add dialog
const handleAddDialogClose = () => {
  setAddItemStage("idle");
  setIdentificationResults(null);
  setSelectedIdentifiedPart(null);
  setPartDetailsForAdd(null);
};

// When user wants to retake photo
const handleRetakePhoto = () => {
  setIdentificationResults(null);
  setAddItemStage("capturing");
};
```

4. **Render Workflow Components:**

```typescript
return (
  <div className="space-y-4">
    {/* Existing header, filters, table, etc. */}

    {/* Camera Capture Dialog/Sheet */}
    {addItemStage === "capturing" && (
      <Sheet open={true} onOpenChange={() => setAddItemStage("idle")}>
        <SheetContent side="bottom" className="h-[90vh]">
          <CameraCapture
            businessAccountId={businessAccountId}
            onResults={handleIdentificationComplete}
            onCancel={() => setAddItemStage("idle")}
            onError={(error) => {
              console.error("Camera error:", error);
              setAddItemStage("idle");
            }}
          />
        </SheetContent>
      </Sheet>
    )}

    {/* Identification Results Dialog/Sheet */}
    {addItemStage === "viewing_results" && identificationResults && (
      <Sheet open={true} onOpenChange={() => setAddItemStage("idle")}>
        <SheetContent side="bottom" className="h-[80vh]">
          <IdentificationResultsList
            results={identificationResults}
            onSelectResult={handleResultSelected}
            onRetake={handleRetakePhoto}
          />
        </SheetContent>
      </Sheet>
    )}

    {/* Add Part to Inventory Dialog (existing component) */}
    {addItemStage === "adding_to_inventory" && partDetailsForAdd && selectedIdentifiedPart && (
      <AddPartToInventoryDialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleAddDialogClose();
        }}
        part={{
          partNumber: selectedIdentifiedPart.id,
          name: selectedIdentifiedPart.name,
          // ... map other fields from identification result
        }}
        details={partDetailsForAdd}
        selectedColorId={undefined} // Let user choose color
      />
    )}
  </div>
);
```

---

### 4. **Modified Component: `AddPartToInventoryDialog.tsx`**

**Location:** `src/components/inventory/add-part-to-inventory-dialog.tsx` (already exists)

**Changes Needed:**

1. **Auto-populate fileId from context:**

```typescript
interface AddPartToInventoryDialogProps {
  // ... existing props
  defaultFileId?: Id<"inventoryFiles"> | "none"; // NEW: Optional default file
}

// In component:
useEffect(() => {
  if (open && details && part) {
    setFileId(defaultFileId ?? "none"); // Use provided default or "none"
    // ... rest of existing logic
  }
}, [open, part, details, defaultFileId]);
```

2. **Pass fileId from InventoryFileDetail:**

```typescript
<AddPartToInventoryDialog
  open={true}
  onOpenChange={handleAddDialogClose}
  part={mappedPart}
  details={partDetailsForAdd}
  defaultFileId={fileId} // Pass current file ID
/>
```

This ensures parts added via this workflow automatically go into the current file.

---

## Backend - No Changes Required

The existing backend infrastructure already supports this workflow:

✅ **Convex Storage:** `api.identify.mutations.generateUploadUrl()`
✅ **Image Identification:** `api.identify.actions.identifyPartFromImage()`
✅ **Catalog Lookup:** `api.catalog.mutations.getPartDetails()`
✅ **Add to Inventory:** `api.inventory.mutations.addInventoryItem()`

All required endpoints are implemented and working.

---

## UI/UX Considerations

### Mobile-First Design

- **Sheet Component (not Dialog)** for better mobile UX
- Full-height camera view (90vh)
- Large, thumb-friendly capture button
- Swipe-to-dismiss sheets
- Portrait-optimized layouts

### Error Handling

1. **Camera Permission Denied:**

   - Show friendly message
   - Provide instructions to enable in settings
   - Offer fallback: manual part number entry

2. **Identification Fails:**

   - Show error message
   - Offer to retry
   - Fallback: manual part search

3. **Part Not in Catalog:**

   - Show message: "Fetching from Bricklink..."
   - Wait a few seconds and retry
   - If still fails, offer manual search

4. **Network Offline:**
   - Detect offline state
   - Show clear offline message
   - Don't allow workflow to start

### Performance Optimizations

- Lazy load camera components (code split)
- Optimize image capture resolution (1280px max width)
- Show progress indicators during async operations
- Cancel in-flight requests on unmount

---

## Implementation Steps

### Phase 1: Camera Capture Component

**Estimated Time: 3-4 hours**

1. Create `CameraCapture.tsx` component
2. Implement camera stream initialization
3. Add capture logic (canvas → blob → upload)
4. Integrate with `PartIdentificationService`
5. Add error handling and loading states
6. Style for mobile-first

**Testing:**

- Camera permissions flow
- Image capture quality
- Upload success/failure
- Service integration

---

### Phase 2: Results Display Component

**Estimated Time: 2-3 hours**

1. Create `IdentificationResultsList.tsx` component
2. Implement compact card layout
3. Add confidence color coding
4. Make mobile-responsive
5. Add "Retake" and "None of these" options

**Testing:**

- Render with various result counts
- Confidence badge display
- Mobile layout responsiveness
- Selection interaction

---

### Phase 3: Integration with InventoryFileDetail

**Estimated Time: 3-4 hours**

1. Add workflow state management to `InventoryFileDetail`
2. Update "Add Items" button handler
3. Add Sheet overlays for camera and results
4. Implement result selection → catalog lookup
5. Wire up `AddPartToInventoryDialog` with prefilled fileId
6. Add error handling for catalog lookup failures

**Testing:**

- Full workflow: capture → identify → select → add
- Error scenarios at each stage
- Dialog/Sheet transitions
- State cleanup on cancel/complete

---

### Phase 4: AddPartToInventoryDialog Enhancement

**Estimated Time: 1-2 hours**

1. Add `defaultFileId` prop
2. Update initialization logic to use default
3. Test prepopulation

---

### Phase 5: Polish and Edge Cases

**Estimated Time: 2-3 hours**

1. Add loading spinners and progress indicators
2. Improve error messages
3. Add offline detection
4. Test on various devices/browsers
5. Add accessibility features (ARIA labels)
6. Performance optimization

---

## Total Estimated Time: 11-16 hours

---

## Files to Create

```
src/components/inventory/
├── CameraCapture.tsx              (NEW - ~200-300 lines)
├── IdentificationResultsList.tsx  (NEW - ~150-200 lines)
```

---

## Files to Modify

```
src/components/inventory/
├── InventoryFileDetail.tsx        (MODIFY - add workflow orchestration)
├── add-part-to-inventory-dialog.tsx (MODIFY - add defaultFileId prop)
```

---

## Dependencies Check

All required dependencies are already in the project:

- ✅ Camera API (browser native)
- ✅ Convex React hooks
- ✅ Sheet component (shadcn/ui)
- ✅ PartIdentificationService
- ✅ Existing catalog mutations

No new npm packages required.

---

## Testing Strategy

### Unit Tests (Jest)

- `CameraCapture`: Camera initialization, capture logic
- `IdentificationResultsList`: Rendering, selection
- State management in `InventoryFileDetail`

### Integration Tests

- Full workflow from camera → inventory
- Error handling at each stage
- Catalog lookup integration

### Manual Testing Checklist

- [ ] Camera opens immediately on "Add Items" click
- [ ] Photo capture works on first tap (no confirmation)
- [ ] Results display with correct confidence percentages
- [ ] Selecting a result fetches catalog details
- [ ] Add dialog opens with fileId prepopulated
- [ ] Part is added to correct file
- [ ] Retake photo works
- [ ] Cancel at any stage returns to normal state
- [ ] Works on mobile Safari
- [ ] Works on mobile Chrome
- [ ] Works on desktop browsers
- [ ] Camera permissions denial handled gracefully
- [ ] Offline state detected and handled
- [ ] Low confidence results are visually distinguished

---

## Mobile Browser Compatibility Notes

### iOS Safari

- Requires HTTPS for camera access (already handled in production)
- Camera stream must be in user gesture context (click handler)
- Consider video playback restrictions

### Android Chrome

- Similar HTTPS requirement
- Generally more permissive than iOS
- Test on various Android versions

### Feature Detection

```typescript
const isCameraSupported = () => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};
```

---

## Future Enhancements (Out of Scope for MVP)

1. **Batch Capture Mode:** Capture multiple parts in succession
2. **Image Preview with Crop:** Let user crop/adjust before identification
3. **Save Identification History:** Store past identifications for reference
4. **Multiple Color Detection:** Auto-detect color from image
5. **Barcode/QR Scanner:** Scan set numbers or inventory barcodes
6. **Offline Caching:** Queue captures when offline, process when back online

---

## Success Metrics

Post-implementation, measure:

- **Time to Add:** Average time from "Add Items" click to inventory item created
- **Identification Accuracy:** % of first-result selections
- **Workflow Completion Rate:** % of users who complete the full flow
- **Error Rate:** % of captures that fail identification
- **User Satisfaction:** Qualitative feedback on ease of use

---

## Risks and Mitigations

| Risk                           | Impact | Likelihood | Mitigation                                       |
| ------------------------------ | ------ | ---------- | ------------------------------------------------ |
| Camera permissions denied      | High   | Medium     | Clear instructions, fallback to manual entry     |
| Low identification accuracy    | High   | Low        | Show confidence scores, easy retake              |
| Part not in catalog            | Medium | Low        | Auto-fetch from Bricklink, show loading state    |
| Mobile browser incompatibility | High   | Low        | Feature detection, browser compatibility testing |
| Performance on older devices   | Medium | Medium     | Optimize image size, show progress indicators    |

---

## Conclusion

This implementation plan provides a streamlined, mobile-first workflow for adding inventory items via camera identification. By minimizing user friction (no confirmations, auto-transitions) and reusing existing backend services, we can deliver a fast, intuitive experience that significantly speeds up the inventory addition process.

The phased approach allows for iterative testing and refinement, ensuring each component works correctly before integrating into the full workflow.
