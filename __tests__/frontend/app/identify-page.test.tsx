/// <reference types="@testing-library/jest-dom" />
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import IdentifyPage from "@/app/(authenticated)/identify/page";
import { useQuery } from "convex/react";

jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: jest.fn(),
  };
});

jest.mock("@/lib/services/part-identification-service", () => {
  const actual = jest.requireActual("@/lib/services/part-identification-service");
  type IdentifyResult = Awaited<
    ReturnType<(typeof actual.PartIdentificationService)["prototype"]["identifyPartFromImage"]>
  >;

  const mockResult: IdentifyResult = {
    provider: "brickognize",
    listingId: null,
    durationMs: 1200,
    requestedAt: Date.now(),
    boundingBox: null,
    items: [],
    topScore: 0,
    lowConfidence: false,
  };

  return {
    __esModule: true,
    ...actual,
    PartIdentificationService: jest.fn().mockImplementation(() => ({
      generateUploadUrl: jest.fn().mockResolvedValue("https://mock-storage/upload"),
      identifyPartFromImage: jest.fn().mockResolvedValue(mockResult),
    })),
  };
});

describe("IdentifyPage", () => {
  const mockedUseQuery = useQuery as jest.Mock;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue({
      user: {
        _id: "users:1",
      },
      businessAccount: {
        _id: "businessAccounts:1",
      },
    });
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(window.navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
      writable: true,
    });
  });

  beforeAll(() => {
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      value: jest.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
  });

  it("renders heading and primary workflow actions", () => {
    renderWithProviders(<IdentifyPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Identify Parts");
    expect(screen.getByTestId("identify-primary")).toHaveTextContent("Enable camera");
  });

  it("surfaces offline status to the operator", () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    renderWithProviders(<IdentifyPage />);

    expect(screen.getByTestId("identify-network-status")).toHaveTextContent("Offline");
  });

  it("requests camera access when the operator enables the camera", async () => {
    const startCamera = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "mediaDevices", {
      value: {
        getUserMedia: startCamera,
      },
      configurable: true,
      writable: true,
    });

    renderWithProviders(<IdentifyPage />);

    const enableButton = screen.getByTestId("identify-primary");
    await act(async () => {
      fireEvent.click(enableButton);
    });

    expect(startCamera).toHaveBeenCalledTimes(1);
  });
});
