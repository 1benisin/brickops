# Catalog Search in Add Inventory Flow - Implementation Plan

## Executive Summary

Add text-based catalog search alongside camera search in the inventory add flow. Users will be able to search by part name or part number in the same initial dialog where camera capture happens, and both search types will display results in a unified results dialog.

## Current State Analysis

### Existing Flow

1. User clicks "Add Item" button
2. **CameraCapture** sheet opens (camera only, full-screen)
3. User takes photo → uploaded to Convex → identified via Brickognize
4. **IdentificationResultsList** sheet displays results with confidence scores
5. User selects a result
6. **AddPartToInventoryDialog** opens for final details (color, quantity, location, etc.)

### Current Components

**`AddInventoryItemButton.tsx`**

- Orchestrates the workflow
- Uses `useAddItemWorkflow` hook to manage state
- Renders three sheets: CameraCapture, IdentificationResultsList, AddPartToInventoryDialog

**`useAddItemWorkflow.ts`**

- State: `addItemStage` (idle | capturing | viewing_results | adding_to_inventory)
- Manages workflow transitions between sheets

**`CameraCapture.tsx`**

- Bottom sheet with camera view
- Handles camera permissions, capture, upload, and Brickognize identification
- Calls `onResults(identification)` on success

**`IdentificationResultsList.tsx`**

- Bottom sheet displaying identification results
- Shows parts with images, names, IDs, confidence scores
- User clicks a result to proceed to inventory dialog

**Catalog Search (`/catalog/page.tsx` + `CatalogSearchBar.tsx`)**

- Standalone page with search by part title, part ID, or location
- Uses `api.catalog.queries.searchParts` with pagination
- Three mutually exclusive search modes

## Proposed Solution

### High-Level Changes

1. **Replace CameraCapture with unified SearchOrCaptureDialog**

   - Combine camera capture AND catalog search in one dialog
   - Tabs or segmented control: "Camera" vs "Search"
   - Camera tab: existing camera capture UI
   - Search tab: part name and part number input fields

2. **Normalize search results format**

   - Camera results: already have `PartIdentificationResult` format
   - Catalog results: map to similar format for display
   - Both feed into IdentificationResultsList

3. **Update IdentificationResultsList for dual sources**
   - Currently shows Brickognize results with confidence scores
   - For catalog results: show without confidence badges (or 100% confidence)
   - Add visual indicator of result source (camera vs search)

## Detailed Implementation Plan

### Phase 1: Create Unified Search/Capture Dialog

**New Component: `SearchOrCaptureDialog.tsx`**

Location: `src/components/inventory/SearchOrCaptureDialog.tsx`

**Props:**

```typescript
interface SearchOrCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResults: (results: UnifiedSearchResult) => void;
  onError: (error: string) => void;
}

type UnifiedSearchResult = {
  source: "camera" | "search";
  items: UnifiedResultItem[];
  confidence?: number; // Only for camera results
};

type UnifiedResultItem = {
  id: string; // part number
  name: string;
  category: string | null;
  imageUrl: string | null;
  score?: number; // Only for camera results
  externalSites?: { name: string; url: string }[];
};
```

**UI Structure (using shadcn/ui Tabs):**

```
┌─────────────────────────────────────────────┐
│  Add Inventory Item                         │
│  Capture a photo or search by part name/number │
│                                             │
│  ┌────────────┬────────────┐               │
│  │ 📷 Camera  │ 🔍 Search  │  ← Tabs       │
│  └────────────┴────────────┘               │
│  ┌─────────────────────────────────┐       │
│  │                                 │       │
│  │  [Active Tab Content]           │       │
│  │                                 │       │
│  │  Camera: Video + Capture Button │       │
│  │  OR                             │       │
│  │  Search: Part Name/Number inputs│       │
│  │                                 │       │
│  └─────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

**localStorage Key:** `inventory-add-method` stores user's preferred tab (`"camera"` | `"search"`)

**Implementation Details:**

**Tab State with localStorage Persistence:**

```typescript
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Inside component
const [activeTab, setActiveTab] = useLocalStorage<"camera" | "search">(
  "inventory-add-method", // localStorage key
  "camera", // default value
);
```

> **Note:** The project already has `useLocalStorage` hook at `src/hooks/use-local-storage.ts` that syncs across tabs and handles SSR safely.

**UI Implementation using shadcn/ui Tabs:**

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="bottom" className="h-[85vh]">
    <SheetTitle>Add Inventory Item</SheetTitle>
    <SheetDescription>Capture a photo or search by part name/number</SheetDescription>

    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="camera">
          <Camera className="h-4 w-4 mr-2" />
          Camera
        </TabsTrigger>
        <TabsTrigger value="search">
          <Search className="h-4 w-4 mr-2" />
          Search
        </TabsTrigger>
      </TabsList>

      <TabsContent value="camera" className="mt-4">
        {/* Camera capture UI */}
      </TabsContent>

      <TabsContent value="search" className="mt-4">
        {/* Search form UI */}
      </TabsContent>
    </Tabs>
  </SheetContent>
</Sheet>
```

