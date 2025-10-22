"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { PartIdentificationResult } from "@/lib/services/part-identification-service";
import { PartIdentificationService } from "@/lib/services/part-identification-service";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Camera, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type CaptureStage =
  | "requesting_permissions"
  | "initializing_camera"
  | "ready"
  | "capturing"
  | "uploading"
  | "identifying"
  | "complete"
  | "error";

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessAccountId: Id<"businessAccounts">;
  onResults: (results: PartIdentificationResult) => void;
  onError: (error: string) => void;
}

const MIN_CAPTURE_WIDTH = 640;
const MIN_CAPTURE_HEIGHT = 480;
const CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.9;

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

export function CameraCapture({
  open,
  onOpenChange,
  businessAccountId,
  onResults,
  onError,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const service = useMemo(() => new PartIdentificationService(), []);

  const [stage, setStage] = useState<CaptureStage>("requesting_permissions");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("Requesting camera access...");

  const cleanupStream = useCallback(() => {
    // Pause and clear video element first
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    // Then stop and clear the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize camera on mount with cleanup
  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      try {
        // Clean up any existing stream first
        cleanupStream();

        if (!mounted) return;

        setStage("initializing_camera");
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
          // Component unmounted during async operation, clean up silently
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (playError) {
            // Ignore play errors if component unmounted - this is expected during cleanup
            if (!mounted) return;
            throw playError;
          }
        }

        if (mounted) {
          setStage("ready");
          setStatusMessage("Ready to capture");
          setProgress(0);
        }
      } catch (err) {
        // Don't report errors if component is unmounting - this is expected
        if (!mounted) return;

        const errorMessage =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "Camera permission denied. Please allow camera access in your browser settings."
              : err.name === "NotFoundError"
                ? "No camera found on this device."
                : `Camera error: ${err.message}`
            : "Failed to access camera";

        setError(errorMessage);
        setStage("error");
        onError(errorMessage);
      }
    };

    // Only initialize if the sheet is actually open
    if (open) {
      void initCamera();
    }

    // Cleanup function
    return () => {
      mounted = false;
      cleanupStream();
    };
  }, [open, onError, cleanupStream]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) {
      setError("Camera not ready");
      return;
    }

    try {
      setStage("capturing");
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
      setStage("uploading");
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
      setStage("identifying");
      setStatusMessage("Identifying part...");
      setProgress(70);

      const identification = await service.identifyPartFromImage({
        storageId: payload.storageId as Id<"_storage">,
        businessAccountId,
      });

      setProgress(100);
      setStage("complete");
      setStatusMessage("Identification complete!");

      // Call success handler
      onResults(identification);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Capture failed";
      setError(errorMessage);
      setStage("error");
      onError(errorMessage);
    }
  }, [businessAccountId, cleanupStream, onError, onResults, service]);

  const isProcessing = ["capturing", "uploading", "identifying"].includes(stage);
  const canCapture = stage === "ready";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code === "Space" || event.key === " ") && canCapture) {
        event.preventDefault();
        void handleCapture();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCapture, handleCapture]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <div className="mx-auto w-full sm:w-[60vw] space-y-4">
          <SheetTitle className="sr-only">Camera Capture</SheetTitle>
          <SheetDescription>
            Take a photo of a LEGO part to identify it. Use capture button or hit spacebar to take
            photo.
          </SheetDescription>

          {/* Camera View */}
          <div className="flex-1 relative flex items-center justify-center bg-black">
            {stage === "error" ? (
              <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">Camera Error</h3>
                  <p className="text-sm text-gray-300 max-w-md">{error}</p>
                </div>
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
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
                    stage === "ready" ? "opacity-100" : "opacity-50",
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
              className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90"
            >
              <Camera className="h-6 w-6 mr-2" />
              Capture Part
            </Button>
          )}

          {/* Status message for non-processing stages */}
          {!isProcessing && stage !== "error" && stage !== "ready" && (
            <div className="p-4 bg-black/80 backdrop-blur-sm">
              <p className="text-sm text-gray-300 text-center">{statusMessage}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
