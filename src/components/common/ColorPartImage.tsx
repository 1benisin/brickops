"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type ColorPartImageProps = {
  partNumber: string | null;
  colorId: number | string | null;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  unoptimized?: boolean;
  asThumbnail?: boolean;
};

const FALLBACK_SRC = "/images/missing-part.png";

type ImageLoadError = "primary" | "secondary";

export function ColorPartImage(props: ColorPartImageProps) {
  const {
    partNumber,
    colorId,
    alt,
    fill,
    width,
    height,
    sizes,
    className,
    priority,
    unoptimized,
    asThumbnail = false,
  } = props;

  const normalizedColorId = useMemo(() => {
    if (colorId == null) return null;
    if (typeof colorId === "number") return colorId;
    const parsed = parseInt(colorId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [colorId]);

  const [errorType, setErrorType] = useState<ImageLoadError | null>(null);

  // Compose BrickLink CDN URLs
  const thumbnailUrl =
    partNumber && normalizedColorId != null
      ? `https://img.bricklink.com/P/${normalizedColorId}/${partNumber}.jpg`
      : undefined;

  const largerUrl =
    partNumber && normalizedColorId != null
      ? `https://img.bricklink.com/ItemImage/PN/${normalizedColorId}/${partNumber}.png`
      : undefined;

  // Determine which URL to use based on preference
  const primaryUrl = useMemo(() => {
    if (!partNumber || normalizedColorId == null) return undefined;
    return asThumbnail ? thumbnailUrl : largerUrl;
  }, [asThumbnail, thumbnailUrl, largerUrl, partNumber, normalizedColorId]);

  const fallbackUrl = useMemo(() => {
    if (!partNumber || normalizedColorId == null) return undefined;
    return asThumbnail ? largerUrl : thumbnailUrl;
  }, [asThumbnail, thumbnailUrl, largerUrl, partNumber, normalizedColorId]);

  // Determine final src to use with fallback chain
  const srcToUse = useMemo(() => {
    if (!primaryUrl) return FALLBACK_SRC;
    if (errorType === "primary" && fallbackUrl) return fallbackUrl;
    if (errorType === "secondary" || !fallbackUrl) return FALLBACK_SRC;
    return primaryUrl;
  }, [primaryUrl, fallbackUrl, errorType]);

  const handleError = () => {
    if (primaryUrl && errorType === null) {
      // Primary image failed, try fallback
      setErrorType("primary");
    } else if (fallbackUrl) {
      // Both images failed, show missing part image
      setErrorType("secondary");
    }
  };

  const common = {
    className: className || "rounded-lg object-contain",
    priority,
    unoptimized,
    sizes,
    onError: handleError,
  } as const;

  if (fill) {
    return <Image src={srcToUse} alt={alt} fill {...common} />;
  }

  // Width/height path (non-fill)
  return <Image src={srcToUse} alt={alt} width={width} height={height} {...common} />;
}

export default ColorPartImage;