**Camera Tab:**

- Reuse logic from existing `CameraCapture.tsx`
- Camera view, capture button, upload/identify flow
- Transform Brickognize results to `UnifiedSearchResult` format
- Pass to `onResults()` with `source: "camera"`

**Search Tab:**

```typescript
const [partName, setPartName] = useState("");
const [partNumber, setPartNumber] = useState("");
const [isSearching, setIsSearching] = useState(false);

// Use catalog search query
const { results } = usePaginatedQuery(
  api.catalog.queries.searchParts,
  partName || partNumber
    ? {
        partTitle: partName || undefined,
        partId: partNumber || undefined,
      }
    : "skip",
  { initialNumItems: 10 },
);
```

**Search Logic:**

- User types in part name OR part number (mutually exclusive, like catalog page)
- Disable one field when the other has input
- Display real-time results or "Search" button to trigger search
- Transform catalog results to `UnifiedSearchResult` format
- Pass to `onResults()` with `source: "search"`

**Data Transformation:**

```typescript
// Camera results (Brickognize) → Unified
function transformCameraResults(brickognizeResult: PartIdentificationResult): UnifiedSearchResult {
  return {
    source: "camera",
    items: brickognizeResult.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category ?? null,
      imageUrl: item.imageUrl ?? null,
      score: item.score,
      externalSites: item.externalSites,
    })),
    confidence: brickognizeResult.topScore,
  };
}

// Catalog search → Unified
function transformCatalogResults(catalogParts: CatalogPart[]): UnifiedSearchResult {
  return {
    source: "search",
    items: catalogParts.map((part) => ({
      id: part.partNumber,
      name: part.name,
      category: part.categoryId ? "Unknown" : null, // Could fetch category name
      imageUrl: part.thumbnailUrl ?? part.imageUrl ?? null,
      score: undefined, // No confidence for text search
      externalSites: undefined,
    })),
  };
}
```

### Phase 2: Update IdentificationResultsList

**File:** `src/components/inventory/IdentificationResultsList.tsx`

**Changes:**

1. **Update Props:**

```typescript
interface IdentificationResultsListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: UnifiedSearchResult; // Changed from PartIdentificationResult
  onSelectResult: (item: UnifiedResultItem) => void; // Changed param type
  onRetake: () => void;
}
```

2. **Update Display Logic:**

```typescript
function IdentificationResultItem({
  item,
  index,
  source, // new prop
  isLoading,
  onSelect,
}: {
  item: UnifiedResultItem;
  index: number;
  source: "camera" | "search";
  isLoading: boolean;
  onSelect: (item: UnifiedResultItem) => void;
}) {
  // Existing card layout

  // Modified confidence badge section:
  {source === "camera" && item.score !== undefined ? (
    <Badge
      variant={getConfidenceBadgeVariant(item.score)}
      className={cn("text-xs font-semibold", getConfidenceColor(item.score))}
    >
      {formatConfidence(item.score)} Confidence
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs">
      Catalog Match
    </Badge>
  )}
}
```

3. **Update Header Text:**

```typescript
<SheetTitle>
  {results.source === "camera"
    ? "Camera Identification Results"
    : "Catalog Search Results"}
</SheetTitle>
<SheetDescription>
  {results.source === "camera"
    ? "Review identified parts and select one to add to inventory"
    : "Select a part from the catalog to add to inventory"}
</SheetDescription>
```

### Phase 3: Update Workflow Hook

**File:** `src/hooks/useAddItemWorkflow.ts`

**Changes:**

1. **Update Types:**

```typescript
// Update import
import type {
  UnifiedSearchResult,
  UnifiedResultItem,
} from "@/components/inventory/SearchOrCaptureDialog";

// Update state
const [identificationResults, setIdentificationResults] = useState<UnifiedSearchResult | null>(
  null,
);
```

2. **Update Handler:**

