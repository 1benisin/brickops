# User Setting: Toggle Store Locations - Refactoring Plan

## Executive Summary

Add a user-level preference to enable/disable the store location functionality. When disabled, the "By Location" search field will be hidden from the catalog search bar and any other location-based search interfaces.

## Current State Analysis

### Existing Implementation

**Store Location Feature:**

- **Search by Location:** Users can search catalog parts by their assigned location (e.g., "A-99" or "2456")
- **Location Field:** Displayed in `CatalogSearchBar` component as one of three mutually exclusive search modes
- **Backend:** `api.catalog.queries.searchParts` supports `sortLocation` parameter via overlay lookup
- **Search State:** Managed by `useSearchStore` (Zustand store) with location as one of three search modes

**User Settings Infrastructure:**

- **Settings Page:** `src/app/(authenticated)/settings/page.tsx` - Contains profile, marketplace credentials, and user management
- **User Schema:** `convex/users/schema.ts` - Defines user table structure
- **User Mutations:** `convex/users/mutations.ts` - Contains `updateProfile` mutation
- **User Queries:** `convex/users/queries.ts` - Fetches current user and auth state

### Problem Statement

Some users may not use the store location feature (e.g., they don't assign physical locations to their parts). The location search field clutters the UI for these users. We need a way for users to hide this field based on their preference.

---

## Proposed Solution

### High-Level Changes

1. **Add User Preference Field** - Extend user schema to include `useStoreLocations` boolean preference
2. **Add Settings UI Toggle** - Add a switch in the settings page under a new "Catalog Preferences" section
3. **Conditional Rendering** - Modify `CatalogSearchBar` to conditionally render location field based on user preference
4. **Update Search Store** - Ensure location search is cleared when preference is disabled
5. **Backend Compatibility** - Ensure backend query handles missing location parameter gracefully (already does)

---

## Detailed Implementation Plan

### Phase 1: Backend Schema & Mutations

#### 1.1 Update User Schema

**File:** `convex/users/schema.ts`

**Changes:**
Add new optional field to the `users` table definition:

```typescript
users: defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),

  businessAccountId: v.optional(v.id("businessAccounts")),
  role: v.union(v.literal("owner"), v.literal("manager"), v.literal("picker"), v.literal("viewer")),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),

  // NEW: User preferences
  useSortLocations: v.optional(v.boolean()), // Default: false (disabled)

  createdAt: v.number(),
  updatedAt: v.number(),
  status: v.union(v.literal("active"), v.literal("invited")),
});
```

**Notes:**

- Field is optional for backward compatibility
- Default behavior (when undefined): locations disabled (opt-in feature)
- Explicit `true` enables the feature, `false` or `undefined` keeps it disabled

#### 1.2 Create Update Preferences Mutation

**File:** `convex/users/mutations.ts`

**New Mutation:**

```typescript
export const updatePreferences = mutation({
  args: {
    useSortLocations: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireActiveUser(ctx);

    // Build the update object with only provided fields
    const updates: Partial<{
      useSortLocations: boolean;
      updatedAt: number;
    }> = {
      updatedAt: Date.now(),
    };

    if (args.useSortLocations !== undefined) {
      updates.useSortLocations = args.useSortLocations;
    }

    await ctx.db.patch(userId, updates);
  },
});
```

**Rationale:**

- Separate from `updateProfile` to keep concerns separated
- Extensible for future preference additions
- Validates user is authenticated via `requireActiveUser`
- Updates `updatedAt` timestamp for audit trail

#### 1.3 Update getCurrentUser Query (Optional)

**File:** `convex/users/queries.ts`

**Verification:**
Ensure `getCurrentUser` returns the new `useStoreLocations` field. The query should already return all user fields, but verify the return type includes preferences:

```typescript
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { user: null, businessAccount: null };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email ?? ""))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!user) {
      return { user: null, businessAccount: null };
    }

    const businessAccount = user.businessAccountId
      ? await ctx.db.get(user.businessAccountId)
      : null;

    return { user, businessAccount }; // Already returns full user object with preferences
  },
});
```

**Action:** No changes needed if query already returns full user object.

---

### Phase 2: Settings Page UI

#### 2.1 Add Catalog Preferences Section

**File:** `src/app/(authenticated)/settings/page.tsx`

**Changes:**

1. **Add state for preference:**

```typescript
const [useSortLocations, setUseSortLocations] = useState(false);
const [isUpdatingPreferences, startPreferencesTransition] = useTransition();
```

2. **Initialize from current user:**

```typescript
useEffect(() => {
  if (currentUser?.user) {
    setFirstName(currentUser.user.firstName ?? "");
    setLastName(currentUser.user.lastName ?? "");
    // NEW: Initialize preference (default false if undefined)
    setUseSortLocations(currentUser.user.useSortLocations ?? false);
  }
}, [currentUser]);
```

3. **Add mutation hook:**

```typescript
const updatePreferences = useMutation(api.users.mutations.updatePreferences);
```

4. **Create preference handler:**

```typescript
const handleStoreLocationsToggle = (checked: boolean) => {
  setUseStoreLocations(checked);

  startPreferencesTransition(async () => {
    try {
      await updatePreferences({ useStoreLocations: checked });
      // Optional: Show success toast
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update preferences";
      console.error(message);
      // Revert on error
      setUseStoreLocations(!checked);
    }
  });
};
```

5. **Add UI section (after Profile section, before Marketplace Integrations):**

```tsx
{
  /* Catalog Preferences Section */
}
<section className="space-y-4 rounded-lg border border-border bg-card p-6">
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-lg font-semibold">Catalog Preferences</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Customize how you search and view your catalog
      </p>
    </div>
  </div>

  <div className="space-y-4 pt-4">
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex-1">
        <label
          htmlFor="use-store-locations"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Enable Store Locations
        </label>
        <p className="text-sm text-muted-foreground mt-1.5">
          Show location-based search in the catalog. When enabled, you can search parts by their
          physical storage location.
        </p>
      </div>
      <Switch
        id="use-store-locations"
        checked={useStoreLocations}
        onCheckedChange={handleStoreLocationsToggle}
        disabled={isUpdatingPreferences}
        className="ml-4"
      />
    </div>
  </div>
</section>;
```

**Design Notes:**

- Placed between Profile and Marketplace sections (logical grouping)
- Uses existing Switch component from shadcn/ui
- Provides clear label and description
- Disables switch during update to prevent race conditions
- Reverts on error for consistent state

---

### Phase 3: Catalog Search Bar Updates

#### 3.1 Update CatalogSearchBar Component

**File:** `src/components/catalog/CatalogSearchBar.tsx`

**Changes:**

1. **Add new prop:**

```typescript
export type CatalogSearchBarProps = {
  sortLocation: string;
  partTitle: string;
  partId: string;
  onSortLocationChange: (value: string) => void;
  onPartTitleChange: (value: string) => void;
  onPartIdChange: (value: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  isLoading?: boolean;
  showLocationSearch?: boolean; // NEW: Control location field visibility
};
```

2. **Destructure new prop with default:**

```typescript
export function CatalogSearchBar({
  sortLocation,
  partTitle,
  partId,
  onSortLocationChange,
  onPartTitleChange,
  onPartIdChange,
  onSubmit,
  onClear,
  isLoading: _isLoading = false,
  showLocationSearch = false, // NEW: Default to false (opt-in feature)
}: CatalogSearchBarProps) {
```

3. **Update grid layout logic:**

```typescript
// Conditional grid columns based on location visibility
const gridColsClass = showLocationSearch ? "sm:grid-cols-12" : "sm:grid-cols-10";
```

4. **Update field column spans:**

```typescript
<div className={`flex flex-col gap-3 sm:grid ${gridColsClass} sm:gap-3`}>
  {/* Part Name - Adjust span when location hidden */}
  <div className={`flex flex-col gap-1 ${showLocationSearch ? "sm:col-span-6" : "sm:col-span-7"}`}>
    <label htmlFor="catalog-search-title" className="text-xs font-medium text-muted-foreground">
      By Part Name
    </label>
    <Input
      id="catalog-search-title"
      data-testid="catalog-search-title"
      placeholder="brick 2 x 2, slope, plate..."
      className={`w-full ${activeField && activeField !== "title" ? "opacity-50" : ""}`}
      disabled={activeField !== null && activeField !== "title"}
      value={localPartTitle}
      onChange={(event) => setLocalPartTitle(event.target.value)}
    />
  </div>

  {/* Part ID - No change needed */}
  <div className="flex flex-col gap-1 sm:col-span-3">
    <label htmlFor="catalog-search-id" className="text-xs font-medium text-muted-foreground">
      By Part Id
    </label>
    <Input
      id="catalog-search-id"
      data-testid="catalog-search-id"
      placeholder="e.g. 3001"
      className={`w-full ${activeField && activeField !== "id" ? "opacity-50" : ""}`}
      disabled={activeField !== null && activeField !== "id"}
      value={localPartId}
      onChange={(event) => setLocalPartId(event.target.value)}
    />
  </div>

  {/* Location - Conditionally rendered */}
  {showLocationSearch && (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <label htmlFor="catalog-search-location" className="text-xs font-medium text-muted-foreground">
        By Location
      </label>
      <Input
        id="catalog-search-location"
        data-testid="catalog-search-location"
        placeholder="e.g. A-99 or 2456"
        className={`w-full ${activeField && activeField !== "location" ? "opacity-50" : ""}`}
        disabled={activeField !== null && activeField !== "location"}
        value={localSortLocation}
        onChange={(event) => setLocalSortLocation(event.target.value)}
      />
    </div>
  )}

  {/* Clear button - No change needed */}
  <div className="flex items-end justify-end sm:col-span-1">
    <Button
      type="button"
      variant="ghost"
      onClick={handleClear}
      data-testid="catalog-search-clear"
    >
      Clear
    </Button>
  </div>
</div>
```

**Rationale:**

- `showLocationSearch` prop provides explicit control over visibility
- Default `true` maintains backward compatibility
- Adjusts grid layout when location is hidden to use space efficiently
- Part Name field gets extra column span when location is hidden

#### 3.2 Update Catalog Page

**File:** `src/app/(authenticated)/catalog/page.tsx`

**Changes:**

1. **Import types:**

```typescript
// Ensure proper import
import type { Id } from "@/convex/_generated/dataModel";
```

2. **Pass user preference to search bar:**

```tsx
<CatalogSearchBar
  sortLocation={sortLocation}
  partTitle={partTitle}
  partId={partId}
  onSortLocationChange={setSortLocation}
  onPartTitleChange={setPartTitle}
  onPartIdChange={setPartId}
  onClear={resetFilters}
  onSubmit={() => {}}
  isLoading={searchLoading}
  showLocationSearch={currentUser?.user?.useSortLocations ?? false} // NEW
/>
```

3. **Clear location when preference is disabled:**

```typescript
// Add effect to clear location when preference changes
useEffect(() => {
  const useLocations = currentUser?.user?.useSortLocations ?? false;
  if (!useLocations && sortLocation) {
    // User disabled locations but has active location search - clear it
    setSortLocation("");
  }
}, [currentUser?.user?.useSortLocations, sortLocation, setSortLocation]);
```

**Rationale:**

- Reads preference from current user query
- Defaults to `false` if undefined (opt-in feature)
- Automatically clears location search when preference is disabled
- Prevents stale location searches when toggling preference

---

### Phase 4: Search State Management

#### 4.1 Update Search Store (Optional Enhancement)

**File:** `src/hooks/useSearchStore.ts`

**Optional Enhancement:**
Currently, the search store is client-side only and doesn't need modification. However, for consistency, you could add a method to validate state:

```typescript
export const useSearchStore = create<SearchState>()((set, _get) => ({
  ...DEFAULT_STATE,

  // ... existing methods ...

  // NEW: Optional method to clear location if user preference changes
  clearLocationIfDisabled: (useStoreLocations: boolean) => {
    if (!useStoreLocations && _get().sortLocation) {
      set({ sortLocation: "", page: 1 });
    }
  },
}));
```

**Decision:** This is optional and may be over-engineering. The effect in Phase 3.2 handles this adequately.

---

### Phase 5: Additional UI Locations (Future-Proofing)

#### 5.1 SearchOrCaptureDialog (If implementing catalog search plan)

**File:** `src/components/inventory/SearchOrCaptureDialog.tsx` (from catalog-search-in-add-inventory-flow-plan.md)

**Changes:**
If the SearchOrCaptureDialog is implemented per the other plan, ensure it also respects the user preference:

```tsx
// Inside SearchTab component
const currentUser = useQuery(api.users.queries.getCurrentUser);
const showLocationSearch = currentUser?.user?.useSortLocations ?? false;

// Conditionally render location input
{
  showLocationSearch && (
    <div className="flex flex-col gap-1">
      <label htmlFor="search-location" className="text-xs font-medium text-muted-foreground">
        By Location
      </label>
      <Input
        id="search-location"
        placeholder="e.g. A-99"
        disabled={partName || partNumber}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
    </div>
  );
}
```

**Note:** Only implement this if the SearchOrCaptureDialog plan is being executed.

#### 5.2 Other Future Search Interfaces

**Locations to Check:**

- Any component that uses `api.catalog.queries.searchParts` with `sortLocation`
- Any UI that allows users to filter/search by location
- Inventory management screens with location-based features

**Strategy:**

1. Search codebase for `sortLocation` usage
2. Add conditional rendering based on `currentUser?.user?.useStoreLocations`
3. Maintain consistent UX across all location-based features

---

## Migration & Backward Compatibility

### Existing Users

**Schema Migration:**

- New field `useSortLocations` is optional
- Existing users have `undefined` value
- Frontend treats `undefined` as `false` (disabled)
- **Result:** Existing users will not see sort location field until they enable it

**Data Migration:**
Not required. The optional field with default logic handles the new default behavior.

### Default Behavior

**New Users:**

- No default value set during signup/invite
- Field remains `undefined` initially
- Treated as `false` (locations disabled)
- User can enable preference at any time in Settings

**Philosophy:** Opt-in model - feature is hidden by default, users can enable if needed. This reduces UI clutter for users who don't use physical sort locations.

---

## Testing Requirements

### Unit Tests

#### Backend Tests

**File:** `__tests__/backend/users-preferences.test.ts` (new file)

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

describe("User Preferences", () => {
  let t: ConvexTestingHelper;

  beforeEach(async () => {
    t = convexTest(schema);
    // Setup: Create test user and business account
  });

  test("updatePreferences - sets useSortLocations to true", async () => {
    // Create authenticated context
    const asUser = t.withIdentity({ subject: "test-user", email: "test@example.com" });

    // Update preference
    await asUser.mutation(api.users.mutations.updatePreferences, {
      useSortLocations: true,
    });

    // Verify
    const result = await asUser.query(api.users.queries.getCurrentUser);
    expect(result.user?.useSortLocations).toBe(true);
  });

  test("updatePreferences - sets useSortLocations to false", async () => {
    const asUser = t.withIdentity({ subject: "test-user", email: "test@example.com" });

    await asUser.mutation(api.users.mutations.updatePreferences, {
      useSortLocations: false,
    });

    const result = await asUser.query(api.users.queries.getCurrentUser);
    expect(result.user?.useSortLocations).toBe(false);
  });

  test("updatePreferences - requires authentication", async () => {
    await expect(
      t.mutation(api.users.mutations.updatePreferences, {
        useSortLocations: false,
      }),
    ).rejects.toThrow();
  });

  test("getCurrentUser - returns undefined useSortLocations for legacy users", async () => {
    // Create user without preference set (legacy behavior)
    const asUser = t.withIdentity({ subject: "legacy-user", email: "legacy@example.com" });

    const result = await asUser.query(api.users.queries.getCurrentUser);
    expect(result.user?.useSortLocations).toBeUndefined();
  });
});
```

#### Frontend Component Tests

**File:** `__tests__/frontend/components/catalog/CatalogSearchBar.test.tsx`

```typescript
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogSearchBar } from "@/components/catalog/CatalogSearchBar";

