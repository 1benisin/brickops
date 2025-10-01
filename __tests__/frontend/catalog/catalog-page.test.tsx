/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogPage from "@/app/(authenticated)/catalog/page";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import type { Id } from "@/convex/_generated/dataModel";
import type { CatalogSearchResult, CatalogPartDetails } from "@/lib/services/catalog-service";

jest.mock("@/hooks/useSearchStore", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  type StoreState = {
    query: string;
    selectedColors: number[];
    selectedCategories: number[];
    page: number;
    pageSize: number;
    sort: { field: "name" | "marketPrice" | "lastUpdated"; direction: "asc" | "desc" } | null;
    freshness: "all" | "fresh" | "stale" | "expired";
  };

  let state: StoreState = {
    query: "",
    selectedColors: [],
    selectedCategories: [],
    page: 1,
    pageSize: 25,
    sort: null,
    freshness: "all",
  };

  const listeners = new Set<() => void>();

  const setState = (updater: Partial<StoreState> | ((prev: StoreState) => Partial<StoreState>)) => {
    const next = typeof updater === "function" ? updater(state) : updater;
    const updated: StoreState = {
      ...state,
      ...next,
      selectedColors: [...(next.selectedColors ?? state.selectedColors)],
      selectedCategories: [...(next.selectedCategories ?? state.selectedCategories)],
      sort: next.sort ?? state.sort,
    };
    updated.sort = updated.sort ? { ...updated.sort } : null;
    state = updated;
    listeners.forEach((listener) => listener());
  };

  const actions = {
    setQuery: (query: string) => setState({ query, page: 1 }),
    toggleColor: (colorId: number) =>
      setState((prev) => {
        const selected = prev.selectedColors.includes(colorId)
          ? prev.selectedColors.filter((id) => id !== colorId)
          : [...prev.selectedColors, colorId];
        return { selectedColors: selected, page: 1 };
      }),
    toggleCategory: (categoryId: number) =>
      setState((prev) => {
        const selected = prev.selectedCategories.includes(categoryId)
          ? prev.selectedCategories.filter((id) => id !== categoryId)
          : [...prev.selectedCategories, categoryId];
        return { selectedCategories: selected, page: 1 };
      }),
    setPage: (page: number) => setState({ page }),
    setPageSize: (pageSize: number) =>
      setState((prev) => ({
        pageSize,
        page: prev.pageSize === pageSize ? prev.page : 1,
      })),
    setSort: (
      sort: { field: "name" | "marketPrice" | "lastUpdated"; direction: "asc" | "desc" } | null,
    ) => setState({ sort, page: 1 }),
    setFreshness: (freshness: StoreState["freshness"]) => setState({ freshness, page: 1 }),
    setFilters: (
      filters: Partial<
        Pick<
          StoreState,
          "query" | "selectedColors" | "selectedCategories" | "sort" | "pageSize" | "freshness"
        >
      >,
    ) =>
      setState((prev) => ({
        query: filters.query ?? prev.query,
        selectedColors: filters.selectedColors ?? prev.selectedColors,
        selectedCategories: filters.selectedCategories ?? prev.selectedCategories,
        sort: filters.sort ?? prev.sort,
        pageSize: filters.pageSize ?? prev.pageSize,
        freshness: filters.freshness ?? prev.freshness,
        page: 1,
      })),
    resetFilters: () =>
      setState({
        query: "",
        selectedColors: [],
        selectedCategories: [],
        page: 1,
        pageSize: 25,
        sort: null,
        freshness: "all",
      }),
  };

  const getSnapshot = () => ({ ...state, ...actions });
  type StoreSnapshot = ReturnType<typeof getSnapshot>;

  const useSearchStore = <U,>(
    selector: (store: StoreSnapshot) => U = (store) => store as unknown as U,
  ) => {
    const [slice, setSlice] = ReactActual.useState(() => selector(getSnapshot()));

    ReactActual.useEffect(() => {
      const listener = () => setSlice(selector(getSnapshot()));
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, [selector]);

    return slice;
  };

  const useSearchSelector = <U,>(selector: (store: StoreSnapshot) => U) => useSearchStore(selector);

  const reset = () => {
    state = {
      query: "",
      selectedColors: [],
      selectedCategories: [],
      page: 1,
      pageSize: 25,
      sort: null,
      freshness: "all",
    };
    listeners.forEach((listener) => listener());
  };

  type HookWithInternals = typeof useSearchStore & {
    getState: () => StoreSnapshot;
    setState: (partial: Partial<StoreState>) => void;
  };

  (useSearchStore as HookWithInternals).getState = getSnapshot;
  (useSearchStore as HookWithInternals).setState = (partial) => setState(partial);

  return {
    __esModule: true,
    useSearchStore: useSearchStore as HookWithInternals,
    useSearchSelector,
    __resetSearchStoreMock: reset,
  };
});

