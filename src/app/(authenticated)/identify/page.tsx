"use client";

import { CameraIdentificationPanel } from "@/components/identify/camera-identification-panel";

export default function IdentifyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Identify Parts</h1>
        <p className="text-sm text-muted-foreground">
          Capture LEGO® parts with your camera, send images through Brickognize, and review
          confidence-rated matches before adding them to inventory.
        </p>
      </div>
      <CameraIdentificationPanel />
    </div>
  );
}