```typescript
const handleIdentificationComplete = (results: UnifiedSearchResult) => {
  setIdentificationResults(results);
  setAddItemStage("viewing_results");
};

const handleResultSelected = (item: UnifiedResultItem) => {
  setPartNumberForAdd(item.id); // 'id' is the part number in both sources
  setAddItemStage("adding_to_inventory");
};
```

### Phase 4: Update Parent Component

**File:** `src/components/inventory/AddInventoryItemButton.tsx`

**Changes:**

1. **Replace CameraCapture with SearchOrCaptureDialog:**

```typescript
import { SearchOrCaptureDialog } from "./SearchOrCaptureDialog";

// In JSX:
<SearchOrCaptureDialog
  open={addItemStage === "capturing"}
  onOpenChange={(open) => {
    if (!open) setAddItemStage("idle");
  }}
  onResults={handleIdentificationComplete}
  onError={(error) => {
    console.error("Search/capture error:", error);
    setAddItemStage("idle");
  }}
/>
```

### Phase 5: UI/UX Polish

**Tab Persistence (CRITICAL):**

1. **localStorage Integration:**
   - Use `useLocalStorage("inventory-add-method", "camera")` hook
   - Remembers user's last-used tab (camera or search)
   - Seamless experience across sessions
   - Automatically syncs across browser tabs

**Search Tab Improvements:**

1. **Debounced Search:**

   - Auto-search after 300ms of typing (like catalog page)
   - Show loading spinner during search
   - Display result count

2. **Empty States:**

   - "Start typing to search for parts" (no input)
   - "No results found. Try a different search term." (no matches)
   - Loading skeleton during search

3. **Visual Feedback:**
   - Disable part number when part name has text (and vice versa)
   - Clear button for each input field
   - Optional: "Recent searches" if storing search history

**Retake Button Updates:**

```typescript
<Button variant="outline" onClick={onRetake} className="w-full" size="lg">
  {results.source === "camera" ? (
    <>
      <Camera className="h-4 w-4 mr-2" />
      Retake Photo
    </>
  ) : (
    <>
      <Search className="h-4 w-4 mr-2" />
      Search Again
    </>
  )}
</Button>
```

## File Structure Summary

### New Files

- `src/components/inventory/SearchOrCaptureDialog.tsx` (replaces `CameraCapture.tsx` functionality)

### Modified Files

- `src/components/inventory/AddInventoryItemButton.tsx` - Update import and component usage
- `src/components/inventory/IdentificationResultsList.tsx` - Handle both result types
- `src/hooks/useAddItemWorkflow.ts` - Update types and handlers

### Optional: Keep or Remove

- `src/components/inventory/CameraCapture.tsx` - Can be removed after migration OR kept if used elsewhere

## Testing Checklist

### Unit/Component Tests

**SearchOrCaptureDialog:**

- [ ] Camera tab renders and initializes camera
- [ ] Search tab renders input fields
- [ ] Tab switching works correctly (UI and state)
- [ ] **localStorage persistence:** Last-used tab is saved and restored on mount
- [ ] **localStorage sync:** Tab changes in one browser tab sync to others
- [ ] Part name/number inputs are mutually exclusive
- [ ] Camera capture flow works (upload, identify, transform results)
- [ ] Catalog search flow works (search, transform results)
- [ ] Error handling for camera permissions
- [ ] Error handling for search failures
- [ ] Default to camera tab when localStorage is empty/first use

**IdentificationResultsList:**

- [ ] Displays camera results with confidence badges
- [ ] Displays search results without confidence badges
- [ ] Shows correct header text for each source
- [ ] "Retake"/"Search Again" button shows correct icon and text
- [ ] Selecting a result calls onSelectResult with correct data

**useAddItemWorkflow:**

- [ ] State transitions work for both paths
- [ ] Camera results stored correctly
- [ ] Search results stored correctly
- [ ] Selected part number passed to inventory dialog

### E2E Tests

- [ ] Full camera flow: Open → Capture → View results → Select → Add to inventory
- [ ] Full search flow (part name): Open → Type name → View results → Select → Add to inventory
- [ ] Full search flow (part number): Open → Type ID → View results → Select → Add to inventory
- [ ] Switch between tabs before committing to a search
- [ ] **localStorage persistence:** Use search tab → close dialog → reopen → verify search tab is active
- [ ] **localStorage persistence:** Use camera tab → close dialog → reopen → verify camera tab is active
- [ ] **First time user:** Clear localStorage → open dialog → verify camera tab is default
- [ ] Close dialog at each stage
- [ ] Retake/Search again functionality
- [ ] Error states for both paths

## Edge Cases & Error Handling