const sharedMetadata: CatalogSearchResult["metadata"] = {
  colors: [
    {
      id: 1,
      name: "White",
      rgb: "FFFFFF",
      colorType: "Solid",
      isTransparent: false,
      count: 1,
      active: false,
    },
    {
      id: 21,
      name: "Bright Red",
      rgb: "CC0000",
      colorType: "Solid",
      isTransparent: false,
      count: 1,
      active: false,
    },
  ],
  categories: [
    {
      id: 100,
      name: "Bricks",
      parentCategoryId: undefined,
      path: [100],
      count: 1,
      active: false,
    },
  ],
  summary: {
    totalParts: 1,
    totalColors: 2,
    totalCategories: 1,
  },
};

const searchResults: Record<string, CatalogSearchResult> = {
  first: {
    parts: [
      {
        _id: "legoPartCatalog:1" as Id<"legoPartCatalog">,
        partNumber: "3001",
        name: "Brick 2 x 4",
        description: "Standard brick",
        category: "Bricks",
        categoryPath: [100],
        categoryPathKey: "100",
        imageUrl: null,
        dataSource: "brickops",
        lastUpdated: Date.now(),
        dataFreshness: "fresh",
        bricklinkPartId: "3001",
        bricklinkCategoryId: 100,
        primaryColorId: 1,
        availableColorIds: [1, 21],
        sortGrid: "A",
        sortBin: "10",
        marketPrice: 1.23,
        marketPriceCurrency: "USD",
        marketPriceLastSyncedAt: Date.now(),
      },
    ],
    source: "local",
    searchDurationMs: 10,
    pagination: {
      cursor: "cursor-2",
      hasNextPage: true,
      pageSize: 25,
      fetched: 1,
      isDone: false,
    },
    metadata: sharedMetadata,
  },
  "cursor-2": {
    parts: [
      {
        _id: "legoPartCatalog:2" as Id<"legoPartCatalog">,
        partNumber: "3002",
        name: "Brick 2 x 3",
        description: "Another brick",
        category: "Bricks",
        categoryPath: [100],
        categoryPathKey: "100",
        imageUrl: null,
        dataSource: "brickops",
        lastUpdated: Date.now(),
        dataFreshness: "fresh",
        bricklinkPartId: "3002",
        bricklinkCategoryId: 100,
        primaryColorId: 21,
        availableColorIds: [21],
        sortGrid: "B",
        sortBin: "5",
        marketPrice: 0.95,
        marketPriceCurrency: "USD",
        marketPriceLastSyncedAt: Date.now(),
      },
    ],
    source: "local",
    searchDurationMs: 8,
    pagination: {
      cursor: null,
      hasNextPage: false,
      pageSize: 25,
      fetched: 1,
      isDone: true,
    },
    metadata: sharedMetadata,
  },
};

const detailResult: CatalogPartDetails = {
  ...searchResults.first.parts[0],
  source: "local",
  bricklinkStatus: "skipped",
  colorAvailability: [
    {
      colorId: 1,
      elementIds: ["300101"],
      isLegacy: false,
      color: {
        name: "White",
        rgb: "FFFFFF",
        colorType: "Solid",
        isTransparent: false,
      },
    },
  ],
  elementReferences: [
    {
      elementId: "300101",
      colorId: 1,
      designId: "123",
      bricklinkPartId: "3001",
    },
  ],
  marketPricing: null,
};

