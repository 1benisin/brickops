"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRelativeTime } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { ArrowLeft, Upload, ArrowUpDown, Trash2 } from "lucide-react";
import { AddInventoryItemButton } from "./AddInventoryItemButton";
import { BatchSyncDialog } from "./BatchSyncDialog";
import { useGetPartColors } from "@/hooks/useGetPartColors";
import { bestTextOn } from "@/lib/utils";

// Color badge component that properly uses hooks
function PartColorBadge({ partNumber, colorId }: { partNumber: string; colorId: string }) {
  const { data: colors } = useGetPartColors(partNumber);

  const selectedColor = colors?.find((c) => String(c.colorId) === colorId);
  if (!selectedColor) {
    return <span className="text-muted-foreground text-sm">{colorId}</span>;
  }

  const bgColor = `#${selectedColor.hexCode || "ffffff"}`;
  const { color: textColor } = bestTextOn(bgColor);

  return (
    <div
      className="inline-flex items-center rounded px-2 py-1 text-sm font-medium"
      style={{
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      {selectedColor.name || `Color ${colorId}`}
    </div>
  );
}

export interface InventoryFileDetailProps {
  fileId: Id<"inventoryFiles">;
}

type SyncStatus = "pending" | "syncing" | "synced" | "failed" | undefined;
type Condition = "new" | "used" | "all";
type SortField = "quantity" | "price" | "date";
type SortDirection = "asc" | "desc";

export function InventoryFileDetail({ fileId }: InventoryFileDetailProps) {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();

  // Filters and sorting state
  const [conditionFilter, setConditionFilter] = useState<Condition>("all");
  const [syncStatusFilter, setSyncStatusFilter] = useState<SyncStatus | "all">("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedItems, setSelectedItems] = useState<Set<Id<"inventoryItems">>>(new Set());

  // Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  // Queries
  const file = useQuery(api.inventory.files.queries.getFile, { fileId });
  const items = useQuery(api.inventory.queries.listInventoryItemsByFile, {
    fileId,
  });

  // Mutations
  const removeItemFromFile = useMutation(api.inventory.mutations.removeItemFromFile);

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    if (!items) return [];

    let filtered: Doc<"inventoryItems">[] = items;

    // Filter by condition
    if (conditionFilter !== "all") {
      filtered = filtered.filter((item) => item.condition === conditionFilter);
    }

    // Filter by sync status (match if EITHER marketplace has the status)
    if (syncStatusFilter !== "all") {
      filtered = filtered.filter(
        (item) =>
          item.bricklinkSyncStatus === syncStatusFilter ||
          item.brickowlSyncStatus === syncStatusFilter,
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "quantity":
          comparison = a.quantityAvailable - b.quantityAvailable;
          break;
        case "price":
          comparison = (a.price ?? 0) - (b.price ?? 0);
          break;
        case "date":
          comparison = a.createdAt - b.createdAt;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [items, conditionFilter, syncStatusFilter, sortField, sortDirection]);

  const handleBack = () => {
    router.push("/inventory/files");
  };

  const handleDeleteClick = () => {
    if (selectedItems.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedItems.size === 0) return;
    startTransition(async () => {
      try {
        // Remove items from file (clears fileId)
        await Promise.all(
          Array.from(selectedItems).map((itemId) => removeItemFromFile({ itemId })),
        );
        setSelectedItems(new Set());
        setDeleteDialogOpen(false);
      } catch (error) {
        console.error("Failed to remove items:", error);
      }
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(filteredAndSortedItems.map((item) => item._id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSelectItem = (itemId: Id<"inventoryItems">, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSyncStatusBadges = (bricklinkStatus?: SyncStatus, brickowlStatus?: SyncStatus) => {
    const variants = {
      pending: { variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800" },
      syncing: { variant: "default" as const, className: "bg-blue-100 text-blue-800" },
      synced: { variant: "default" as const, className: "bg-green-100 text-green-800" },
      failed: { variant: "destructive" as const, className: "bg-red-100 text-red-800" },
    };

    const badges: React.JSX.Element[] = [];

    if (bricklinkStatus) {
      const config = variants[bricklinkStatus];
      badges.push(
        <Badge
          key="bricklink"
          variant={config.variant}
          className={`${config.className} text-xs`}
          title="BrickLink sync status"
        >
          BL: {bricklinkStatus}
        </Badge>,
      );
    }

    if (brickowlStatus) {
      const config = variants[brickowlStatus];
      badges.push(
        <Badge
          key="brickowl"
          variant={config.variant}
          className={`${config.className} text-xs`}
          title="BrickOwl sync status"
        >
          BO: {brickowlStatus}
        </Badge>,
      );
    }

    if (badges.length === 0) return null;

    return <div className="flex flex-col gap-1">{badges}</div>;
  };

  const getConditionBadge = (condition: string) => {
    if (condition === "new") {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">New</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Used</Badge>;
  };

  const renderPartImage = (item: Doc<"inventoryItems">) => {
    // Get image URL from item - properly typed
    const imageUrl =
      ((item as Record<string, unknown>).image as string | undefined) ||
      ((item as Record<string, unknown>).imageUrl as string | undefined);

    return (
      <div className="flex items-center justify-center w-12 h-12 rounded bg-gray-100 flex-shrink-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.partNumber}
            width={40}
            height={40}
            className="object-contain rounded"
            priority={false}
            loading="lazy"
            onError={(e) => {
              // Fallback if image fails to load
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="text-xs text-muted-foreground">No image</div>
        )}
      </div>
    );
  };

  const formatPrice = (price: number | undefined) => {
    if (price === undefined) return "-";
    return `$${price.toFixed(2)}`;
  };

  if (!file || !items) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-muted-foreground">Loading file details...</div>
      </div>
    );
  }

  const allSelected =
    filteredAndSortedItems.length > 0 && selectedItems.size === filteredAndSortedItems.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-row sm:items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          data-testid="back-button"
          className="self-start"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
          {file.name}
        </h1>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(file.createdAt)}
        </span>
      </div>

      {/* Action bar */}
      <div className="flex flex-row justify-between gap-2">
        <Button
          data-testid="sync-to-marketplace-button"
          variant="default"
          disabled={items.length === 0}
          onClick={() => setSyncDialogOpen(true)}
          className="sm:w-auto"
        >
          <Upload className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Sync to Marketplace</span>
        </Button>
        <div className="flex flex-row gap-2">
          <Button
            data-testid="delete-from-file-button"
            variant="destructive"
            disabled={selectedItems.size === 0}
            onClick={handleDeleteClick}
            className="sm:w-auto"
          >
            <Trash2 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Delete ({selectedItems.size})</span>
          </Button>
          <AddInventoryItemButton
            fileId={fileId}
            variant="default"
            className="bg-green-600 hover:bg-green-700 sm:w-auto"
          />
        </div>
      </div>

      {/* Filters and sorting */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <Select
          value={conditionFilter}
          onValueChange={(value) => setConditionFilter(value as Condition)}
        >
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="condition-filter">
            <SelectValue placeholder="Filter by condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="used">Used</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={syncStatusFilter}
          onValueChange={(value) => setSyncStatusFilter(value as SyncStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="sync-status-filter">
            <SelectValue placeholder="Filter by sync status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="syncing">Syncing</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Items table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  data-testid="select-all-checkbox"
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all items"
                />
              </TableHead>
              <TableHead className="w-16">Image</TableHead>
              <TableHead className="min-w-[80px]">Part #</TableHead>
              <TableHead className="min-w-[120px]">Name</TableHead>
              <TableHead className="min-w-[100px]">Color</TableHead>
              <TableHead
                className="text-right cursor-pointer min-w-[100px]"
                onClick={() => toggleSort("quantity")}
              >
                <div className="flex items-center justify-end">
                  <span className="hidden sm:inline">Quantity</span>
                  <span className="sm:hidden">Qty</span>
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </div>
              </TableHead>
              <TableHead className="min-w-[100px]">Condition</TableHead>
              <TableHead
                className="text-right cursor-pointer min-w-[100px]"
                onClick={() => toggleSort("price")}
              >
                <div className="flex items-center justify-end">
                  Price
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </div>
              </TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Notes</TableHead>
              <TableHead className="hidden md:table-cell">Sync Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No items found. Add items to this file to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedItems.map((item) => (
                <TableRow key={item._id} data-testid="item-row">
                  <TableCell>
                    <Checkbox
                      data-testid={`select-item-${item._id}`}
                      checked={selectedItems.has(item._id)}
                      onCheckedChange={(checked) => handleSelectItem(item._id, checked as boolean)}
                      aria-label={`Select ${item.partNumber}`}
                    />
                  </TableCell>
                  <TableCell data-testid="item-image">{renderPartImage(item)}</TableCell>
                  <TableCell className="font-medium" data-testid="item-part-number">
                    {item.partNumber}
                  </TableCell>
                  <TableCell data-testid="item-name" className="text-sm">
                    <span
                      className="line-clamp-1"
                      title={((item as Record<string, unknown>).name as string) || ""}
                    >
                      {((item as Record<string, unknown>).name as string) || "-"}
                    </span>
                  </TableCell>
                  <TableCell data-testid="item-color">
                    <PartColorBadge partNumber={item.partNumber} colorId={item.colorId} />
                  </TableCell>
                  <TableCell className="text-right" data-testid="item-quantity">
                    {item.quantityAvailable}
                  </TableCell>
                  <TableCell data-testid="item-condition">
                    {getConditionBadge(item.condition)}
                  </TableCell>
                  <TableCell className="text-right" data-testid="item-price">
                    {formatPrice(item.price)}
                  </TableCell>
                  <TableCell data-testid="item-location" className="hidden md:table-cell">
                    {item.location}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-sm hidden lg:table-cell"
                    data-testid="item-notes"
                  >
                    {item.notes
                      ? item.notes.substring(0, 30) + (item.notes.length > 30 ? "..." : "")
                      : "-"}
                  </TableCell>
                  <TableCell data-testid="item-sync-status" className="hidden md:table-cell">
                    {getSyncStatusBadges(item.bricklinkSyncStatus, item.brickowlSyncStatus)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      {filteredAndSortedItems.length > 0 && (
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-2">
          <span>
            Showing {filteredAndSortedItems.length} of {items.length} items
          </span>
          {selectedItems.size > 0 && (
            <>
              <span className="hidden sm:inline">•</span>
              <span>{selectedItems.size} selected</span>
            </>
          )}
        </div>
      )}

      {/* Delete from File confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="delete-from-file-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.size} item(s) from file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected items from this file. The items will remain in your
              inventory but will no longer be part of this file collection. This action can be
              reversed by adding the items back to the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-button"
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "Deleting..." : "Delete from File"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Sync Dialog */}
      <BatchSyncDialog
        fileId={syncDialogOpen ? fileId : null}
        onOpenChange={(open) => setSyncDialogOpen(open)}
      />
    </div>
  );
}