### Camera Tab

- Camera permissions denied
- No camera available on device
- Upload failure
- Brickognize API error
- No parts identified

### Search Tab

- Empty search (no input)
- No results found
- Network error during search
- Slow search response (loading state)

### Results List

- Empty results (should show appropriate message)
- Missing part images (fallback UI)
- Very long part names (truncation)

## Backend Considerations

### Existing API

- `api.catalog.queries.searchParts` - Already supports partTitle and partId search
- No backend changes needed for this feature

### Future Enhancements (Optional)

- Track which search method users prefer (camera vs text)
- Log unsuccessful camera identifications for improvement
- Cache recent search results client-side

## Migration Strategy

### Phase 1: Build New Component

1. Create `SearchOrCaptureDialog.tsx` with both tabs
2. Implement camera tab (copy from `CameraCapture.tsx`)
3. Implement search tab (new)
4. Add result transformation logic

### Phase 2: Update Consuming Components

1. Update `IdentificationResultsList.tsx` to handle both sources
2. Update `useAddItemWorkflow.ts` types
3. Update `AddInventoryItemButton.tsx` to use new component

### Phase 3: Test & Deploy

1. Add comprehensive tests
2. QA testing of both flows
3. Deploy to staging
4. User acceptance testing
5. Deploy to production

### Phase 4: Cleanup

1. Remove `CameraCapture.tsx` if not used elsewhere
2. Update any documentation
3. Remove old imports/references

## Success Metrics

After implementation, measure:

- % of users who use camera vs search
- Average time to add item (camera vs search)
- Success rate of camera identification
- Search result click-through rates
- User feedback on new flow

## Known Limitations

1. **Search result count:** Initial implementation shows top 10 results (can paginate if needed)
2. **No "refine search" in results:** User must go back to search tab (acceptable for v1)
3. **Category names:** Catalog results may not include full category names (could be enhanced)
4. **Offline behavior:** Search requires network (camera upload already does)

## Future Enhancements

1. **Combined results:** Allow users to take a photo AND do text search, merge results
2. **Search filters:** Add color, category filters in search tab
3. **Barcode scanning:** Add barcode/QR code scanning alongside camera
4. **Recent/favorite parts:** Quick access to commonly added parts
5. **Batch add:** Select multiple results to add at once
6. **Smart suggestions:** Show similar parts based on recent additions

## Dependencies

### npm Packages (already installed)

- `convex` - Database queries
- `@radix-ui/react-tabs` - Tabs component (via shadcn/ui)
- `lucide-react` - Icons (Camera, Search icons)
- `next/image` - Image optimization
- `react-hook-form` - Form management (inventory dialog)

### UI Components (shadcn/ui - already installed)

- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` - Tab navigation
- `Sheet`, `SheetContent`, `SheetTitle`, `SheetDescription` - Bottom sheet dialogs
- `Button` - Action buttons
- `Input` - Search input fields
- `Badge` - Confidence/source indicators
- `Card`, `CardContent` - Result cards

### Convex Queries Used

- `api.catalog.queries.searchParts` - Catalog search
- `api.identify.actions.identifyPartFromImage` (via PartIdentificationService)

### Internal Hooks

- `useLocalStorage` from `@/hooks/use-local-storage` - Persist tab preference across sessions
- `useAddItemWorkflow` from `@/hooks/useAddItemWorkflow` - Manage add item state machine

### Internal Services

- `PartIdentificationService` - Brickognize integration
- Convex storage - Image uploads

## Rollback Plan

If issues arise after deployment:

1. **Quick rollback:** Revert `AddInventoryItemButton.tsx` to use old `CameraCapture.tsx`
2. **Partial rollback:** Disable search tab, keep camera-only mode
3. **Feature flag:** Add environment variable to toggle new vs old flow

## Questions for Product/Design

1. Should we allow BOTH camera AND search in the same session (merge results)?
2. Do we want to track which method users prefer for analytics?
3. Should search results be paginated or limited to top N?
4. Do we need "sort by" options in search results?
5. Should we show "suggested parts" based on user's inventory history?

## Conclusion

This implementation provides a unified entry point for adding inventory items via camera OR text search, maintaining the existing flow while adding powerful text-based search capabilities. The approach reuses existing components and APIs where possible, minimizing backend changes while significantly improving user experience.

**Estimated Effort:**

- New component creation: 8-12 hours
- Component updates: 4-6 hours
- Testing: 6-8 hours
- QA and refinement: 4-6 hours
- **Total: 22-32 hours (3-4 days)**