const mockUseQuery = jest.fn((_queryFn: unknown, args: unknown) => {
  if (args === undefined) {
    return { businessAccount: { _id: "ba_1" } } as unknown;
  }

  if (args === "skip") {
    return undefined;
  }

  if (typeof args === "object" && args !== null && "partNumber" in args) {
    return detailResult as unknown;
  }

  if (typeof args === "object" && args !== null) {
    const cursor = (args as { cursor?: string }).cursor;
    return searchResults[cursor ?? "first"] as unknown;
  }

  return undefined;
});

const mockMutation = jest.fn(() => Promise.resolve({ refreshed: 1, errors: [] }));

const { __resetSearchStoreMock } = jest.requireMock("@/hooks/useSearchStore");

jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: (...args: Parameters<typeof mockUseQuery>) => mockUseQuery(...args),
    useMutation: jest.fn(() => mockMutation),
  };
});

jest.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({
    children,
    asChild,
    ...props
  }: React.ComponentProps<"button"> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  Content: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  Title: ({ children, ...props }: React.ComponentProps<"h2">) => <h2 {...props}>{children}</h2>,
  Description: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  Close: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

describe("CatalogPage", () => {
  beforeEach(() => {
    mockUseQuery.mockClear();
    mockMutation.mockClear();
    __resetSearchStoreMock();
  });

  it("renders catalog search results", async () => {
    renderWithProviders(<CatalogPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Catalog");
    expect(screen.getByTestId("catalog-search-input")).toBeInTheDocument();
    expect(await screen.findByTestId("catalog-results-grid")).toBeInTheDocument();
    expect(await screen.findByTestId("catalog-result-card-3001")).toBeInTheDocument();
  });

  it("applies color filters and passes them to search query", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    const colorFilter = await screen.findByTestId("catalog-filter-color-21");
    await user.click(colorFilter);

    const searchCalls = mockUseQuery.mock.calls.filter(
      (call) =>
        Array.isArray(call) &&
        call.length > 1 &&
        typeof call[1] === "object" &&
        call[1] !== null &&
        "query" in (call[1] as Record<string, unknown>),
    );
    const latestArgs = searchCalls[searchCalls.length - 1]?.[1] as { colors?: number[] };
    expect(latestArgs.colors).toEqual([21]);
  });

  it("supports pagination controls", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    await screen.findByTestId("catalog-results-grid");

    await user.click(screen.getByTestId("catalog-next-page"));

    await waitFor(() => {
      expect(
        mockUseQuery.mock.calls.some(
          (call) =>
            Array.isArray(call) &&
            call.length > 1 &&
            typeof call[1] === "object" &&
            call[1] !== null &&
            (call[1] as { cursor?: string }).cursor === "cursor-2",
        ),
      ).toBe(true);
    });

    expect(await screen.findByTestId("catalog-results-grid")).toBeInTheDocument();
    expect(await screen.findByText(/Page\s*2/)).toBeInTheDocument();
  });

  it("preserves the selected page when navigating and resets after filter changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    await screen.findByTestId("catalog-results-grid");

    await user.click(screen.getByTestId("catalog-next-page"));

    expect(await screen.findByText(/Page\s*2/)).toBeInTheDocument();

    const colorFilter = await screen.findByTestId("catalog-filter-color-21");
    await user.click(colorFilter);

    expect(await screen.findByText(/Page\s*1/)).toBeInTheDocument();

    await waitFor(() => {
      const searchCalls = mockUseQuery.mock.calls.filter(
        (call) =>
          Array.isArray(call) && call.length > 1 && typeof call[1] === "object" && call[1] !== null,
      );
      const latestArgs = searchCalls[searchCalls.length - 1]?.[1] as
        | { cursor?: string }
        | undefined;
      expect(latestArgs?.cursor).toBeUndefined();
    });
  });

  it("opens the detail drawer with part metadata", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    await user.click(await screen.findByTestId("catalog-result-card-3001"));

    const drawer = await screen.findByTestId("catalog-detail-content");
    const headings = await screen.findAllByText(/Brick 2 x 4/);
    expect(headings.length).toBeGreaterThan(0);
    expect(within(drawer).getByTestId("catalog-detail-colors")).toBeInTheDocument();
    expect(within(drawer).getByTestId("catalog-detail-elements")).toBeInTheDocument();
  });
});