describe("CatalogSearchBar - Store Locations Toggle", () => {
  const mockProps = {
    sortLocation: "",
    partTitle: "",
    partId: "",
    onSortLocationChange: vi.fn(),
    onPartTitleChange: vi.fn(),
    onPartIdChange: vi.fn(),
  };

  test("renders location field when showLocationSearch is true", () => {
    render(<CatalogSearchBar {...mockProps} showLocationSearch={true} />);
    expect(screen.getByTestId("catalog-search-location")).toBeInTheDocument();
  });

  test("hides location field when showLocationSearch is false", () => {
    render(<CatalogSearchBar {...mockProps} showLocationSearch={false} />);
    expect(screen.queryByTestId("catalog-search-location")).not.toBeInTheDocument();
  });

  test("hides location field by default (opt-in feature)", () => {
    render(<CatalogSearchBar {...mockProps} />);
    expect(screen.queryByTestId("catalog-search-location")).not.toBeInTheDocument();
  });

  test("part name field uses more space when location is hidden", () => {
    const { container } = render(<CatalogSearchBar {...mockProps} showLocationSearch={false} />);
    const partNameField = screen.getByTestId("catalog-search-title").closest("div.flex");
    expect(partNameField).toHaveClass("sm:col-span-7");
  });

  test("part name field uses normal space when location is shown", () => {
    const { container } = render(<CatalogSearchBar {...mockProps} showLocationSearch={true} />);
    const partNameField = screen.getByTestId("catalog-search-title").closest("div.flex");
    expect(partNameField).toHaveClass("sm:col-span-6");
  });
});
```

**File:** `__tests__/frontend/settings/catalog-preferences.test.tsx` (new file)

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/(authenticated)/settings/page";
import { useQuery, useMutation } from "convex/react";

vi.mock("convex/react");

describe("Settings Page - Catalog Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders catalog preferences section", () => {
    vi.mocked(useQuery).mockReturnValue({
      user: { useStoreLocations: true },
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn());

    render(<SettingsPage />);

    expect(screen.getByText("Catalog Preferences")).toBeInTheDocument();
    expect(screen.getByText("Enable Store Locations")).toBeInTheDocument();
  });

  test("switch reflects current user preference (enabled)", () => {
    vi.mocked(useQuery).mockReturnValue({
      user: { useSortLocations: true },
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn());

    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: /enable sort locations/i });
    expect(toggle).toBeChecked();
  });

  test("switch reflects current user preference (disabled)", () => {
    vi.mocked(useQuery).mockReturnValue({
      user: { useSortLocations: false },
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn());

    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: /enable sort locations/i });
    expect(toggle).not.toBeChecked();
  });

  test("toggling switch calls updatePreferences mutation", async () => {
    const mockMutation = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      user: { useSortLocations: false },
    });
    vi.mocked(useMutation).mockReturnValue(mockMutation);

    const user = userEvent.setup();
    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: /enable sort locations/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(mockMutation).toHaveBeenCalledWith({ useSortLocations: true });
    });
  });

  test("defaults to disabled when preference is undefined (opt-in feature)", () => {
    vi.mocked(useQuery).mockReturnValue({
      user: { useSortLocations: undefined },
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn());

    render(<SettingsPage />);

    const toggle = screen.getByRole("switch", { name: /enable sort locations/i });
    expect(toggle).not.toBeChecked();
  });
});
```

