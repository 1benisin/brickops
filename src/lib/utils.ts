import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// -------------------- Color utilities --------------------

type RGB = [number, number, number];

/**
 * Converts a CSS color string to an RGB array.
 * Supports hex colors (#RRGGBB) and any valid CSS color via browser parsing.
 * @param input - A color string (hex, rgb(), hsl(), named color, etc.)
 * @returns RGB array [r, g, b] where each component is 0-255
 * @throws Error if color format is unsupported or invalid
 */
export function toRgb(input: string): RGB {
  // Handle hex colors
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  // Parse any valid CSS color using the browser
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.style.color = input;
    document.body.appendChild(el);
    const cs = getComputedStyle(el).color; // "rgb(r,g,b)" or "rgba(r,g,b,a)"
    document.body.removeChild(el);
    const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
      return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    }
  }

  throw new Error(`Unsupported color: ${input}`);
}

/**
 * Calculates the relative luminance of an RGB color according to WCAG 2.0.
 * Used to determine contrast ratios between colors.
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Relative luminance value (0-1), where 0 is black and 1 is white
 * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function relLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map((v) => v / 255);
  const linear = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/**
 * Calculates the contrast ratio between two luminance values according to WCAG 2.0.
 * @param L1 - Relative luminance of first color (0-1)
 * @param L2 - Relative luminance of second color (0-1)
 * @returns Contrast ratio (1-21), where 21:1 is maximum contrast (black vs white)
 * @see https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
export function contrastRatio(L1: number, L2: number): number {
  const bright = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (bright + 0.05) / (dark + 0.05);
}

/**
 * Determines the best text color (black or white) to use on a given background color
 * for optimal contrast and readability according to WCAG guidelines.
 * @param bg - Background color as a CSS color string
 * @returns Object with optimal text color ("#000000" or "#FFFFFF") and its contrast ratio
 * @example
 * const { color, ratio } = bestTextOn("#3B82F6"); // Returns white text for blue background
 */
export function bestTextOn(bg: string): { color: "#000000" | "#FFFFFF"; ratio: number } {
  try {
    const [r, g, b] = toRgb(bg);
    const L = relLuminance(r, g, b);
    const cW = contrastRatio(L, 1);
    const cB = contrastRatio(L, 0);
    if (cB >= cW) return { color: "#000000", ratio: cB };
    return { color: "#FFFFFF", ratio: cW };
  } catch {
    return { color: "#000000", ratio: 21 };
  }
}

/**
 * A CSS text-shadow value that improves text legibility on backgrounds with low contrast.
 * Applies a subtle dark shadow in all directions (top, bottom, left, right).
 * Use this when the contrast ratio is below 4.5:1 but you still need readable text.
 * @example
 * style={{ textShadow: ratio < 4.5 ? lowContrastShadow : undefined }}
 */
export const lowContrastShadow =
  "0 1px 1px rgba(0,0,0,.6), 0 -1px 1px rgba(0,0,0,.6), 1px 0 1px rgba(0,0,0,.6), -1px 0 1px rgba(0,0,0,.6)";

// -------------------- Date utilities --------------------

/**
 * Formats a timestamp as relative time (e.g., "5m ago", "2h ago", "3d ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return `${days}d ago`;
  }
}

/**
 * Formats a timestamp as a readable date (e.g., "Jan 15, 2024")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a phone number for display (e.g., "(123) 456-7890")
 * @param phoneNumber - Phone number string (may include formatting characters)
 * @returns Formatted phone number string or original if invalid
 */
export function formatPhoneNumber(phoneNumber: string | undefined | null): string {
  if (!phoneNumber) return "";
  
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");
  
  // Format as (XXX) XXX-XXXX if 10 digits, otherwise return original
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  return phoneNumber;
}

/**
 * Decodes HTML entities in a string
 * @param html - HTML string with entities
 * @returns Decoded string
 */
export function decodeHTML(html: string): string {
  if (typeof document === "undefined") {
    // Server-side: simple replacement (may not handle all entities)
    return html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  
  // Client-side: use DOM parser for complete entity decoding
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}
