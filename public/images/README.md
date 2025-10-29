Place `missing-part.png` here.

Guidance:

- Recommended: square PNG, transparent background, ~256x256 (or higher, it will be resized).
- Path used by the app: `/images/missing-part.png`.

## Color part images

The app now loads BrickLink color-part images directly from the CDN; no server cache is used.

- URL pattern: `https://img.bricklink.com/P/{colorId}/{partNumber}.jpg`
- Example: `https://img.bricklink.com/P/2/2357.jpg`
- Rendering: handled by the reusable `src/components/common/ColorPartImage.tsx` using Next.js Image
- Fallback: if the CDN returns an error (e.g., 404), the component displays `/images/missing-part.png`

No backend tables or actions are required for color images.
