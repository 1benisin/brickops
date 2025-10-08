/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CatalogPage from "@/app/(authenticated)/catalog/page";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import type { CatalogSearchResult, CatalogPartDetails } from "@/types/catalog";

// Type to avoid using 'any' for mock checks
type MockedConvexFunction = {
  name: string;
};

jest.mock("@/hooks/useSearchStore", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  type StoreState = {
    sortLocation: string;
    partTitle: string;
    partId: string;
    page: number;
    pageSize: number;
    sort: { field: "name" | "lastUpdated"; direction: "asc" | "desc" } | null;
  };

  let state: StoreState = {
    sortLocation: "",
    partTitle: "",
    partId: "",
    page: 1,
    pageSize: 25,
    sort: null,
  };

  const listeners = new Set<() => void>();

  const setState = (updater: Partial<StoreState> | ((prev: StoreState) => Partial<StoreState>)) => {
    const next = typeof updater === "function" ? updater(state) : updater;
    const updated: StoreState = {
      ...state,
      ...next,
      sort: next.sort ?? state.sort,
    };
    updated.sort = updated.sort ? { ...updated.sort } : null;
    state = updated;
    listeners.forEach((listener) => listener());
  };

  const actions = {
    setSortLocation: (value: string) => setState({ sortLocation: value, page: 1 }),
    setPartTitle: (value: string) => setState({ partTitle: value, page: 1 }),
    setPartId: (value: string) => setState({ partId: value, page: 1 }),
    setPage: (page: number) => setState({ page }),
    setPageSize: (pageSize: number) =>
      setState((prev) => ({
        pageSize,
        page: prev.pageSize === pageSize ? prev.page : 1,
      })),
    setSort: (sort: { field: "name" | "lastUpdated"; direction: "asc" | "desc" } | null) =>
      setState({ sort, page: 1 }),
    setFilters: (
      filters: Partial<
        Pick<StoreState, "sortLocation" | "partTitle" | "partId" | "sort" | "pageSize">
      >,
    ) =>
      setState((prev) => ({
        sortLocation: filters.sortLocation ?? prev.sortLocation,
        partTitle: filters.partTitle ?? prev.partTitle,
        partId: filters.partId ?? prev.partId,
        sort: filters.sort ?? prev.sort,
        pageSize: filters.pageSize ?? prev.pageSize,
        page: 1,
      })),
    resetFilters: () =>
      setState({
        sortLocation: "",
        partTitle: "",
        partId: "",
        page: 1,
        pageSize: 25,
        sort: null,
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
      return () => {
        listeners.delete(listener);
      };
    }, [selector]);

    return slice;
  };

  const useSearchSelector = <U,>(selector: (store: StoreSnapshot) => U) => useSearchStore(selector);

  const reset = () => {
    state = {
      sortLocation: "",
      partTitle: "",
      partId: "",
      page: 1,
      pageSize: 25,
      sort: null,
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

// metadata removed from API: no-op placeholder removed

const mockTimestamp = Date.now();

const searchResults: Record<string, CatalogSearchResult> = {
  first: {
    page: [
      {
        partNumber: "3001",
        name: "Brick 2 x 4",
        type: "PART" as const,
        categoryId: 100,
        alternateNo: undefined,
        imageUrl: "",
        thumbnailUrl: undefined,
        weight: undefined,
        dimX: undefined,
        dimY: undefined,
        dimZ: undefined,
        yearReleased: undefined,
        description: "Standard brick",
        isObsolete: false,
        lastFetched: mockTimestamp,
      },
    ],
    isDone: false,
    continueCursor: "cursor-2",
  },
  "cursor-2": {
    page: [
      {
        partNumber: "3002",
        name: "Brick 2 x 3",
        type: "PART" as const,
        categoryId: 100,
        alternateNo: undefined,
        imageUrl: "",
        thumbnailUrl: undefined,
        weight: undefined,
        dimX: undefined,
        dimY: undefined,
        dimZ: undefined,
        yearReleased: undefined,
        description: "Another brick",
        isObsolete: false,
        lastFetched: mockTimestamp,
      },
    ],
    isDone: true,
    continueCursor: "",
  },
};

const detailResult = {
  partNumber: "3001",
  name: "Brick 2 x 4",
  type: "PART" as const,
  categoryId: 100,
  category: "Bricks",
  bricklinkPartId: "3001",
  imageUrl: "",
  thumbnailUrl: undefined,
  weight: undefined,
  dimX: undefined,
  dimY: undefined,
  dimZ: undefined,
  yearReleased: undefined,
  description: "Standard brick",
  isObsolete: false,
  lastFetched: mockTimestamp,
  colorAvailability: [
    {
      colorId: 1,
      color: {
        name: "White",
        rgb: "FFFFFF",
      },
    },
  ],
} as unknown as CatalogPartDetails;

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
    useMutation: jest.fn((mutationFn: unknown) => {
      // Allow specific mocks based on the function path
      // This makes tests more robust to module changes
      if (
        typeof mutationFn === "function" &&
        (mutationFn as MockedConvexFunction).name === "refreshCatalogEntries"
      ) {
        return mockMutation;
      }
      return mockMutation; // Default for others
    }),
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
    expect(screen.getByTestId("catalog-search-title")).toBeInTheDocument();
    expect(await screen.findByTestId("catalog-results-grid")).toBeInTheDocument();
    expect(await screen.findByTestId("catalog-result-card-3001")).toBeInTheDocument();
  });

  it("supports pagination controls", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    await screen.findByTestId("catalog-results-grid");

    await act(async () => {
      await user.click(screen.getByTestId("catalog-next-page"));
    });

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

  it("preserves the selected page when navigating and resets after search changes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogPage />);

    await screen.findByTestId("catalog-results-grid");

    await act(async () => {
      await user.click(screen.getByTestId("catalog-next-page"));
    });

    expect(await screen.findByText(/Page\s*2/)).toBeInTheDocument();

    const titleInput = await screen.findByTestId("catalog-search-title");
    await act(async () => {
      await user.type(titleInput, " brick");
    });

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

    await act(async () => {
      await user.click(await screen.findByTestId("catalog-result-card-3001"));
    });

    const drawer = await screen.findByTestId("catalog-detail-content");
    const headings = await screen.findAllByText(/Brick 2 x 4/);
    expect(headings.length).toBeGreaterThan(0);
    expect(within(drawer).getByTestId("catalog-detail-colors")).toBeInTheDocument();
    expect(within(drawer).getByTestId("catalog-detail-elements")).toBeInTheDocument();
  });
});