### E2E Tests

**File:** `__tests__/e2e/catalog-preferences.spec.ts` (new file)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Catalog Preferences - Store Locations Toggle", () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to settings
    await page.goto("/settings");
  });

  test("can toggle store locations preference on", async ({ page }) => {
    // Find and toggle switch
    const toggle = page.locator("#use-store-locations");
    await toggle.check();

    // Verify catalog page respects preference
    await page.goto("/catalog");
    await expect(page.getByTestId("catalog-search-location")).toBeVisible();
  });

  test("can toggle store locations preference off", async ({ page }) => {
    const toggle = page.locator("#use-store-locations");
    await toggle.uncheck();

    // Verify catalog page hides location field
    await page.goto("/catalog");
    await expect(page.getByTestId("catalog-search-location")).not.toBeVisible();
  });

  test("location search is cleared when preference is disabled", async ({ page }) => {
    // Navigate to catalog and perform location search
    await page.goto("/catalog");
    await page.getByTestId("catalog-search-location").fill("A-99");
    await page.waitForTimeout(500); // Wait for debounce

    // Verify search is active
    await expect(page.getByTestId("catalog-search-location")).toHaveValue("A-99");

    // Go to settings and disable locations
    await page.goto("/settings");
    await page.locator("#use-store-locations").uncheck();

    // Return to catalog and verify location search is cleared
    await page.goto("/catalog");
    await expect(page.queryByTestId("catalog-search-location")).not.toBeVisible();
  });

  test("preference persists across sessions", async ({ page, context }) => {
    // Disable locations
    await page.goto("/settings");
    await page.locator("#use-store-locations").uncheck();

    // Create new page (simulate new session)
    const newPage = await context.newPage();
    await newPage.goto("/catalog");

    // Verify preference is still applied
    await expect(newPage.getByTestId("catalog-search-location")).not.toBeVisible();
  });
});
```

### Manual Testing Checklist

- [ ] **Settings Page:**

  - [ ] Toggle switch appears in Catalog Preferences section
  - [ ] Toggle reflects current user preference (on first load)
  - [ ] Clicking toggle updates preference in database
  - [ ] Switch is disabled during mutation (loading state)
  - [ ] Toggle works for legacy users (undefined → true by default)

- [ ] **Catalog Page:**

  - [ ] Location field visible when preference enabled
  - [ ] Location field hidden when preference disabled
  - [ ] Part Name field expands to fill space when location hidden
  - [ ] Active location search is cleared when preference disabled
  - [ ] Search works correctly with 2 fields (name + ID) when location hidden
  - [ ] Mutual exclusivity still works between Part Name and Part ID

- [ ] **Backend:**

  - [ ] `updatePreferences` mutation updates user record
  - [ ] `updatedAt` timestamp is updated
  - [ ] Unauthorized users cannot update preferences
  - [ ] Backend query works without location parameter

- [ ] **Cross-Browser:**
  - [ ] Chrome/Edge - All features work
  - [ ] Firefox - All features work
  - [ ] Safari - All features work
  - [ ] Mobile Safari - Touch interactions work

---

## Performance Considerations

### Query Optimization

**Current User Query:**

- Already fetched on every authenticated page
- No additional query overhead
- Preference data is part of existing user object

**Settings Page:**

- Single mutation per preference change
- Optimistic UI update (immediate feedback)
- Error handling reverts state

**Catalog Page:**

- No performance impact
- Conditional rendering is client-side only
- Search query unchanged (backend already handles optional location)

### Recommendations

1. **No caching needed** - User preference is part of existing user query
2. **No indexes needed** - No querying by preference value
3. **Minimal bundle impact** - Adding one boolean prop and conditional render

---

## Edge Cases & Error Handling

### Edge Cases

1. **Legacy users (useSortLocations = undefined):**

   - **Handling:** Treated as `false` via `?? false` operators
   - **UX:** Sort location field will be hidden by default, users can enable in settings

2. **User disables locations while actively searching by location:**

   - **Handling:** `useEffect` in catalog page clears location search
   - **UX:** Location filter removed, search falls back to empty state

3. **Multiple tabs open when preference changes:**

   - **Handling:** Each tab queries `getCurrentUser` independently
   - **UX:** May require refresh (acceptable - rare scenario)
   - **Enhancement:** Could add real-time sync via Convex subscriptions (overkill)

4. **User toggles preference rapidly:**

   - **Handling:** Transition state disables switch during mutation
   - **UX:** Prevents race conditions and double-updates

5. **Network failure during preference update:**
   - **Handling:** Catch error, revert UI state, log error
   - **UX:** Switch returns to previous state, user can retry

### Error Scenarios

**Mutation Errors:**

```typescript
try {
  await updatePreferences({ useSortLocations: checked });
} catch (error) {
  // Revert UI
  setUseSortLocations(!checked);
  // Log error
  console.error("Failed to update preference:", error);
  // Optional: Show toast notification
}
```

**Query Errors:**

- If `getCurrentUser` fails, default to `false` (safe fallback - hide feature)
- Location field is hidden by default if preference cannot be determined

---

## Rollback Plan

### Quick Rollback

If issues arise after deployment, rollback is straightforward:

1. **Revert Settings Page:**

   - Comment out Catalog Preferences section
   - Users cannot change preference

2. **Revert CatalogSearchBar:**

   - Remove `showLocationSearch` prop
   - Location field always visible (original behavior)

3. **Database:**
   - No migration needed to rollback
   - New field can remain in schema (ignored if not used)

### Partial Rollback

**Option 1: Hide Settings UI Only**

- Keep backend mutation
- Remove settings UI toggle
- Keep conditional rendering in catalog

**Result:** Feature becomes "hidden" but functional for testing

**Option 2: Keep Settings, Remove Conditional Rendering**

- Keep settings UI
- Remove conditional logic from CatalogSearchBar
- Location field always visible

**Result:** Users can toggle preference but it has no effect (useful for A/B testing)

---

## Future Enhancements

### Short-Term

1. **Settings Export/Import:**

   - Allow users to export all preferences as JSON
   - Useful for multi-device setups or troubleshooting

2. **Default Business Preferences:**

   - Business owners can set default for all new users
   - Stored in `businessAccounts` table
   - Individual users can override

3. **More Granular Preferences:**
   - `useCategoryFilter: boolean`
   - `useColorFilter: boolean`
   - `defaultPageSize: number`
   - `defaultSortOrder: "name" | "id" | "category"`

### Long-Term

1. **Preference Profiles:**

   - "Picker Profile" - minimal search, focus on location
   - "Manager Profile" - all features enabled
   - "Viewer Profile" - read-only optimizations

2. **Analytics:**

   - Track which features are most/least used
   - Inform future default settings
   - Identify candidates for removal

3. **Contextual Preferences:**
   - Different settings for different pages
   - Per-inventory-file preferences
   - Temporary "focus mode" toggles

---

## Documentation Updates

### User-Facing Documentation

**Location:** `docs/user-guide.md` (create if doesn't exist)

```markdown
## Catalog Preferences

