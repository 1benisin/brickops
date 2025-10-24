"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { PartIdentificationResult } from "@/lib/services/part-identification-service";
import type { CatalogPart } from "@/types/catalog";
import { PartIdentificationService } from "@/lib/services/part-identification-service";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Search, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";

// ============================================================================
// Types
// ============================================================================

export type UnifiedSearchResult = {
  source: "camera" | "search";
  items: UnifiedResultItem[];
  confidence?: number; // Only for camera results
};

export type UnifiedResultItem = {
  id: string; // part number
  name: string;
  category: string | null;
  imageUrl: string | null;
  score?: number; // Only for camera results
  externalSites?: { name: string; url: string }[];
};

interface SearchOrCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResults: (results: UnifiedSearchResult) => void;
  onError: (error: string) => void;
}

type CaptureStage =
  | "requesting_permissions"
  | "initializing_camera"
  | "ready"
  | "capturing"
  | "uploading"
  | "identifying"
  | "complete"
  | "error";

// ============================================================================
// Constants
// ============================================================================

const MIN_CAPTURE_WIDTH = 640;
const MIN_CAPTURE_HEIGHT = 480;
const CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.9;

// ============================================================================
// Utility Functions
// ============================================================================

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to capture image from video stream"));
        }
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });

/**
 * Transform Brickognize camera results to unified format
 */
function transformCameraResults(brickognizeResult: PartIdentificationResult): UnifiedSearchResult {
  return {
    source: "camera",
    items: brickognizeResult.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category ?? null,
      imageUrl: item.imageUrl ?? null,
      score: item.score,
      externalSites: item.externalSites,
    })),
    confidence: brickognizeResult.topScore,
  };
}

/**
 * Transform catalog search results to unified format
 */
