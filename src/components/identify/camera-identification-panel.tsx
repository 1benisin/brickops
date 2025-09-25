"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  PartIdentificationError,
  PartIdentificationResult,
} from "@/lib/services/part-identification-service";
import { PartIdentificationService } from "@/lib/services/part-identification-service";
import { cn } from "@/lib/utils";

type WorkflowStage =
  | "idle"
  | "initializing"
  | "ready"
  | "captured"
  | "uploading"
  | "identifying"
  | "result"
  | "error";

interface CapturedImage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  timestamp: number;
}

interface IdentificationAttempt {
  id: string;
  imageDataUrl: string;
  timestamp: number;
  result: PartIdentificationResult | null;
}

const MIN_CAPTURE_WIDTH = 640;
const MIN_CAPTURE_HEIGHT = 480;
const CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 0.9;

const formatConfidence = (score: number) => `${Math.round(score * 100)}%`;

const createAttemptId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}`;
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
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

export function CameraIdentificationPanel() {
  const currentUser = useQuery(api.functions.users.getCurrentUser);
  const businessAccountId = currentUser?.businessAccount?._id;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const service = useMemo(() => new PartIdentificationService(), []);

  const [stage, setStage] = useState<WorkflowStage>("idle");
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [result, setResult] = useState<PartIdentificationResult | null>(null);
  const [attempts, setAttempts] = useState<IdentificationAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera access is not supported in this browser.");
      setStage("error");
      return;
    }

    setError(null);
    setStatusMessage("Requesting camera access…");
    setStage("initializing");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: CAPTURE_WIDTH },
          height: { ideal: Math.floor((CAPTURE_WIDTH * 3) / 4) },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatusMessage("Camera ready. Frame your part and capture when ready.");
      setStage("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to access the camera.";
      setError(message.includes("denied") ? "Camera permissions were denied." : message);
      setStage("error");
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    setError(null);
    const video = videoRef.current;
    if (!video) {
      setError("Camera is not ready yet.");
      return;
    }

    if (video.videoWidth < MIN_CAPTURE_WIDTH || video.videoHeight < MIN_CAPTURE_HEIGHT) {
      setError("Captured image is too small. Move closer to the part and try again.");
      return;
    }

    const aspectRatio = video.videoWidth / video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_WIDTH;
    canvas.height = Math.round(canvas.width / aspectRatio);

    const context = canvas.getContext("2d");
    if (!context) {
      setError("Browser is unable to capture an image from the camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await toBlob(canvas);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const nextCapture: CapturedImage = {
        blob,
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now(),
      };
      setCapturedImage(nextCapture);
      setStatusMessage("Image captured. Review and identify when ready.");
      setStage("captured");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to capture image";
      setError(message);
      setStage("error");
    }
  }, []);

  const resetToCapture = useCallback(() => {
    setCapturedImage(null);
    setResult(null);
    setStatusMessage("Frame the part and capture a new photo.");
    setError(null);
    setStage(streamRef.current ? "ready" : "idle");
  }, []);

  const identify = useCallback(async () => {
    if (!capturedImage) {
      setError("Capture an image before identifying.");
      return;
    }

    if (!businessAccountId) {
      setError("Business context is still loading. Try again in a moment.");
      return;
    }

    if (isOffline) {
      setError("You are offline. Reconnect to identify parts.");
      return;
    }

    setStatusMessage("Generating secure upload link…");
    setStage("uploading");
    setProgress(15);
    setError(null);

    let storageId: string | null = null;

    try {
      const uploadUrl = await service.generateUploadUrl();
      setProgress(35);
      setStatusMessage("Uploading image to BrickOps…");

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": capturedImage.blob.type || "image/jpeg",
        },
        body: capturedImage.blob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Image upload failed");
      }

      const payload = (await uploadResponse.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload response missing storage reference");
      }

      storageId = payload.storageId;
      setProgress(60);
      setStatusMessage("Identifying parts via Brickognize…");
      setStage("identifying");

      const identification = await service.identifyPartFromImage({
        storageId,
        businessAccountId,
      });

      setResult(identification);
      setProgress(100);
      setStatusMessage(
        identification.lowConfidence
          ? "Identification completed with low confidence. Consider retaking the photo."
          : "Identification complete. Review the suggested matches.",
      );

      setAttempts((prev) => {
        const nextAttempt: IdentificationAttempt = {
          id: createAttemptId(),
          imageDataUrl: capturedImage.dataUrl,
          timestamp: capturedImage.timestamp,
          result: identification,
        };
        return [nextAttempt, ...prev].slice(0, 5);
      });

      setStage("result");
    } catch (err) {
      const normalized: PartIdentificationError = err as PartIdentificationError;
      const message = normalized?.message ?? "Identification failed. Please try again.";
      setError(message);
      setStage("error");
    } finally {
      setTimeout(() => setProgress(0), 400);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  }, [businessAccountId, capturedImage, isOffline, service]);

  const showVideo = stage === "ready" || stage === "initializing";
  const showPreview =
    stage === "captured" || stage === "uploading" || stage === "identifying" || stage === "result";
  const isProcessingStage = stage === "uploading" || stage === "identifying";

  const primaryActionLabel = useMemo(() => {
    if (stage === "idle" || stage === "error") {
      return "Enable camera";
    }
    if (stage === "ready") {
      return "Capture photo";
    }
    if (stage === "captured" || stage === "result") {
      return "Retake";
    }
    return "Enable camera";
  }, [stage]);

  const handlePrimaryAction = useCallback(() => {
    if (stage === "idle" || stage === "error") {
      void startCamera();
      return;
    }

    if (stage === "ready") {
      void capturePhoto();
      return;
    }

    if (stage === "captured" || stage === "result") {
      resetToCapture();
    }
  }, [capturePhoto, resetToCapture, stage, startCamera]);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Camera capture</CardTitle>
            <CardDescription>
              Position the LEGO® part within the frame, capture a clear photo, and let Brickognize
              suggest matching parts with confidence scores.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border bg-background">
              {showVideo ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="aspect-video w-full bg-muted object-cover"
                  data-testid="identify-video"
                />
              ) : null}

              {showPreview && capturedImage ? (
                <img
                  src={capturedImage.dataUrl}
                  alt="Captured LEGO part"
                  className="aspect-video w-full bg-muted object-cover"
                  data-testid="identify-preview"
                />
              ) : null}

              {stage === "idle" ? (
                <div className="absolute inset-0 grid place-content-center bg-background/70 text-center">
                  <p className="text-sm text-muted-foreground">
                    Enable your camera to begin identifying parts.
                  </p>
                </div>
              ) : null}
            </div>

            {progress > 0 ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}

            {statusMessage ? (
              <p className="text-sm text-muted-foreground" data-testid="identify-status">
                {statusMessage}
              </p>
            ) : null}

            {error ? (
              <div
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
                data-testid="identify-error"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handlePrimaryAction}
                disabled={isProcessingStage}
                data-testid="identify-primary"
              >
                {primaryActionLabel}
              </Button>

              {stage === "captured" || stage === "result" ? (
                <Button
                  variant="outline"
                  onClick={() => identify()}
                  disabled={isProcessingStage || isOffline}
                  data-testid="identify-submit"
                >
                  {isProcessingStage ? "Processing…" : "Identify"}
                </Button>
              ) : null}

              {isOffline ? (
                <span className="text-sm text-muted-foreground" data-testid="identify-offline">
                  Offline mode: identification disabled until connection is restored.
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identification results</CardTitle>
            <CardDescription>
              Review Brickognize matches with their confidence levels. Low confidence results are
              highlighted for manual verification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stage === "uploading" || stage === "identifying" ? (
              <div className="space-y-2" data-testid="identify-loading">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}

            {result ? (
              <div className="space-y-4" data-testid="identify-result">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Top confidence</p>
                    <p
                      className={cn("text-xl font-semibold", {
                        "text-warning": result.lowConfidence,
                        "text-foreground": !result.lowConfidence,
                      })}
                      data-testid="identify-confidence"
                    >
                      {formatConfidence(result.topScore)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{(result.durationMs / 1000).toFixed(1)}s processing</p>
                    {result.listingId ? <p>Listing: {result.listingId}</p> : null}
                  </div>
                </div>

                {result.lowConfidence ? (
                  <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
                    Confidence is below the automated acceptance threshold. Retake the photo or
                    compare with reference images before adding to inventory.
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {result.items.map((item) => (
                    <li key={`${item.id}-${item.score}`} className="rounded-lg border px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            #{item.id} · {item.category ?? "Unknown category"}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-primary">
                          {formatConfidence(item.score)}
                        </span>
                      </div>
                      {item.externalSites?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {item.externalSites.map((site) => (
                            <a
                              key={site.url}
                              href={site.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              {site.name}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!result && stage !== "identifying" && stage !== "uploading" ? (
              <p className="text-sm text-muted-foreground">
                Capture a part and run identification to see Brickognize results with confidence
                scores.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent attempts</CardTitle>
            <CardDescription>
              Compare the latest captures and review confidence scores before adding parts to your
              inventory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {attempts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent attempts yet.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {attempts.map((attempt) => (
                  <li key={attempt.id} className="space-y-2">
                    <img
                      src={attempt.imageDataUrl}
                      alt="Previous identification attempt"
                      className="aspect-video w-full rounded-md border object-cover"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(attempt.timestamp).toLocaleTimeString()}</span>
                      {attempt.result ? (
                        <span>{formatConfidence(attempt.result.topScore)}</span>
                      ) : (
                        <span>Pending</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Capture checklist</CardTitle>
            <CardDescription>
              Follow these hints to stay within the ≤5s identification goal and improve accuracy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="space-y-2">
              <li>Ensure good lighting and avoid harsh shadows.</li>
              <li>Fill most of the frame with the part; keep background simple.</li>
              <li>Hold the camera steady until capture completes.</li>
              <li>Retake if the preview looks blurry or cropped.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connection status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {businessAccountId
                ? `Identifying for business account ${businessAccountId}`
                : "Loading business account context…"}
            </p>
            <p
              className={cn("text-sm font-medium", isOffline ? "text-warning" : "text-success")}
              data-testid="identify-network-status"
            >
              {isOffline ? "Offline" : "Online"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