### Store Locations

If you don't use physical storage locations for your parts, you can hide the location search field from the catalog.

**To disable store locations:**

1. Go to **Settings**
2. Scroll to **Catalog Preferences**
3. Toggle **Enable Store Locations** off

The location search field will be hidden from the catalog search bar. You can re-enable it at any time.

**Note:** Disabling this preference only affects the search interface. Any existing location data in your inventory is preserved.
```

### Developer Documentation

**Location:** `docs/architecture/data-models.md`

Add to User Preferences section:

````markdown
### User Preferences

User preferences are stored directly on the `users` table for simplicity.

**Fields:**

- `useSortLocations: boolean | undefined` - Controls visibility of sort location features
  - `true`: Sort location search visible
  - `false` or `undefined`: Sort location search hidden (default)

**Usage Example:**

```typescript
const currentUser = useQuery(api.users.queries.getCurrentUser);
const showLocations = currentUser?.user?.useSortLocations ?? false;

<CatalogSearchBar showLocationSearch={showLocations} />
```
````

```

---

## File Change Summary

### New Files

1. `__tests__/backend/users-preferences.test.ts` - Backend preference tests
2. `__tests__/frontend/settings/catalog-preferences.test.tsx` - Settings UI tests
3. `__tests__/e2e/catalog-preferences.spec.ts` - E2E preference tests

