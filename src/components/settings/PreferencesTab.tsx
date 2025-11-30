import { Switch } from "@/components/ui/switch";

interface PreferencesTabProps {
  useSortLocations: boolean;
  isUpdatingPreferences: boolean;
  onSortLocationsToggle: (checked: boolean) => void;
}

export function PreferencesTab({
  useSortLocations,
  isUpdatingPreferences,
  onSortLocationsToggle,
}: PreferencesTabProps) {
  return (
    <section className="rounded-lg border bg-background p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Catalog Preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize how you search and view your catalog
        </p>
      </div>

      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex-1">
            <label
              htmlFor="use-sort-locations"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Enable Sort Locations
            </label>
            <p className="text-sm text-muted-foreground mt-1.5">
              Show location-based search in the catalog. When enabled, you can search parts by their
              physical storage location.
            </p>
          </div>
          <Switch
            id="use-sort-locations"
            checked={useSortLocations}
            onCheckedChange={onSortLocationsToggle}
            disabled={isUpdatingPreferences}
            className="ml-4"
          />
        </div>
      </div>
    </section>
  );
}
