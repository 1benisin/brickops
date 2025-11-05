"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DataTableViewOptions } from "./data-table-view-options";

interface DataTablePaginationProps<TData> {
  pageSize: number;
  hasMore: boolean;
  isLoading?: boolean;
  onPageSizeChange: (size: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  pageSizeOptions?: number[];
  table?: Table<TData>;
  onResetAll?: () => void;
  enableColumnVisibility?: boolean;
}

export function DataTablePagination<TData>({
  pageSize,
  hasMore,
  isLoading = false,
  onPageSizeChange,
  onNextPage,
  onPreviousPage,
  pageSizeOptions = [10, 25, 50, 100],
  table,
  onResetAll,
  enableColumnVisibility = false,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {/* Selection info could go here */}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select value={`${pageSize}`} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {enableColumnVisibility && table && onResetAll && (
          <div className="flex items-center">
            <DataTableViewOptions table={table} onResetAll={onResetAll} className="h-8" />
          </div>
        )}
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={onPreviousPage}
            disabled={isLoading}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={onNextPage}
            disabled={!hasMore || isLoading}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
