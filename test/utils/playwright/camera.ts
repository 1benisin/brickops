import type { Page } from "@playwright/test";

export const enableMockCamera = async (page: Page) => {
  await page.addInitScript(() => {
    // Ensure navigator.mediaDevices exists
    const mediaDevices = navigator.mediaDevices ?? ({} as MediaDevices);

    // Create a mock video track using a canvas stream so getVideoTracks() > 0
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0f0";
      ctx.fillRect(8, 8, 16, 16);
    }
    const stream = (canvas as HTMLCanvasElement).captureStream(15);

    Object.assign(mediaDevices, {
      getUserMedia: () => Promise.resolve(stream),
      enumerateDevices: () =>
        Promise.resolve([
          {
            deviceId: "mock-camera",
            groupId: "brickops",
            kind: "videoinput",
            label: "Mock Camera",
            toJSON() {
              return this;
            },
          } as MediaDeviceInfo,
        ]),
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: mediaDevices,
    });
  });
};

export const evaluateCameraTracks = async (page: Page) => {
  return page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    return stream.getVideoTracks().length;
  });
};