### Modified Files

1. **Backend:**
   - `convex/users/schema.ts` - Add `useStoreLocations` field
   - `convex/users/mutations.ts` - Add `updatePreferences` mutation

2. **Frontend:**
   - `src/app/(authenticated)/settings/page.tsx` - Add Catalog Preferences UI
   - `src/components/catalog/CatalogSearchBar.tsx` - Add conditional rendering
   - `src/app/(authenticated)/catalog/page.tsx` - Pass preference to search bar

3. **Documentation:**
   - `docs/user-guide.md` - Add user-facing preference documentation
   - `docs/architecture/data-models.md` - Add developer documentation

---

## Implementation Timeline

### Phase 1: Backend (2-3 hours)
- [ ] Update user schema
- [ ] Create `updatePreferences` mutation
- [ ] Write backend unit tests
- [ ] Verify query returns new field

### Phase 2: Settings UI (3-4 hours)
- [ ] Add Catalog Preferences section
- [ ] Add toggle switch
- [ ] Wire up mutation
- [ ] Add loading and error states
- [ ] Write component tests

### Phase 3: Catalog Updates (2-3 hours)
- [ ] Update `CatalogSearchBar` component
- [ ] Add conditional rendering
- [ ] Update grid layout
- [ ] Pass preference from catalog page
- [ ] Add effect to clear location on disable
- [ ] Write component tests

