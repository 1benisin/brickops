import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CatalogSortState } from "@/lib/services/catalog-service";

type FreshnessFilter = "all" | "fresh" | "stale" | "expired";

type SearchState = {
  query: string;
  selectedColors: number[];
  selectedCategories: number[];
  page: number;
  pageSize: number;
  sort: CatalogSortState | null;
  freshness: FreshnessFilter;
  setQuery: (query: string) => void;
  toggleColor: (colorId: number) => void;
  toggleCategory: (categoryId: number) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  setSort: (sort: CatalogSortState | null) => void;
  setFreshness: (freshness: FreshnessFilter) => void;
  setFilters: (
    filters: Partial<
      Pick<
        SearchState,
        "query" | "selectedColors" | "selectedCategories" | "sort" | "pageSize" | "freshness"
      >
    >,
  ) => void;
  resetFilters: () => void;
};

const DEFAULT_STATE: Omit<
  SearchState,
  | "setQuery"
  | "toggleColor"
  | "toggleCategory"
  | "setPage"
  | "setPageSize"
  | "setSort"
  | "setFilters"
  | "setFreshness"
  | "resetFilters"
> = {
  query: "",
  selectedColors: [],
  selectedCategories: [],
  page: 1,
  pageSize: 25,
  sort: null,
  freshness: "all",
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set, _get) => ({
      ...DEFAULT_STATE,
      setQuery: (query) =>
        set(() => ({
          query,
          page: 1,
        })),
      toggleColor: (colorId) =>
        set((state) => {
          const selected = state.selectedColors.includes(colorId)
            ? state.selectedColors.filter((id) => id !== colorId)
            : [...state.selectedColors, colorId];
          return { selectedColors: selected, page: 1 };
        }),
      toggleCategory: (categoryId) =>
        set((state) => {
          const selected = state.selectedCategories.includes(categoryId)
            ? state.selectedCategories.filter((id) => id !== categoryId)
            : [...state.selectedCategories, categoryId];
          return { selectedCategories: selected, page: 1 };
        }),
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
      setFreshness: (freshness) =>
        set(() => ({
          freshness,
          page: 1,
        })),
      setFilters: (filters) => {
        set((state) => ({
          query: filters.query ?? state.query,
          selectedColors: filters.selectedColors ?? state.selectedColors,
          selectedCategories: filters.selectedCategories ?? state.selectedCategories,
          sort: filters.sort ?? state.sort,
          pageSize: filters.pageSize ?? state.pageSize,
          freshness: filters.freshness ?? state.freshness,
          page: 1,
        }));
      },
      resetFilters: () => set(() => ({ ...DEFAULT_STATE })),
    }),
    {
      name: "catalog-search-store",
      partialize: (state) => ({
        query: state.query,
        selectedColors: state.selectedColors,
        selectedCategories: state.selectedCategories,
        pageSize: state.pageSize,
        sort: state.sort,
        freshness: state.freshness,
      }),
    },
  ),
);

export const useSearchSelector = <T>(selector: (state: SearchState) => T): T =>
  useSearchStore(selector);
