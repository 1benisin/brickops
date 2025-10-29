"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HistoryDataTable } from "@/components/inventory/history/HistoryDataTable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryChangeHistoryPage() {
  const [changeTypeFilter, setChangeTypeFilter] = useState<"quantity" | "location" | "all">("all");
  const [partNumberFilter, setPartNumberFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 100;

  // Build query args
  const queryArgs = useMemo(
    () => ({
      changeType: changeTypeFilter !== "all" ? changeTypeFilter : undefined,
      partNumber: partNumberFilter.trim() || undefined,
      location: locationFilter.trim() || undefined,
      limit,
      offset,
    }),
    [changeTypeFilter, partNumberFilter, locationFilter, offset],
  );

  const historyData = useQuery(api.inventory.queries.getUnifiedInventoryHistory, queryArgs);
  const isLoading = historyData === undefined;

  const handleLoadMore = () => {
    setOffset((prev) => prev + limit);
  };

  const handleResetFilters = () => {
    setChangeTypeFilter("all");
    setPartNumberFilter("");
    setLocationFilter("");
    setOffset(0);
  };

  const hasMore = historyData && historyData.length === limit;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inventory Change History
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View all quantity and location changes to your inventory with comprehensive details.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter history entries by type, part number, or location
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="change-type-filter">Change Type</Label>
              <Select
                value={changeTypeFilter}
                onValueChange={(value) => {
                  setChangeTypeFilter(value as typeof changeTypeFilter);
                  setOffset(0);
                }}
              >
                <SelectTrigger id="change-type-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="quantity">Quantity Changes</SelectItem>
                  <SelectItem value="location">Location Changes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="part-number-filter">Part Number</Label>
              <Input
                id="part-number-filter"
                placeholder="Filter by part number..."
                value={partNumberFilter}
                onChange={(e) => {
                  setPartNumberFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-filter">Location</Label>
              <Input
                id="location-filter"
                placeholder="Filter by location..."
                value={locationFilter}
                onChange={(e) => {
                  setLocationFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </div>

            <div className="space-y-2 flex items-end">
              <Button variant="outline" onClick={handleResetFilters} className="w-full">
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : historyData === null || historyData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No history entries found matching your filters.
            </div>
          ) : (
            <div className="space-y-4">
              <HistoryDataTable data={historyData} />
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button onClick={handleLoadMore} variant="outline">
                    Load More
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
