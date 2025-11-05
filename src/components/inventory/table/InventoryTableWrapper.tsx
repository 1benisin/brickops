"use client";

import { useMemo, useState, useCallback } from "react";
import { Table } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table/data-table";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { createInventoryColumns, type MarketplaceSyncConfig } from "./InventoryTableColumns";
import { InventoryBulkActions } from "./InventoryBulkActions";
import type { InventoryItem } from "@/types/inventory";
import { EditInventoryItemDialog } from "@/components/inventory/dialogs/EditInventoryItemDialog";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { QuerySpec } from "@/convex/inventory/types";

interface InventoryTableWrapperProps {
  data?: InventoryItem[]; // Optional for backward compatibility
  syncConfig: MarketplaceSyncConfig;
  onEditItem?: (item: InventoryItem) => void;
}

export function InventoryTableWrapper({
  data,
  syncConfig,
  onEditItem,
}: InventoryTableWrapperProps) {
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEditItem = useCallback(
    (item: InventoryItem) => {
      if (onEditItem) {
        onEditItem(item);
      } else {
        setEditingItem(item);
        setIsEditDialogOpen(true);
      }
    },
    [onEditItem],
  );

  const handleEditDialogClose = useCallback(() => {
    setIsEditDialogOpen(false);
    setEditingItem(null);
  }, []);

  // Query state for server-side sorting and filtering
  const [querySpec, setQuerySpec] = useState<QuerySpec>({
    filters: {},
    sort: [{ id: "createdAt", desc: true }],
    pagination: { pageSize: 25 },
  });

  // Client-side pagination state (when data prop is provided)
  const [clientPagination, setClientPagination] = useState({ pageIndex: 0, pageSize: 25 });

  // Table instance and reset callback state
  const [tableInstance, setTableInstance] = useState<Table<InventoryItem> | null>(null);
  const [resetAllCallback, setResetAllCallback] = useState<(() => void) | null>(null);

  // Client-side sorting state (when data is provided)
  const [clientSorting, setClientSorting] = useState<Array<{ id: string; desc: boolean }>>([
    { id: "createdAt", desc: true },
  ]);

  // Client-side filtering state (when data is provided)
  const [clientFilters, setClientFilters] = useState<Record<string, unknown>>({});

  // Fetch data using Convex query (only if not using provided data)
  // Pass "skip" to conditionally skip the query when data is provided
  const result = useQuery(
    api.inventory.queries.listInventoryItemsFiltered,
    data ? ("skip" as const) : { querySpec },
  );

  // Client-side filtering and sorting when data is provided
  const sortedData = useMemo(() => {
    // Get raw data (from props or server)
    const rawData = data ?? result?.items ?? [];

    if (!data) {
      return rawData;
    }

    // Apply client-side filtering
    const filtered = rawData.filter((item: InventoryItem) => {
      // Text prefix filters
      if (clientFilters.partNumber && typeof clientFilters.partNumber === "string") {
        const partNumber = String(item.partNumber || "");
        if (!partNumber.toLowerCase().startsWith(String(clientFilters.partNumber).toLowerCase())) {
          return false;
        }
      }
      if (clientFilters.name && typeof clientFilters.name === "string") {
        const name = String(item.name || "");
        if (!name.toLowerCase().includes(String(clientFilters.name).toLowerCase())) {
          return false;
        }
      }
      if (clientFilters.colorId && typeof clientFilters.colorId === "string") {
        const colorId = String(item.colorId || "");
        if (!colorId.toLowerCase().startsWith(String(clientFilters.colorId).toLowerCase())) {
          return false;
        }
      }

      // Number range filters
      if (clientFilters.price && typeof clientFilters.price === "object") {
        const priceFilter = clientFilters.price as { min?: number; max?: number };
        const price = item.price as number | undefined;
        if (price === undefined) return false;
        if (priceFilter.min !== undefined && price < priceFilter.min) return false;
        if (priceFilter.max !== undefined && price > priceFilter.max) return false;
      }
      if (clientFilters.quantityAvailable && typeof clientFilters.quantityAvailable === "object") {
        const qtyFilter = clientFilters.quantityAvailable as { min?: number; max?: number };
        const qty = item.quantityAvailable as number;
        if (qtyFilter.min !== undefined && qty < qtyFilter.min) return false;
        if (qtyFilter.max !== undefined && qty > qtyFilter.max) return false;
      }
      if (clientFilters.quantityReserved && typeof clientFilters.quantityReserved === "object") {
        const qtyFilter = clientFilters.quantityReserved as { min?: number; max?: number };
        const qty = (item.quantityReserved as number) || 0;
        if (qtyFilter.min !== undefined && qty < qtyFilter.min) return false;
        if (qtyFilter.max !== undefined && qty > qtyFilter.max) return false;
      }

      // Date range filters
      if (clientFilters.createdAt && typeof clientFilters.createdAt === "object") {
        const dateFilter = clientFilters.createdAt as { start?: number; end?: number };
        const timestamp = item.createdAt as number;
        if (dateFilter.start !== undefined && timestamp < dateFilter.start) return false;
        if (dateFilter.end !== undefined && timestamp > dateFilter.end) return false;
      }
      if (clientFilters.updatedAt && typeof clientFilters.updatedAt === "object") {
        const dateFilter = clientFilters.updatedAt as { start?: number; end?: number };
        const timestamp = (item.updatedAt as number | undefined) || item.createdAt;
        if (dateFilter.start !== undefined && timestamp < dateFilter.start) return false;
        if (dateFilter.end !== undefined && timestamp > dateFilter.end) return false;
      }

      // Enum filters
      if (clientFilters.condition && typeof clientFilters.condition === "string") {
        if (item.condition !== clientFilters.condition) return false;
      }
      if (clientFilters.location && typeof clientFilters.location === "string") {
        if (item.location !== clientFilters.location) return false;
      }

      return true;
    });

    const sorted = [...filtered];

    // If no active sorts, use default sort by createdAt desc
    const activeSorts =
      clientSorting.length > 0 ? clientSorting : [{ id: "createdAt", desc: true }];

    // Single sort function that considers all sort criteria (multi-column sorting)
    sorted.sort((a, b) => {
      // Check each sort in order - return first non-zero comparison
      for (const sort of activeSorts) {
        let aVal: unknown;
        let bVal: unknown;

        // Handle computed columns (like totalPrice)
        if (sort.id === "totalPrice") {
          const aPrice = (a.price as number | undefined) ?? 0;
          const bPrice = (b.price as number | undefined) ?? 0;
          const aQty = (a.quantityAvailable as number) ?? 0;
          const bQty = (b.quantityAvailable as number) ?? 0;
          aVal = aPrice * aQty;
          bVal = bPrice * bQty;
        } else if (sort.id === "marketplaceSync.bricklink") {
          // Sort by sync status: pending < syncing < synced < failed
          // Items without sync data go last
          const aSync = a.marketplaceSync?.bricklink;
          const bSync = b.marketplaceSync?.bricklink;
          const statusOrder: Record<string, number> = {
            pending: 0,
            syncing: 1,
            synced: 2,
            failed: 3,
          };
          const aStatus = aSync?.status;
          const bStatus = bSync?.status;
          // If no status, treat as undefined (will be sorted to end)
          aVal = aStatus ? statusOrder[aStatus] ?? 999 : 999;
          bVal = bStatus ? statusOrder[bStatus] ?? 999 : 999;
        } else if (sort.id === "marketplaceSync.brickowl") {
          // Sort by sync status: pending < syncing < synced < failed
          // Items without sync data go last
          const aSync = a.marketplaceSync?.brickowl;
          const bSync = b.marketplaceSync?.brickowl;
          const statusOrder: Record<string, number> = {
            pending: 0,
            syncing: 1,
            synced: 2,
            failed: 3,
          };
          const aStatus = aSync?.status;
          const bStatus = bSync?.status;
          // If no status, treat as undefined (will be sorted to end)
          aVal = aStatus ? statusOrder[aStatus] ?? 999 : 999;
          bVal = bStatus ? statusOrder[bStatus] ?? 999 : 999;
        } else {
          // Regular field access
          aVal = a[sort.id as keyof InventoryItem];
          bVal = b[sort.id as keyof InventoryItem];

          // Handle nested properties (for other nested paths, not marketplaceSync which is handled above)
          if (sort.id.includes(".")) {
            const keys = sort.id.split(".");
            let currentA: unknown = a;
            let currentB: unknown = b;
            for (const key of keys) {
              currentA =
                currentA && typeof currentA === "object" && key in currentA
                  ? (currentA as Record<string, unknown>)[key]
                  : undefined;
              currentB =
                currentB && typeof currentB === "object" && key in currentB
                  ? (currentB as Record<string, unknown>)[key]
                  : undefined;
            }
            aVal = currentA;
            bVal = currentB;
          }
        }

        // Handle undefined/null values - treat as 0 for numbers, empty string for strings
        const aIsNull = aVal == null;
        const bIsNull = bVal == null;

        if (aIsNull && bIsNull) {
          continue; // Equal, check next sort
        }

        // Determine the type based on non-null value or column ID
        const isNumericColumn =
          sort.id === "quantityAvailable" ||
          sort.id === "quantityReserved" ||
          sort.id === "price" ||
          sort.id === "totalPrice" ||
          sort.id === "createdAt" ||
          sort.id === "updatedAt" ||
          sort.id === "marketplaceSync.bricklink" ||
          sort.id === "marketplaceSync.brickowl";

        // Normalize null values based on column type
        if (aIsNull) {
          aVal = isNumericColumn ? 0 : "";
        }
        if (bIsNull) {
          bVal = isNumericColumn ? 0 : "";
        }

        // Compare values - now aVal and bVal are guaranteed to be non-null
        let comparison = 0;
        if (typeof aVal === "string" && typeof bVal === "string") {
          comparison = aVal.localeCompare(bVal);
        } else if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else {
          // Fallback: convert to string
          const aStr = String(aVal);
          const bStr = String(bVal);
          comparison = aStr.localeCompare(bStr);
        }

        // Apply sort direction
        if (sort.desc) {
          comparison = -comparison;
        }

        // If not equal, return the comparison (this stops checking other sorts)
        if (comparison !== 0) {
          return comparison;
        }
        // If equal, continue to next sort criterion
      }
      // All sort criteria are equal
      return 0;
    });
    return sorted;
  }, [data, result?.items, clientSorting, clientFilters]);

  // Use sorted data (client-side) or server-sorted data
  const tableData = useMemo(() => {
    if (data) {
      // Client-side pagination: slice the sorted/filtered data
      const startIndex = clientPagination.pageIndex * clientPagination.pageSize;
      const endIndex = startIndex + clientPagination.pageSize;
      return sortedData.slice(startIndex, endIndex);
    }
    // Server-side: use result directly (already paginated)
    return sortedData;
  }, [data, sortedData, clientPagination]);

  const columns = useMemo(
    () => createInventoryColumns(syncConfig, handleEditItem),
    [syncConfig, handleEditItem],
  );

  // Handle sort changes - client-side when data provided, server-side otherwise
  const handleSortChange = useCallback(
    (sort: Array<{ id: string; desc: boolean }>) => {
      if (data) {
        // Client-side: update local sorting state and reset pagination
        setClientSorting(sort);
        setClientPagination({ pageIndex: 0, pageSize: clientPagination.pageSize });
      } else {
        // Server-side: update query spec
        setQuerySpec((prev: QuerySpec) => ({
          ...prev,
          sort,
          pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
        }));
      }
    },
    [data, clientPagination.pageSize],
  );

  // Handle column filter changes (server-side or client-side)
  const handleColumnFilterChange = useCallback(
    (columnId: string, value: unknown) => {
      if (data) {
        // Client-side filtering and reset pagination
        setClientFilters((prev) => {
          const newFilters = { ...prev };
          // Handle "__all__" from SelectFilterInline (means "no filter")
          if (value === undefined || value === null || value === "" || value === "__all__") {
            delete newFilters[columnId];
          } else {
            newFilters[columnId] = value;
          }
          return newFilters;
        });
        setClientPagination({ pageIndex: 0, pageSize: clientPagination.pageSize });
      } else {
        // Server-side filtering
        setQuerySpec((prev: QuerySpec) => {
          const newFilters = { ...(prev.filters || {}) };

          // Text prefix filters
          if (columnId === "partNumber" || columnId === "name" || columnId === "colorId") {
            if (value && typeof value === "string") {
              if (columnId === "partNumber") {
                newFilters.partNumber = { kind: "prefix", value };
              } else if (columnId === "name") {
                newFilters.name = { kind: "prefix", value };
              } else if (columnId === "colorId") {
                newFilters.colorId = { kind: "prefix", value };
              }
            } else {
              if (columnId === "partNumber") delete newFilters.partNumber;
              else if (columnId === "name") delete newFilters.name;
              else if (columnId === "colorId") delete newFilters.colorId;
            }
          }
          // Number range filters
          else if (
            columnId === "price" ||
            columnId === "quantityAvailable" ||
            columnId === "quantityReserved"
          ) {
            if (value && typeof value === "object") {
              const rangeValue = value as { min?: number; max?: number };
              if (columnId === "price") {
                newFilters.price = { kind: "numberRange", ...rangeValue };
              } else if (columnId === "quantityAvailable") {
                newFilters.quantityAvailable = { kind: "numberRange", ...rangeValue };
              } else if (columnId === "quantityReserved") {
                newFilters.quantityReserved = { kind: "numberRange", ...rangeValue };
              }
            } else {
              if (columnId === "price") delete newFilters.price;
              else if (columnId === "quantityAvailable") delete newFilters.quantityAvailable;
              else if (columnId === "quantityReserved") delete newFilters.quantityReserved;
            }
          }
          // Date range filters
          else if (columnId === "createdAt" || columnId === "updatedAt") {
            if (value && typeof value === "object") {
              const rangeValue = value as { start?: number; end?: number };
              if (columnId === "createdAt") {
                newFilters.createdAt = { kind: "dateRange", ...rangeValue };
              } else if (columnId === "updatedAt") {
                newFilters.updatedAt = { kind: "dateRange", ...rangeValue };
              }
            } else {
              if (columnId === "createdAt") delete newFilters.createdAt;
              else if (columnId === "updatedAt") delete newFilters.updatedAt;
            }
          }
          // Enum filters
          else if (columnId === "condition" || columnId === "location") {
            if (value && typeof value === "string") {
              if (columnId === "condition") {
                newFilters.condition = { kind: "enum", value };
              } else if (columnId === "location") {
                newFilters.location = { kind: "enum", value };
              }
            } else {
              if (columnId === "condition") delete newFilters.condition;
              else if (columnId === "location") delete newFilters.location;
            }
          }

          return {
            ...prev,
            filters: Object.keys(newFilters).length > 0 ? newFilters : undefined,
            pagination: { ...prev.pagination, cursor: undefined }, // Reset to first page
          };
        });
      }
    },
    [data, clientPagination.pageSize],
  );

  // Pagination handlers
  const handlePageSizeChange = useCallback(
    (size: number) => {
      if (data) {
        // Client-side: update pageSize, reset to page 0
        setClientPagination({ pageIndex: 0, pageSize: size });
      } else {
        // Server-side: update query spec
        setQuerySpec((prev: QuerySpec) => ({
          ...prev,
          pagination: { ...prev.pagination, pageSize: size, cursor: undefined },
        }));
      }
    },
    [data],
  );

  const handleNextPage = useCallback(() => {
    if (data) {
      // Client-side: increment pageIndex if hasMore
      const hasMore =
        (clientPagination.pageIndex + 1) * clientPagination.pageSize < sortedData.length;
      if (hasMore) {
        setClientPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
      }
    } else {
      // Server-side: use cursor-based pagination
      if (result && !result.isDone) {
        setQuerySpec((prev: QuerySpec) => ({
          ...prev,
          pagination: { ...prev.pagination, cursor: result.cursor },
        }));
      }
    }
  }, [data, clientPagination, sortedData, result]);

  const handlePreviousPage = useCallback(() => {
    if (data) {
      // Client-side: decrement pageIndex if > 0
      if (clientPagination.pageIndex > 0) {
        setClientPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex - 1 }));
      }
    } else {
      // Server-side: reset to first page
      setQuerySpec((prev: QuerySpec) => ({
        ...prev,
        pagination: { ...prev.pagination, cursor: undefined },
      }));
    }
  }, [data, clientPagination]);

  // Extract filter values for column filters prop
  const columnFilters = useMemo(() => {
    if (data) {
      // Client-side: return clientFilters directly
      return clientFilters;
    }

    // Server-side: extract from querySpec
    const filters: Record<string, unknown> = {};

    // Text filters
    if (querySpec.filters?.partNumber) {
      filters.partNumber = querySpec.filters.partNumber.value;
    }
    if (querySpec.filters?.name) {
      filters.name = querySpec.filters.name.value;
    }
    if (querySpec.filters?.colorId) {
      filters.colorId = querySpec.filters.colorId.value;
    }

    // Number range filters
    if (querySpec.filters?.price) {
      filters.price = { min: querySpec.filters.price.min, max: querySpec.filters.price.max };
    }
    if (querySpec.filters?.quantityAvailable) {
      filters.quantityAvailable = {
        min: querySpec.filters.quantityAvailable.min,
        max: querySpec.filters.quantityAvailable.max,
      };
    }
    if (querySpec.filters?.quantityReserved) {
      filters.quantityReserved = {
        min: querySpec.filters.quantityReserved.min,
        max: querySpec.filters.quantityReserved.max,
      };
    }

    // Date range filters
    if (querySpec.filters?.createdAt) {
      filters.createdAt = {
        start: querySpec.filters.createdAt.start,
        end: querySpec.filters.createdAt.end,
      };
    }
    if (querySpec.filters?.updatedAt) {
      filters.updatedAt = {
        start: querySpec.filters.updatedAt.start,
        end: querySpec.filters.updatedAt.end,
      };
    }

    // Enum filters
    if (querySpec.filters?.condition) {
      filters.condition = querySpec.filters.condition.value;
    }
    if (querySpec.filters?.location) {
      filters.location = querySpec.filters.location.value;
    }

    return filters;
  }, [data, clientFilters, querySpec.filters]);

  // Selection state
  const [_selectedRows, setSelectedRows] = useState<InventoryItem[]>([]);

  // Loading state
  const isLoading = !data && result === undefined;

  // Get row ID function for selection persistence
  const getRowId = useCallback((row: InventoryItem) => {
    // Use _id if available (Convex), otherwise use a composite key
    return row._id || `${row.partNumber}-${row.colorId}`;
  }, []);

  // Compute pagination values
  const paginationPageSize = data ? clientPagination.pageSize : querySpec.pagination.pageSize;
  const paginationHasMore = useMemo(() => {
    if (data) {
      // Client-side: check if there are more items
      return (clientPagination.pageIndex + 1) * clientPagination.pageSize < sortedData.length;
    } else {
      // Server-side: check result.isDone
      return result ? !result.isDone : false;
    }
  }, [data, clientPagination, sortedData, result]);

  return (
    <>
      <DataTable<InventoryItem>
        data={tableData}
        columns={columns}
        storageKey="inventory-table-state"
        pinnedStartColumns={["select"]}
        pinnedEndColumns={["actions"]}
        enableSorting={true}
        sorting={
          data
            ? clientSorting.map((s) => ({
                id: s.id,
                desc: s.desc,
              }))
            : querySpec.sort.map((s: { id: string; desc: boolean }) => ({
                id: s.id,
                desc: s.desc,
              }))
        }
        onSortChange={handleSortChange}
        enableToolbar={false}
        enableFiltering={true}
        onColumnFilterChange={handleColumnFilterChange}
        columnFilters={columnFilters}
        enableRowSelection={true}
        onRowSelect={setSelectedRows}
        bulkActions={(props) => <InventoryBulkActions selectedRows={props.selectedRows} />}
        getRowId={getRowId}
        persistSelection={true}
        isLoading={isLoading}
        loadingState={
          <div className="flex items-center justify-center h-48">Loading inventory...</div>
        }
        emptyState={
          <div className="text-center text-muted-foreground">No inventory items found.</div>
        }
        enableColumnVisibility={true}
        enableColumnOrdering={true}
        enableColumnSizing={true}
        onTableReady={setTableInstance}
        onResetAllReady={setResetAllCallback}
      />
      {(data || result) && (
        <DataTablePagination
          pageSize={paginationPageSize}
          hasMore={paginationHasMore}
          isLoading={isLoading}
          onPageSizeChange={handlePageSizeChange}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          table={tableInstance ?? undefined}
          onResetAll={resetAllCallback ?? undefined}
          enableColumnVisibility={true}
        />
      )}

      {/* Edit Dialog */}
      <EditInventoryItemDialog
        open={isEditDialogOpen}
        onOpenChange={handleEditDialogClose}
        item={editingItem}
      />
    </>
  );
}