### Phase 4: Testing & QA (4-6 hours)
- [ ] Run all unit tests
- [ ] Write and run E2E tests
- [ ] Manual testing (all browsers)
- [ ] Edge case testing
- [ ] Performance verification

### Phase 5: Documentation (1-2 hours)
- [ ] Update user documentation
- [ ] Update developer documentation
- [ ] Add code comments

**Total Estimated Time: 12-18 hours (1.5-2 days)**

---

## Success Criteria

The refactoring is complete when:

1. ✅ Users can toggle "Enable Store Locations" in settings
2. ✅ Toggle state persists across sessions
3. ✅ Catalog search bar hides/shows location field based on preference
4. ✅ Part Name field expands when location is hidden
5. ✅ Active location searches are cleared when preference is disabled
6. ✅ All tests pass (unit, integration, E2E)
7. ✅ Legacy users (undefined preference) see no change in behavior
8. ✅ No performance regression
9. ✅ Documentation is complete
10. ✅ QA approves all manual test scenarios

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking existing searches | High | Low | Comprehensive testing, default to enabled |
| Performance degradation | Medium | Very Low | No additional queries, client-side only |
| User confusion about location disappearing | Medium | Medium | Clear setting description, can be re-enabled |
| State sync issues across tabs | Low | Medium | Acceptable - refresh resolves, could add real-time sync |
| Migration issues for existing users | High | Very Low | Optional field with safe defaults |

