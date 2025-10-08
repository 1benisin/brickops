import { create } from "zustand";

import type { CatalogSortState } from "@/types/catalog";

type SearchState = {
  sortLocation: string;
  partTitle: string;
  partId: string;
  page: number;
  pageSize: number;
  sort: CatalogSortState | null;
  setSortLocation: (value: string) => void;
  setPartTitle: (value: string) => void;
  setPartId: (value: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort: CatalogSortState | null) => void;
  setFilters: (
    filters: Partial<
      Pick<SearchState, "sortLocation" | "partTitle" | "partId" | "sort" | "pageSize">
    >,
  ) => void;
  resetFilters: () => void;
};

const DEFAULT_STATE: Omit<
  SearchState,
  | "setSortLocation"
  | "setPartTitle"
  | "setPartId"
  | "setPage"
  | "setPageSize"
  | "setSort"
  | "setFilters"
  | "resetFilters"
> = {
  sortLocation: "",
  partTitle: "",
  partId: "",
  page: 1,
  pageSize: 25,
  sort: null,
};

export const useSearchStore = create<SearchState>()((set, _get) => ({
  ...DEFAULT_STATE,
  setSortLocation: (value) =>
    set(() => ({
      sortLocation: value,
      partTitle: value ? "" : _get().partTitle,
      partId: value ? "" : _get().partId,
      page: 1,
    })),
  setPartTitle: (value) =>
    set(() => ({
      partTitle: value,
      sortLocation: value ? "" : _get().sortLocation,
      partId: value ? "" : _get().partId,
      page: 1,
    })),
  setPartId: (value) =>
    set(() => ({
      partId: value,
      sortLocation: value ? "" : _get().sortLocation,
      partTitle: value ? "" : _get().partTitle,
      page: 1,
    })),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) =>
    set((state) => ({
      pageSize,
      page: state.pageSize === pageSize ? state.page : 1,
    })),
  setSort: (sort) =>
    set(() => ({
      sort,
      page: 1,
    })),
  setFilters: (filters) => {
    set((state) => ({
      sortLocation: filters.sortLocation ?? state.sortLocation,
      partTitle: filters.partTitle ?? state.partTitle,
      partId: filters.partId ?? state.partId,
      sort: filters.sort ?? state.sort,
      pageSize: filters.pageSize ?? state.pageSize,
      page: 1,
    }));
  },
  resetFilters: () => set(() => ({ ...DEFAULT_STATE })),
}));

export const useSearchSelector = <T>(selector: (state: SearchState) => T): T =>
  useSearchStore(selector);