function transformCatalogResults(catalogParts: CatalogPart[]): UnifiedSearchResult {
  return {
    source: "search",
    items: catalogParts.map((part) => ({
      id: part.partNumber,
      name: part.name,
      category: part.categoryId ? "Unknown" : null, // Could fetch category name if needed
      imageUrl: part.thumbnailUrl ?? part.imageUrl ?? null,
      score: undefined, // No confidence for text search
      externalSites: undefined,
    })),
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function SearchOrCaptureDialog({
  open,
  onOpenChange,
  onResults,
  onError,
}: SearchOrCaptureDialogProps) {
  // Tab persistence with localStorage
  const [activeTab, setActiveTab] = useLocalStorage<"camera" | "search">(
    "inventory-add-method",
    "camera",
  );

  // Handle tab change with type safety
  const handleTabChange = (value: string) => {
    if (value === "camera" || value === "search") {
      setActiveTab(value);
    }
  };

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const service = useMemo(() => new PartIdentificationService(), []);
  const [cameraStage, setCameraStage] = useState<CaptureStage>("requesting_permissions");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("Requesting camera access...");

  // Search state
  const [partName, setPartName] = useState("");
  const [partNumber, setPartNumber] = useState("");

  // Cleanup camera stream
  const cleanupStream = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize camera when camera tab is active
  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      try {
        cleanupStream();

        if (!mounted) return;

        setCameraStage("initializing_camera");
        setStatusMessage("Starting camera...");

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: "environment", // Use rear camera on mobile
            width: { ideal: CAPTURE_WIDTH },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playError) {
            if (!mounted) return;
            throw playError;
          }
        }

        if (mounted) {
          setCameraStage("ready");
          setStatusMessage("Ready to capture");
          setProgress(0);
        }
      } catch (err) {
        if (!mounted) return;

        const errorMessage =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access in your browser settings."
              : err.name === "NotFoundError"
                ? "No camera found on this device."
                : `Camera error: ${err.message}`
            : "Failed to access camera";

        setCameraError(errorMessage);
        setCameraStage("error");
        onError(errorMessage);
      }
    };

    // Only initialize if sheet is open AND camera tab is active
    if (open && activeTab === "camera") {
      void initCamera();
    }

    return () => {
      mounted = false;
      cleanupStream();
    };
  }, [open, activeTab, onError, cleanupStream]);

  // Handle camera capture
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) {
      setCameraError("Camera not ready");
      return;
    }

    try {
      setCameraStage("capturing");
      setStatusMessage("Capturing image...");
      setProgress(10);

      // Create canvas and capture frame
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (videoWidth < MIN_CAPTURE_WIDTH || videoHeight < MIN_CAPTURE_HEIGHT) {
        throw new Error("Video resolution too low for capture");
      }

      // Scale down if needed
      const scale = Math.min(1, CAPTURE_WIDTH / videoWidth);
      canvas.width = videoWidth * scale;
      canvas.height = videoHeight * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas);

      // Stop camera after capture
      cleanupStream();

      // Upload to Convex
      setCameraStage("uploading");
      setStatusMessage("Uploading image...");
      setProgress(30);

      const uploadUrl = await service.generateUploadUrl();
      setProgress(45);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "image/jpeg",
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Image upload failed");
      }

      const payload = (await uploadResponse.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload response missing storage reference");
      }

      // Identify part
      setCameraStage("identifying");
      setStatusMessage("Identifying part...");
      setProgress(70);

      const identification = await service.identifyPartFromImage({
        storageId: payload.storageId as Id<"_storage">,
      });

      setProgress(100);
      setCameraStage("complete");
      setStatusMessage("Identification complete!");

      // Transform and send results
      const unifiedResults = transformCameraResults(identification);
      onResults(unifiedResults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Capture failed";
      setCameraError(errorMessage);
      setCameraStage("error");
      onError(errorMessage);
    }
  }, [cleanupStream, onError, onResults, service]);

  // Catalog search query
  const searchArgs = useMemo(() => {
    const trimmedName = partName.trim();
    const trimmedNumber = partNumber.trim();

    // Skip query if no search terms
    if (!trimmedName && !trimmedNumber) return "skip";

    return {
      partTitle: trimmedName || undefined,
      partId: trimmedNumber || undefined,
    };
  }, [partName, partNumber]);

  const { results: searchResults } = usePaginatedQuery(
    api.catalog.queries.searchParts,
    searchArgs,
    { initialNumItems: 10 },
  );

  // Handle search submission
  const handleSearchSubmit = useCallback(() => {
    if (!searchResults || searchResults.length === 0) {
      onError("No parts found. Try a different search term.");
      return;
    }

    const unifiedResults = transformCatalogResults(searchResults);
    onResults(unifiedResults);
  }, [searchResults, onResults, onError]);

  // Spacebar shortcut for camera capture
  const canCapture = cameraStage === "ready";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code === "Space" || event.key === " ") && canCapture && activeTab === "camera") {
        event.preventDefault();
        void handleCapture();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCapture, activeTab, handleCapture]);

  const isProcessing = ["capturing", "uploading", "identifying"].includes(cameraStage);
  const hasSearchResults = searchResults && searchResults.length > 0;
  const hasSearchInput = partName.trim() || partNumber.trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh]">
        <div className="h-full flex flex-col">
          <SheetTitle>Add Inventory Item</SheetTitle>
          <SheetDescription>Capture a photo or search by part name/number</SheetDescription>

          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex-1 flex flex-col mt-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="camera">
                <Camera className="h-4 w-4 mr-2" />
                Camera
              </TabsTrigger>
              <TabsTrigger value="search">
                <Search className="h-4 w-4 mr-2" />
                Search
              </TabsTrigger>
            </TabsList>

            {/* Camera Tab */}
            <TabsContent value="camera" className="flex flex-col mt-4 space-y-4">
              {/* Camera View */}
              <div className="relative flex items-center justify-center bg-black rounded-lg overflow-hidden min-h-[300px] max-h-[60vh]">
                {cameraStage === "error" ? (
                  <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                    <AlertCircle className="h-12 w-12 text-destructive" />
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-white">Camera Error</h3>
                      <p className="text-sm text-gray-300 max-w-md">{cameraError}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={cn(
                        "w-full h-full object-cover",
                        cameraStage === "ready" ? "opacity-100" : "opacity-50",
                      )}
                    />

                    {/* Loading overlay */}
                    {isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                        <div className="w-full max-w-xs space-y-4 px-6">
                          <div className="text-center space-y-2">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
                            <p className="text-white font-medium">{statusMessage}</p>
                          </div>
                          <Progress value={progress} className="w-full" />
                          <p className="text-xs text-gray-300 text-center">{progress}% complete</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Capture Button */}
              {canCapture && (
                <Button
                  onClick={handleCapture}
                  disabled={!canCapture}
                  size="lg"
                  className="w-full h-16 text-lg font-semibold flex-shrink-0"
                >
                  <Camera className="h-6 w-6 mr-2" />
                  Capture Part
                </Button>
              )}

              {/* Status message */}
              {!isProcessing && cameraStage !== "error" && cameraStage !== "ready" && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground text-center">{statusMessage}</p>
                </div>
              )}
            </TabsContent>

            {/* Search Tab */}
            <TabsContent value="search" className="flex flex-col mt-4 space-y-4">
              {/* Search Form - Fixed at top */}
              <div className="flex-shrink-0">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <label htmlFor="part-name" className="text-sm font-medium">
                      Part Name
                    </label>
                    <div className="relative">
                      <Input
                        id="part-name"
                        type="text"
                        placeholder="Search by part name..."
                        value={partName}
                        onChange={(e) => {
                          setPartName(e.target.value);
                          if (e.target.value) setPartNumber(""); // Clear other field
                        }}
                        disabled={!!partNumber}
                        className="pr-8"
                      />
                      {partName && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-2"
                          onClick={() => setPartName("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center self-end pb-2 text-sm text-muted-foreground">
                    <span>or</span>
                  </div>

                  <div className="flex-1 space-y-2">
                    <label htmlFor="part-number" className="text-sm font-medium">
                      Part Number
                    </label>
                    <div className="relative">
                      <Input
                        id="part-number"
                        type="text"
                        placeholder="Search by part number..."
                        value={partNumber}
                        onChange={(e) => {
                          setPartNumber(e.target.value);
                          if (e.target.value) setPartName(""); // Clear other field
                        }}
                        disabled={!!partName}
                        className="pr-8"
                      />
                      {partNumber && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-2"
                          onClick={() => setPartNumber("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Search Results Preview */}
              <div className="flex-1 overflow-y-auto">
                {!hasSearchInput ? (
                  <div className="flex items-center justify-center h-full p-6 text-center">
                    <div className="space-y-2">
                      <Search className="h-12 w-12 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        Start typing to search for parts
                      </p>
                    </div>
                  </div>
                ) : !hasSearchResults ? (
                  <div className="flex items-center justify-center h-full p-6 text-center">
                    <div className="space-y-2">
                      <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        No results found. Try a different search term.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Found {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                    </p>
                    <div className="space-y-1 text-sm">
                      {searchResults.slice(0, 5).map((part) => (
                        <div key={part.partNumber} className="p-2 bg-muted rounded">
                          <div className="font-medium">{part.name}</div>
                          <div className="text-xs text-muted-foreground">{part.partNumber}</div>
                        </div>
                      ))}
                      {searchResults.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                          + {searchResults.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Search Button */}
              <Button
                onClick={handleSearchSubmit}
                disabled={!hasSearchResults}
                size="lg"
                className="w-full h-16 text-lg font-semibold"
              >
                <Search className="h-6 w-6 mr-2" />
                View Results
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