---

## Questions for Product/Design

1. **Default Behavior:**
   - Should new users have sort locations enabled or disabled by default?
   - Current plan: Disabled (opt-in model) - cleaner UI for users who don't use physical locations

2. **Visibility:**
   - Should this preference be in Settings or directly in the Catalog page (quick toggle)?
   - Current plan: Settings only

3. **Scope:**
   - Should this affect ONLY the search bar, or also hide location fields in other areas (e.g., Add Item dialog)?
   - Current plan: Search bar only initially

4. **Analytics:**
   - Do we want to track how many users enable locations?
   - Could inform future decisions about the feature

5. **Business-Level Control:**
   - Should business owners be able to set default location preference for all users?
   - Current plan: User-level only

---

## Conclusion

This refactoring adds a user-configurable preference to hide store location functionality from the catalog search interface. The implementation:

- **Minimally invasive** - Small schema change, opt-out model
- **Backward compatible** - Existing users see no change
- **Extensible** - Foundation for additional catalog preferences
- **Testable** - Comprehensive test coverage at all levels
- **Performant** - No additional queries or performance impact
- **Maintainable** - Clear separation of concerns, well-documented

The feature provides flexibility for users who don't use locations while maintaining full functionality for those who do.

**Estimated Development Time: 12-18 hours**
**Risk Level: Low**
**User Impact: High (for users who don't use locations)**

```
